import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Beef,
  Calendar,
  Check,
  Clock,
  Hash,
  Layers,
  Quote,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import type {
  Animal,
  AssistantProposal,
  ProposalField,
} from "../../domain/types";
import { captureOf, pendingProposals, useFarm } from "../../state/store";
import { formatLong, today } from "../../lib/dates";
import { parseMilkLiters } from "../../lib/format";
import {
  Button,
  Chip,
  FactNatureChip,
  Field,
  inputCls,
} from "../../components/ui";
import {
  guessNewAnimal,
  matchAnimalLabel,
  normalizeLabel,
  type Suggestion,
} from "./matching";
import {
  assignmentReview,
  exactAnimalDuplicate,
} from "./reviewLogic";
import {
  CONFIDENCE_DOT,
  CONFIDENCE_LABEL,
  KIND_LABEL,
  captureAttachmentUrl,
  captureImageReferences,
  formatWhen,
} from "./helpers";

// ---------- Estado de revisão por campo ----------

interface FieldReview {
  key: string;
  label: string;
  confidence: ProposalField["confidence"];
  original: string;
  value: string;
  acknowledged: boolean; // campos 'alta' nascem conferidos
}

interface RowReview {
  rawLabel: string; // rótulo original da Captura, sempre preservado
  original: string; // litros originais (texto)
  value: string; // litros editáveis
  animalId: string | null; // vínculo decidido na Revisão
  animalName: string | null;
  probable: boolean; // vínculo provável: exige um toque para confirmar
  suggestions: Suggestion[];
  acknowledged: boolean;
  /** Escolha humana exigida quando a Lotação não bate com o Lote do Controle. */
  assignmentAction?: "move" | "keep";
  /** Evita reutilizar uma escolha após trocar Animal, Lote ou data. */
  assignmentDecisionFor?: string;
}

function initFields(p: AssistantProposal): FieldReview[] {
  return p.fields.map((f) => ({
    key: f.key,
    label: f.label,
    confidence: f.confidence,
    original: f.value,
    value: f.value,
    acknowledged: f.confidence === "alta",
  }));
}

function initRows(p: AssistantProposal, animals: Animal[]): RowReview[] | null {
  const rowsField = p.fields.find((f) => f.key === "rows");
  if (!rowsField) return null;
  return rowsField.value
    .split("·")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.+?)\s*(?:-\s*)?(\d{1,3}(?:[,.]\d+)?)$/);
      const rawLabel = m ? m[1] : part;
      const liters = m ? m[2] : "";
      const match = matchAnimalLabel(rawLabel, animals);
      return {
        rawLabel,
        original: liters,
        value: liters,
        animalId: match.animal?.id ?? null,
        animalName: match.animal?.name ?? null,
        probable: match.status === "provavel",
        suggestions: match.suggestions,
        // Reconhecimento exato nasce conferido; provável/não reconhecido, não.
        acknowledged: match.status === "exata",
      };
    });
}

function StepTitle({ n, children }: { n: number; children: string }) {
  return (
    <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint mb-2">
      {n} · {children}
    </h3>
  );
}

/** Destaca no texto original o trecho normalizado que casou no matching. */
function Highlighted({ text, highlight }: { text: string; highlight: string }) {
  const i = normalizeLabel(text).indexOf(highlight);
  if (!highlight || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <span className="font-bold underline underline-offset-2">
        {text.slice(i, i + highlight.length)}
      </span>
      {text.slice(i + highlight.length)}
    </>
  );
}

export function ReviewSheet({
  proposalId,
  onClose,
  onConfirmed,
}: {
  proposalId: string;
  onClose: () => void;
  /** Chamado após a Confirmação: resumo do que virou Registro. */
  onConfirmed: (proposal: AssistantProposal, summary: string) => void;
}) {
  const { state, dispatch } = useFarm();
  const proposal = state.proposals.find((p) => p.id === proposalId);
  const capture = proposal ? captureOf(state, proposal.captureId) : undefined;

  const [fields, setFields] = useState<FieldReview[]>(() =>
    proposal ? initFields(proposal) : []
  );
  const [rows, setRows] = useState<RowReview[] | null>(() =>
    proposal ? initRows(proposal, state.animals) : null
  );
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [materializeError, setMaterializeError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [cadastro, setCadastro] = useState<{
    row: number;
    name: string;
    tag: string;
    createConfirmed: boolean;
  } | null>(null);
  const [cadastroBusy, setCadastroBusy] = useState(false);
  const [cadastroError, setCadastroError] = useState<string | null>(null);
  const [pendingBind, setPendingBind] = useState<{
    row: number;
    name: string;
    tag: string;
  } | null>(null);

  const pendingCount = pendingProposals(state).length;

  // Após "Cadastrar e vincular": quando o Animal novo aparece no estado,
  // vincula a linha que pediu o cadastro.
  useEffect(() => {
    if (!pendingBind) return;
    const found = pendingBind.tag
      ? state.animals.find(
          (animal) =>
            animal.status === "ativo" &&
            normalizeLabel(animal.tag ?? "") === normalizeLabel(pendingBind.tag),
        )
      : state.animals.find(
          (animal) =>
            animal.status === "ativo" &&
            normalizeLabel(animal.name) === normalizeLabel(pendingBind.name),
        );
    if (!found) return;
    setRows(
      (rs) =>
        rs &&
        rs.map((r, i) =>
          i === pendingBind.row
            ? {
                ...r,
                animalId: found.id,
                animalName: found.name,
                probable: false,
                acknowledged: true,
                assignmentAction: undefined,
                assignmentDecisionFor: undefined,
              }
            : r
        )
    );
    setPendingBind(null);
    setCadastro(null);
  }, [state.animals, pendingBind]);

  const get = (k: string) => fields.find((f) => f.key === k)?.value ?? "";
  const reviewedDate = get("date");
  const resolvedGroup = state.groups.find(
    (g) => normalizeLabel(g.name) === normalizeLabel(get("group"))
  );
  const cadastroDuplicate = cadastro
    ? exactAnimalDuplicate(state.animals, cadastro.name.trim(), cadastro.tag.trim())
    : undefined;
  const cadastroSuggestions =
    cadastro && !cadastroDuplicate
      ? matchAnimalLabel(
          `${cadastro.name} ${cadastro.tag}`.trim(),
          state.animals,
        ).suggestions
      : [];

  const assignmentFor = (r: RowReview) =>
    assignmentReview(
      state.assignments,
      state.groups,
      r.animalId,
      resolvedGroup,
      reviewedDate
    );
  const hasCurrentAssignmentDecision = (r: RowReview) => {
    const review = assignmentFor(r);
    return (
      !review.needsDecision ||
      (r.assignmentDecisionFor === review.decisionKey &&
        (r.assignmentAction === "move" || r.assignmentAction === "keep"))
    );
  };

  const rowOk = (r: RowReview) =>
    r.animalId !== null &&
    (r.acknowledged || r.value !== r.original) &&
    parseMilkLiters(r.value) !== null &&
    hasCurrentAssignmentDecision(r);

  const fieldUnits = fields.filter((field) => field.key !== "rows");
  const progress = {
    total: fieldUnits.length + (rows ?? []).length,
    done:
      fieldUnits.filter(
        (field) => field.acknowledged || field.value !== field.original,
      ).length + (rows ?? []).filter(rowOk).length,
  };

  if (!proposal) return null;

  const groupOk = proposal.kind !== "controle_leiteiro" || Boolean(resolvedGroup);
  const allChecked = progress.done === progress.total && groupOk;
  const chosenMoves = (rows ?? []).filter((row) => {
    const review = assignmentFor(row);
    return (
      row.assignmentAction === "move" &&
      row.assignmentDecisionFor === review.decisionKey
    );
  });
  const chosenKeeps = (rows ?? []).filter((row) => {
    const review = assignmentFor(row);
    return (
      review.needsDecision &&
      row.assignmentAction === "keep" &&
      row.assignmentDecisionFor === review.decisionKey
    );
  });

  // Qualquer interação após uma falha de registro limpa o aviso; a primeira
  // já marca a Revisão como alterada (sair pede confirmação de descarte).
  const touch = () => {
    setDirty(true);
    setMaterializeError(null);
  };
  const updateField = (key: string, value: string) => {
    touch();
    setFields((fs) => fs.map((f) => (f.key === key ? { ...f, value } : f)));
    if (key === "date" || key === "group") {
      setRows(
        (rs) =>
          rs &&
          rs.map((row) => ({
            ...row,
            assignmentAction: undefined,
            assignmentDecisionFor: undefined,
          }))
      );
    }
  };
  const ackField = (key: string) => {
    touch();
    setFields((fs) =>
      fs.map((f) => (f.key === key ? { ...f, acknowledged: true } : f))
    );
  };
  const updateRow = (i: number, value: string) => {
    touch();
    setRows((rs) => rs && rs.map((r, j) => (j === i ? { ...r, value } : r)));
  };
  const bindRow = (i: number, a: Animal) => {
    touch();
    setRows(
      (rs) =>
        rs &&
        rs.map((r, j) =>
          j === i
            ? {
                ...r,
                animalId: a.id,
                animalName: a.name,
                probable: false,
                acknowledged: true,
                assignmentAction: undefined,
                assignmentDecisionFor: undefined,
              }
            : r
        )
    );
  };
  const ackRow = (i: number) => {
    touch();
    setRows(
      (rs) =>
        rs && rs.map((r, j) => (j === i ? { ...r, acknowledged: true } : r))
    );
  };
  const chooseAssignmentAction = (i: number, action: "move" | "keep") => {
    const row = rows?.[i];
    if (!row) return;
    const review = assignmentFor(row);
    if (!review.needsDecision || !review.decisionKey) return;
    touch();
    setRows(
      (rs) =>
        rs &&
        rs.map((r, j) =>
          j === i
            ? {
                ...r,
                assignmentAction: action,
                assignmentDecisionFor: review.decisionKey ?? undefined,
              }
            : r
        )
    );
  };

  // Fechar com alterações feitas pede confirmação (alterações não salvas).
  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirmClose(true);
    else onClose();
  };

  const openCadastro = (i: number) => {
    if (!rows) return;
    touch();
    setCadastroError(null);
    const guess = guessNewAnimal(rows[i].rawLabel);
    setCadastro({ row: i, name: guess.name, tag: guess.tag, createConfirmed: false });
  };

  const saveCadastro = async () => {
    if (!cadastro || !cadastro.name.trim() || cadastroBusy) return;
    const name = cadastro.name.trim();
    const tag = cadastro.tag.trim();
    if (cadastroDuplicate) return;
    if (cadastroSuggestions.length > 0 && !cadastro.createConfirmed) return;
    setCadastroBusy(true);
    setCadastroError(null);
    const outcome = await dispatch({
      type: "RegisterAnimal",
      name,
      ...(tag ? { tag } : {}),
      ...(resolvedGroup ? { groupId: resolvedGroup.id } : {}),
      date: get("date") || today(),
    });
    setCadastroBusy(false);
    if (!outcome.ok) {
      setCadastroError(
        `Não consegui cadastrar ${name} — ${outcome.message} Corrija e tente de novo.`
      );
      return;
    }
    setPendingBind({ row: cadastro.row, name, tag });
  };

  const confirm = async () => {
    if (!allChecked || busy) return;
    setBusy(true);
    // Monta os campos revisados (linhas do controle viram o campo "rows").
    const finalFields: ProposalField[] = fields.map((f) => ({
      key: f.key,
      label: f.label,
      confidence: f.confidence,
      value:
        f.key === "rows" && rows
          ? rows.map((r) => `${r.rawLabel} ${r.value}`).join(" · ")
          : f.value,
    }));
    const bindings = rows
      ? rows
          .filter((r) => r.animalId !== null && parseMilkLiters(r.value) !== null)
          .map((r) => {
            const review = assignmentFor(r);
            return {
              animalId: r.animalId!,
              liters: parseMilkLiters(r.value)!,
              ...(review.needsDecision &&
              r.assignmentDecisionFor === review.decisionKey &&
              r.assignmentAction
                ? { assignmentAction: r.assignmentAction }
                : {}),
            };
          })
          : undefined;
    const confirmed = await dispatch({
      type: "ConfirmAssistantProposal",
      proposalId: proposal.id,
      fields: finalFields,
      bindings,
    });
    if (!confirmed.ok) {
      setBusy(false);
      setMaterializeError(confirmed.message);
      return;
    }
    const result = confirmed.result as { summary?: string } | null;
    onConfirmed(proposal, result?.summary ?? "Proposta confirmada.");
  };

  const dismiss = () => {
    dispatch({
      type: "DismissAssistantProposal",
      proposalId: proposal.id,
      reason: reason.trim() || undefined,
    });
    onClose();
  };

  // ---------- Contexto reconhecido (a partir dos valores revisados) ----------
  const contextItems: { icon: typeof Calendar; label: string; value: string }[] = [];
  if (get("date"))
    contextItems.push({
      icon: Calendar,
      label: "Data",
      value: /^\d{4}-\d{2}-\d{2}$/.test(get("date"))
        ? formatLong(get("date"))
        : get("date"),
    });
  if (get("group"))
    contextItems.push({ icon: Layers, label: "Lote", value: get("group") });
  if (get("shift"))
    contextItems.push({ icon: Clock, label: "Ordenha", value: get("shift") });
  if (get("time"))
    contextItems.push({ icon: Clock, label: "Horário", value: get("time") });
  if (rows && rows.length > 0)
    contextItems.push({
      icon: Beef,
      label: "Medições na lista",
      value: `${rows.length}`,
    });
  if (get("kind"))
    contextItems.push({ icon: Wallet, label: "Tipo", value: get("kind") });

  const longField = (k: string) => k === "rows" || k === "description";

  // Turnos possíveis conforme o Lote escolhido (1 ordenha/dia → ordenha única).
  const shiftOptions =
    resolvedGroup?.milkingsPerDay === 1
      ? ["ordenha única"]
      : ["manhã", "tarde"];
  if (get("shift") && !shiftOptions.includes(get("shift")))
    shiftOptions.push(get("shift"));

  const renderFieldInput = (f: FieldReview) => {
    if (f.key === "date")
      return (
        <input
          type="date"
          className={inputCls}
          value={f.value}
          onChange={(e) => updateField(f.key, e.target.value)}
        />
      );
    if (f.key === "group")
      return (
        <select
          className={inputCls}
          value={f.value}
          onChange={(e) => updateField(f.key, e.target.value)}
        >
          <option value="">Escolha o Lote…</option>
          {state.groups.map((g) => (
            <option key={g.id} value={g.name}>
              {g.name}
              {g.milkingsPerDay === 1 ? " (1 ordenha/dia)" : ""}
            </option>
          ))}
          {f.value && !state.groups.some((g) => g.name === f.value) && (
            <option value={f.value}>{f.value} (não encontrado)</option>
          )}
        </select>
      );
    if (f.key === "shift")
      return (
        <select
          className={inputCls}
          value={f.value}
          onChange={(e) => updateField(f.key, e.target.value)}
        >
          {shiftOptions.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      );
    if (longField(f.key))
      return (
        <textarea
          className={`${inputCls} min-h-20`}
          value={f.value}
          onChange={(e) => updateField(f.key, e.target.value)}
        />
      );
    return (
      <input
        className={inputCls}
        value={f.value}
        onChange={(e) => updateField(f.key, e.target.value)}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-paper flex flex-col relative">
      {/* Cabeçalho */}
      <header className="flex items-center gap-2 px-4 py-3 border-b border-black/5 bg-paper-card shrink-0">
        <button
          onClick={requestClose}
          aria-label="Fechar revisão"
          className="p-2 -ml-2 text-ink-soft min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <X size={20} />
        </button>
        <div className="min-w-0">
          <p className="font-semibold leading-tight">Revisão da Proposta</p>
          <p className="text-xs text-ink-soft truncate">{proposal.title}</p>
        </div>
        <span className="ml-auto shrink-0">
          <FactNatureChip nature="proposta" />
        </span>
      </header>

      {/* Corpo */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-4 py-5 space-y-7">
          {/* 1 · Origem */}
          <section>
            <StepTitle n={1}>Origem</StepTitle>
            <div className="rounded-2xl border border-black/5 bg-paper-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <FactNatureChip nature="captura" />
                {capture && (
                  <span className="text-xs text-ink-faint">
                    {formatWhen(capture.createdAt)}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Quote size={16} className="text-ink-faint shrink-0 mt-0.5" />
                <div className="space-y-2 text-sm text-ink-soft italic">
                  {capture?.text && <p>Texto informado: {capture.text}</p>}
                  {capture?.extractedText && <p>Leitura literal da foto: {capture.extractedText}</p>}
                  {!capture?.text && !capture?.extractedText && (
                    <p>Foto capturada; leitura original indisponível.</p>
                  )}
                </div>
              </div>
              {capture && captureImageReferences(capture).map((id) => (
                <details key={id} className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-pasture-700">
                    Ver foto original
                  </summary>
                  <img
                    src={captureAttachmentUrl(capture.id, id)}
                    alt="Foto original da Captura"
                    className="mt-2 max-h-80 w-full rounded-xl border border-black/10 object-contain bg-ink/[0.02]"
                  />
                </details>
              ))}
            </div>
          </section>

          {/* 2 · Contexto */}
          <section>
            <StepTitle n={2}>Contexto reconhecido</StepTitle>
            <div className="rounded-2xl border border-black/5 bg-paper-card divide-y divide-black/5">
              {contextItems.length === 0 && (
                <p className="p-4 text-sm text-ink-faint">
                  Nenhum contexto identificado.
                </p>
              )}
              {contextItems.map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 px-4 py-3">
                  <Icon size={16} className="text-ink-faint shrink-0" />
                  <span className="text-sm text-ink-soft">{label}</span>
                  <span className="ml-auto text-sm font-medium tnum text-right">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          </section>

          {/* 3 · Fatos */}
          <section>
            <StepTitle n={3}>Fatos a revisar</StepTitle>
            <div className="rounded-2xl border border-black/5 bg-paper-card p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Chip tone="proposta">{KIND_LABEL[proposal.kind]}</Chip>
              </div>

              {fields
                .filter((f) => f.key !== "rows")
                .map((f) => {
                  const edited = f.value !== f.original;
                  const checked = f.acknowledged || edited;
                  return (
                    <div key={f.key}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${CONFIDENCE_DOT[f.confidence]}`}
                          title={CONFIDENCE_LABEL[f.confidence]}
                        />
                        <span className="text-sm font-medium">{f.label}</span>
                        <span className="text-xs text-ink-faint">
                          {CONFIDENCE_LABEL[f.confidence]}
                        </span>
                        {edited && (
                          <span className="rounded-full bg-ink/5 text-ink-soft px-2 py-0.5 text-[11px] font-medium">
                            editado por você
                          </span>
                        )}
                        {!checked && (
                          <button
                            onClick={() => ackField(f.key)}
                            className="ml-auto inline-flex items-center gap-1 rounded-full border border-pasture-500 text-pasture-700 px-3 min-h-[44px] text-xs font-semibold"
                          >
                            <Check size={13} /> Conferir
                          </button>
                        )}
                        {checked && f.confidence !== "alta" && (
                          <span className="ml-auto inline-flex items-center gap-1 text-pasture-700 text-xs font-medium">
                            <Check size={13} /> conferido
                          </span>
                        )}
                      </div>
                      <Field label="" hint={undefined}>
                        {renderFieldInput(f)}
                      </Field>
                      {edited && (
                        <p className="text-xs text-ink-faint mt-1">
                          valor original:{" "}
                          <span className="line-through">{f.original}</span>
                        </p>
                      )}
                    </div>
                  );
                })}

              {/* Linhas do Controle leiteiro — vínculo + conferência por linha */}
              {rows && (
                <div>
                  <p className="text-sm font-medium mb-2">
                    Medições individuais
                  </p>
                  <div className="space-y-2">
                    {rows.map((r, i) => {
                      const edited = r.value !== r.original;
                      const bound = r.animalId !== null;
                      const assignment = bound ? assignmentFor(r) : null;
                      const needsAssignmentDecision = assignment?.needsDecision ?? false;
                      const assignmentDecisionCurrent = hasCurrentAssignmentDecision(r);
                      const ok = rowOk(r);
                      return (
                        <div
                          key={`${r.rawLabel}-${i}`}
                          className={`rounded-xl border p-3 ${
                            ok
                              ? "border-black/5"
                              : "border-review-500/40 bg-review-100/50"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                ok ? "bg-pasture-500" : "bg-review-500"
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {bound ? r.animalName : `“${r.rawLabel}”`}
                              </p>
                              {bound && (
                                <p className="text-xs text-ink-faint truncate">
                                  “{r.rawLabel}” na captura
                                </p>
                              )}
                            </div>
                            <input
                              className={`${inputCls} !w-20 text-right`}
                              inputMode="decimal"
                              value={r.value}
                              onChange={(e) => updateRow(i, e.target.value)}
                              aria-label={`Medição de ${r.rawLabel}`}
                            />
                            <span className="text-xs text-ink-faint">L</span>
                            {ok ? (
                              <span className="inline-flex items-center justify-center text-pasture-700 min-h-[36px] min-w-[36px]">
                                <Check size={15} />
                              </span>
                            ) : bound ? (
                              <button
                                onClick={() => ackRow(i)}
                                aria-label={`Confirmar vínculo de ${r.rawLabel} com ${r.animalName}`}
                                className="inline-flex items-center gap-1 rounded-full border border-pasture-500 text-pasture-700 px-3 min-h-[44px] text-xs font-semibold"
                              >
                                <Check size={13} /> É {r.animalName}
                              </button>
                            ) : null}
                          </div>
                          {r.value.trim() && parseMilkLiters(r.value) === null && (
                            <p className="text-xs text-review-700 mt-1.5" role="alert">
                              Informe um volume entre 0 e 100 L, usando apenas um número, como 12,5 ou 12.5.
                            </p>
                          )}
                          {edited && (
                            <p className="text-xs text-ink-faint mt-1.5">
                              <span className="rounded-full bg-ink/5 text-ink-soft px-2 py-0.5 text-[11px] font-medium mr-1.5">
                                editado por você
                              </span>
                              valor original:{" "}
                              <span className="line-through">{r.original}</span>
                            </p>
                          )}
                          {bound && r.probable && !ok && (
                            <p className="text-xs text-review-700 mt-1.5">
                              Vínculo provável — toque para confirmar que é
                              este Animal.
                            </p>
                          )}
                          {bound && needsAssignmentDecision && assignment && (
                            <div className="mt-3 rounded-xl border border-review-500/40 bg-review-100 px-3 py-3" role="alert">
                              <div className="flex gap-2">
                                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-review-700" />
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-review-700">Lotação diferente na data da medição</p>
                                  <p className="mt-0.5 text-xs text-review-700">
                                    {assignment.currentGroup
                                      ? `${r.animalName} estava no ${assignment.currentGroup.name} em ${formatLong(reviewedDate)}.`
                                      : `${r.animalName} não tem Lotação em ${formatLong(reviewedDate)}.`}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 grid gap-2">
                                <button
                                  onClick={() => chooseAssignmentAction(i, "move")}
                                  className={`min-h-[44px] rounded-xl border px-3 text-left text-sm font-semibold ${r.assignmentAction === "move" && assignmentDecisionCurrent ? "border-pasture-600 bg-pasture-100 text-pasture-800" : "border-review-500/50 bg-white text-review-700"}`}
                                >
                                  Mover para {resolvedGroup?.name} em {formatLong(reviewedDate)}
                                </button>
                                <button
                                  onClick={() => chooseAssignmentAction(i, "keep")}
                                  className={`min-h-[44px] rounded-xl border px-3 text-left text-sm font-semibold ${r.assignmentAction === "keep" && assignmentDecisionCurrent ? "border-pasture-600 bg-pasture-100 text-pasture-800" : "border-review-500/50 bg-white text-review-700"}`}
                                >
                                  {assignment.currentGroup
                                    ? `Manter no ${assignment.currentGroup.name} e registrar só a Medição`
                                    : "Manter sem Lote e registrar só a Medição"}
                                </button>
                              </div>
                              {!assignmentDecisionCurrent && (
                                <p className="mt-2 text-xs font-medium text-review-700">Escolha como tratar a Lotação para confirmar esta medição.</p>
                              )}
                            </div>
                          )}
                          {!bound && (
                            <div className="mt-2">
                              <p className="text-xs text-review-700 mb-1.5">
                                {r.suggestions.length > 0
                                  ? `Não reconheci “${r.rawLabel}”. Você quis dizer:`
                                  : `Não reconheci “${r.rawLabel}” e não encontrei animal parecido — cadastre:`}
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {r.suggestions.map((s) => (
                                  <button
                                    key={s.animal.id}
                                    onClick={() => bindRow(i, s.animal)}
                                    className="inline-flex items-center rounded-full border border-review-500/50 bg-white text-review-700 px-3 min-h-[44px] text-sm font-medium"
                                  >
                                    {s.via === "nome" ? (
                                      <Highlighted
                                        text={s.animal.name}
                                        highlight={s.highlight}
                                      />
                                    ) : (
                                      s.animal.name
                                    )}
                                    {s.animal.tag ? (
                                      <>
                                        {" · "}
                                        {s.via === "brinco" ? (
                                          <Highlighted
                                            text={s.animal.tag}
                                            highlight={s.highlight}
                                          />
                                        ) : (
                                          s.animal.tag
                                        )}
                                      </>
                                    ) : (
                                      ""
                                    )}
                                  </button>
                                ))}
                                <button
                                  onClick={() => openCadastro(i)}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-pasture-500 bg-white text-pasture-700 px-3 min-h-[44px] text-sm font-semibold"
                                >
                                  <UserPlus size={15} /> Cadastrar animal
                                </button>
                              </div>
                              {cadastro?.row === i && (
                                <div className="mt-3 space-y-2 border-t border-black/5 pt-3">
                                  <Field label="Nome do animal">
                                    <input
                                      className={inputCls}
                                      value={cadastro.name}
                                      onChange={(e) =>
                                        setCadastro({
                                          ...cadastro,
                                          name: e.target.value,
                                          createConfirmed: false,
                                        })
                                      }
                                    />
                                  </Field>
                                  <Field label="Brinco (opcional)">
                                    <input
                                      className={inputCls}
                                      value={cadastro.tag}
                                      onChange={(e) =>
                                        setCadastro({
                                          ...cadastro,
                                          tag: e.target.value,
                                          createConfirmed: false,
                                        })
                                      }
                                    />
                                  </Field>
                                  {(() => {
                                    if (cadastroDuplicate) return (
                                      <div className="rounded-xl border border-review-500/40 bg-review-100 p-3">
                                        <p className="text-xs text-review-700">Já existe um Animal com esse nome ou brinco.</p>
                                        <button onClick={() => bindRow(i, cadastroDuplicate)} className="mt-2 min-h-[44px] rounded-xl border border-pasture-500 bg-white px-3 text-sm font-semibold text-pasture-700">
                                          Vincular a {cadastroDuplicate.name}{cadastroDuplicate.tag ? ` · ${cadastroDuplicate.tag}` : ""}
                                        </button>
                                      </div>
                                    );
                                    if (cadastroSuggestions.length === 0) return null;
                                    return (
                                      <div className="rounded-xl border border-review-500/40 bg-review-100 p-3">
                                        <p className="text-xs text-review-700">Antes de cadastrar, confira estes Animais parecidos:</p>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {cadastroSuggestions.map((suggestion) => (
                                            <button key={suggestion.animal.id} onClick={() => bindRow(i, suggestion.animal)} className="min-h-[44px] rounded-full border border-review-500/50 bg-white px-3 text-sm font-medium text-review-700">
                                              Vincular a {suggestion.animal.name}{suggestion.animal.tag ? ` · ${suggestion.animal.tag}` : ""}
                                            </button>
                                          ))}
                                        </div>
                                        {!cadastro.createConfirmed && (
                                          <button onClick={() => setCadastro({ ...cadastro, createConfirmed: true })} className="mt-2 min-h-[44px] text-sm font-semibold text-review-700 underline underline-offset-2">
                                            Cadastrar mesmo assim
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  {resolvedGroup && (
                                    <p className="text-xs text-ink-faint">
                                      Vai entrar no {resolvedGroup.name}.
                                    </p>
                                  )}
                                  {cadastroError && (
                                    <p
                                      className="text-xs text-danger-600"
                                      role="alert"
                                    >
                                      {cadastroError}
                                    </p>
                                  )}
                                  <div className="flex gap-2">
                                    <Button
                                      variant="ghost"
                                      className="flex-1"
                                      onClick={() => {
                                        setCadastro(null);
                                        setCadastroError(null);
                                      }}
                                    >
                                      Cancelar
                                    </Button>
                                    <Button
                                      variant="secondary"
                                      className="flex-1"
                                      disabled={
                                        !cadastro.name.trim() ||
                                        cadastroBusy ||
                                        Boolean(cadastroDuplicate) ||
                                        (cadastroSuggestions.length > 0 && !cadastro.createConfirmed)
                                      }
                                      onClick={saveCadastro}
                                    >
                                      {cadastroBusy
                                        ? "Cadastrando…"
                                        : "Cadastrar e vincular"}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Issues da interpretação */}
              {proposal.issues.length > 0 && (
                <div className="space-y-2 pt-1">
                  {proposal.issues.map((issue, i) => (
                    <div
                      key={i}
                      className="flex gap-2 rounded-xl bg-review-100 text-review-700 px-3 py-2.5 text-sm"
                    >
                      <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* 4 · Consequências */}
          <section>
            <StepTitle n={4}>Consequências</StepTitle>
            <div className="rounded-2xl border border-black/5 bg-paper-card p-4">
              <p className="text-sm text-ink-soft mb-3">
                Ao confirmar, vira Registro:
              </p>
              <ul className="space-y-2">
                {proposal.consequences.map((c, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <Check size={16} className="text-pasture-600 shrink-0 mt-0.5" />
                    <span>{c}</span>
                  </li>
                ))}
                {chosenMoves.map((row) => (
                  <li key={`move-${row.animalId}`} className="flex gap-2 text-sm">
                    <Check size={16} className="text-pasture-600 shrink-0 mt-0.5" />
                    <span>
                      Lotação de {row.animalName} movida para {resolvedGroup?.name} em {formatLong(reviewedDate)}.
                    </span>
                  </li>
                ))}
                {chosenKeeps.map((row) => {
                  const currentGroup = assignmentFor(row).currentGroup;
                  return (
                    <li key={`keep-${row.animalId}`} className="flex gap-2 text-sm">
                      <Check size={16} className="text-pasture-600 shrink-0 mt-0.5" />
                      <span>
                        Lotação de {row.animalName} {currentGroup
                          ? `mantida no ${currentGroup.name}`
                          : "mantida sem Lote"}; somente a Medição será registrada.
                      </span>
                    </li>
                  );
                })}
              </ul>
              {proposal.confirmedRecordIds.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {proposal.confirmedRecordIds.map((id) => (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 text-xs text-pasture-700 underline underline-offset-2"
                    >
                      <Hash size={11} />
                      {id}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Rodapé — ações */}
      <footer className="border-t border-black/5 bg-paper-card px-4 py-3 safe-bottom shrink-0">
        <div className="mx-auto max-w-2xl">
          {dismissing ? (
            <div className="space-y-3">
              <Field label="Motivo do descarte (opcional)">
                <input
                  className={inputCls}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: valor incorreto, captura duplicada…"
                />
              </Field>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setDismissing(false)}
                >
                  Voltar
                </Button>
                <Button variant="danger" className="flex-1" onClick={dismiss}>
                  Confirmar descarte
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {materializeError && (
                <div
                  className="flex items-start gap-2 rounded-xl bg-danger-100/60 text-danger-600 px-3 py-2.5 text-sm"
                  role="alert"
                >
                  <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                  <span>{materializeError}</span>
                </div>
              )}
              <p className="text-xs text-ink-faint text-center">
                <span className="tnum font-semibold text-ink-soft">
                  {progress.done} de {progress.total} conferidos
                </span>
                {allChecked
                  ? " — pode confirmar."
                  : " — confira cada campo e vincule cada medição."}
                {pendingCount > 1 &&
                  ` · ${pendingCount - 1} ${
                    pendingCount - 1 === 1
                      ? "proposta aguardando"
                      : "propostas aguardando"
                  } na fila`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  className="flex-1"
                  onClick={() => setDismissing(true)}
                >
                  Descartar
                </Button>
                <Button
                  className="flex-[2]"
                  disabled={!allChecked || busy}
                  onClick={confirm}
                >
                  {busy ? (
                    "Registrando…"
                  ) : (
                    <>
                      <Check size={16} /> Confirmar
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </footer>

      {/* Alterações não salvas: confirmação antes de sair da Revisão */}
      {confirmClose && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-ink/40 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-paper-card p-5 shadow-xl">
            <p className="font-semibold">Sair da Revisão?</p>
            <p className="text-sm text-ink-soft mt-1">
              Você fez alterações nesta proposta. Se sair agora, elas serão
              perdidas.
            </p>
            <div className="flex gap-2 mt-4">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setConfirmClose(false)}
              >
                Continuar revisando
              </Button>
              <Button variant="danger" className="flex-1" onClick={onClose}>
                Sair e perder
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
