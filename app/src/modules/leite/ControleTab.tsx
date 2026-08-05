import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Play,
} from "lucide-react";
import { animalsInGroup, useFarm, SHIFT_LABEL } from "../../state/store";
import {
  AbsentValue,
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  Sheet,
  SuccessNotice,
  UnsavedFooter,
  useUnsavedGuard,
  inputCls,
} from "../../components/ui";
import { formatLiters, parseDecimal } from "../../lib/format";
import {
  addDays,
  formatLong,
  formatRelativeDay,
  formatWeekday,
  today,
} from "../../lib/dates";
import { uid } from "../../lib/prng";
import type { HerdGroup, MilkingShift } from "../../domain/types";
import { measurementIn, sessionFor, sessionTotal, shiftsOf } from "./utils";

type Wizard =
  | { step: "dia" }
  | {
      step: "medicao";
      sessionId: string;
      groupId: string;
      shift: MilkingShift;
      animalIds: string[];
      index: number;
    }
  | {
      step: "revisao";
      sessionId: string;
      groupId: string;
      shift: MilkingShift;
      animalIds: string[];
    };

/** Rótulo curto do turno para botões e colunas. */
const SHIFT_SHORT: Record<MilkingShift, string> = {
  manha: "manhã",
  tarde: "tarde",
  unica: "ordenha",
};

// ---------- Navegador de dia ----------

function DayNavigator({
  date,
  onChange,
}: {
  date: string;
  onChange: (d: string) => void;
}) {
  const t = today();
  return (
    <div className="flex items-center gap-1 mb-4">
      <button
        onClick={() => onChange(addDays(date, -1))}
        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl bg-paper-card border border-black/5 text-ink-soft hover:bg-pasture-100"
        aria-label="Dia anterior"
      >
        <ChevronLeft size={18} />
      </button>
      <div className="flex-1 text-center">
        <p className="font-semibold capitalize leading-tight">
          {formatWeekday(date)} · {formatRelativeDay(date)}
        </p>
        <p className="text-xs text-ink-faint">{formatLong(date)}</p>
      </div>
      {date !== t && (
        <button
          onClick={() => onChange(t)}
          className="min-h-[44px] rounded-xl px-3 text-sm font-medium text-pasture-700 hover:bg-pasture-100"
        >
          hoje
        </button>
      )}
      <button
        onClick={() => onChange(addDays(date, 1))}
        disabled={date >= t}
        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl bg-paper-card border border-black/5 text-ink-soft hover:bg-pasture-100 disabled:opacity-40"
        aria-label="Próximo dia"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

// ---------- Célula de medição (um Animal × um turno) ----------

function MeasurementCell({
  sessionId,
  animalId,
  measuredInOtherShift,
  onQuickEntry,
}: {
  sessionId: string | undefined;
  animalId: string;
  measuredInOtherShift: boolean;
  onQuickEntry: () => void;
}) {
  const { state } = useFarm();
  const m = sessionId ? measurementIn(state, sessionId, animalId) : undefined;

  if (m) {
    return (
      <button
        type="button"
        onClick={onQuickEntry}
        className="w-full rounded-xl bg-pasture-100 px-2 py-2.5 text-center hover:bg-pasture-200 min-h-[44px]"
        aria-label="Corrigir medição"
      >
        <p className="tnum font-semibold text-sm">{formatLiters(m.liters)}</p>
      </button>
    );
  }

  // Lacuna: destaque âmbar; um toque registra exatamente esta ordenha.
  return (
    <button
      onClick={onQuickEntry}
      className={`w-full rounded-xl border border-dashed px-2 py-2 min-h-[44px] text-center transition hover:bg-review-200 ${
        measuredInOtherShift
          ? "border-review-500 bg-review-100"
          : "border-review-500/50 bg-review-100/60"
      }`}
    >
      <p className="text-xs font-semibold text-review-700 leading-tight">
        sem medição
      </p>
      <p className="text-[11px] text-review-700/80 leading-tight mt-0.5">
        {measuredInOtherShift ? "só faltou esta — toque p/ registrar" : "Registrar agora"}
      </p>
    </button>
  );
}

// ---------- Cartão do Lote no dia ----------

function GroupCard({
  group,
  date,
  expanded,
  onToggle,
  onStartWalk,
  onQuickEntry,
}: {
  group: HerdGroup;
  date: string;
  expanded: boolean;
  onToggle: () => void;
  onStartWalk: (groupId: string, shift: MilkingShift) => void;
  onQuickEntry: (groupId: string, shift: MilkingShift, animalId: string) => void;
}) {
  const { state } = useFarm();
  const animals = animalsInGroup(state, group.id).filter(
    (a) => a.status === "ativo"
  );
  const shifts = shiftsOf(group);
  const sessions = shifts.map((sh) => sessionFor(state, group.id, date, sh));

  const measuredIn = (animalId: string, shiftIdx: number) => {
    const s = sessions[shiftIdx];
    return s ? measurementIn(state, s.id, animalId) !== undefined : false;
  };

  return (
    <Card className="mb-4">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 px-4 py-3.5 md:px-5 text-left"
        aria-expanded={expanded}
      >
        <span className="min-w-0">
          <span className="block font-semibold truncate">{group.name}</span>
          <span className="block text-xs text-ink-faint mt-0.5">
            {group.milkingsPerDay === 2 ? "2 ordenhas/dia" : "1 ordenha/dia"}
          </span>
        </span>
        <ChevronDown size={18} className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <>
          {/* Totais por turno + ação de registrar */}
          <div className="px-4 py-3 md:px-5 border-b border-black/5 space-y-2">
        {shifts.map((sh, i) => {
          const session = sessions[i];
          const total = session ? sessionTotal(state, session.id) : null;
          const missing = !session || session.status !== "concluido";
          return (
            <div key={sh} className="flex items-center gap-3">
              <div className="flex-1 min-w-0 flex items-baseline gap-2">
                <p className="text-sm text-ink-soft capitalize">
                  {SHIFT_LABEL[sh]}
                </p>
                {session?.status === "em_andamento" && (
                  <Chip tone="pendente">em andamento</Chip>
                )}
              </div>
              {total !== null ? (
                <p className="tnum text-sm font-semibold">
                  {formatLiters(total)}
                </p>
              ) : (
                <AbsentValue />
              )}
              {missing && animals.length > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => onStartWalk(group.id, sh)}
                >
                  <Play size={14} />
                  {session?.status === "em_andamento"
                    ? "Continuar"
                    : `Registrar ${SHIFT_SHORT[sh]}`}
                </Button>
              )}
            </div>
          );
        })}
          </div>

          {animals.length === 0 ? (
            <p className="px-4 py-4 md:px-5 text-sm text-ink-soft">
              Nenhum animal ativo neste Lote.
            </p>
          ) : (
            <div className="px-4 py-2 md:px-5">
          {/* Cabeçalho das colunas de turno */}
          <div
            className={`grid gap-2 py-1.5 ${
              shifts.length === 2
                ? "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]"
                : "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
            }`}
          >
            <span />
            {shifts.map((sh) => (
              <p
                key={sh}
                className="text-[11px] uppercase tracking-wide text-ink-faint text-center"
              >
                {SHIFT_SHORT[sh]}
              </p>
            ))}
          </div>

          <div className="divide-y divide-black/5">
            {animals.map((a) => (
              <div
                key={a.id}
                className={`grid gap-2 py-1.5 items-center ${
                  shifts.length === 2
                    ? "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]"
                    : "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{a.name}</p>
                  {a.tag && (
                    <p className="text-[11px] text-ink-faint truncate">{a.tag}</p>
                  )}
                </div>
                {shifts.map((sh, i) => (
                  <MeasurementCell
                    key={sh}
                    sessionId={sessions[i]?.id}
                    animalId={a.id}
                    measuredInOtherShift={
                      shifts.length === 2 && measuredIn(a.id, i === 0 ? 1 : 0)
                    }
                    onQuickEntry={() => onQuickEntry(group.id, sh, a.id)}
                  />
                ))}
              </div>
            ))}
          </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

// ---------- Registro rápido: um Animal, uma ordenha ----------

function QuickEntrySheet({
  sessionId,
  animalId,
  title,
  onClose,
  onSaved,
}: {
  sessionId: string;
  animalId: string;
  title: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { state, dispatch } = useFarm();
  const animal = state.animals.find((a) => a.id === animalId);
  const existing = measurementIn(state, sessionId, animalId);
  const initial = existing ? String(existing.liters).replace(".", ",") : "";
  const [value, setValue] = useState(initial);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parsed = parseDecimal(value);
  const guard = useUnsavedGuard(
    value.trim() !== "" && (value !== initial || (existing !== undefined && reason.trim() !== "")),
    onClose,
  );

  if (!animal) return null;

  async function submit() {
    if (parsed === null || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch(
      existing
        ? {
            type: "CorrectOperationalFact",
            entityType: "medicao_individual",
            entityId: existing.id,
            newLiters: parsed,
            description: `Correção na medição individual de ${animal!.name}`,
            before: formatLiters(existing.liters),
            after: formatLiters(parsed),
            reason: reason.trim(),
          }
        : {
            type: "RecordIndividualMilkMeasurement",
            sessionId,
            animalId: animal!.id,
            liters: parsed,
          },
    );
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onSaved(`${existing ? "Medição corrigida" : "Medição registrada"} — ${animal!.name} · ${formatLiters(parsed)}`);
    onClose();
  }

  return (
    <Sheet
      open
      onClose={guard.requestClose}
      title={title}
      footer={
        guard.asking ? (
          <UnsavedFooter onKeepEditing={guard.keepEditing} onDiscard={guard.discard} />
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={guard.requestClose} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={submit} disabled={parsed === null || busy || (existing !== undefined && reason.trim() === "")} className="flex-1">
              {busy ? "Salvando…" : existing ? "Confirmar correção" : "Salvar medição"}
            </Button>
          </div>
        )
      }
    >
      <p className="text-center text-lg font-semibold">{animal.name}</p>
      {animal.tag && (
        <p className="text-center text-sm text-ink-faint mb-4">{animal.tag}</p>
      )}
      <input
        autoFocus
        inputMode="decimal"
        placeholder="0,0"
        value={value}
        onChange={(ev) => {
          setValue(ev.target.value);
          setError(null);
        }}
        className="w-full rounded-2xl border border-black/10 bg-white px-4 py-5 text-3xl font-semibold tnum text-center outline-none focus:border-pasture-500 focus:ring-2 focus:ring-pasture-100 transition"
        aria-label={`Medição individual de ${animal.name} em litros`}
      />
      <p className="text-center text-sm text-ink-soft mt-2">
        Medição individual desta ordenha (litros)
      </p>
      {existing && (
        <Field
          label="Motivo da correção"
          hint="Obrigatório — fica na auditoria junto com o antes e o depois."
        >
          <textarea
            className={`${inputCls} min-h-20 resize-y`}
            placeholder="Ex.: conferi a anotação do caderno…"
            value={reason}
            onChange={(ev) => {
              setReason(ev.target.value);
              setError(null);
            }}
          />
        </Field>
      )}
      {error && (
        <p className="text-center text-sm text-danger-600 mt-3" role="alert">
          {error}
        </p>
      )}
    </Sheet>
  );
}

// ---------- Caminho guiado: uma tela por Animal ----------

function MeasurementScreen({
  sessionId,
  groupId,
  shift,
  date,
  animalIds,
  index,
  onAdvance,
  onBack,
}: {
  sessionId: string;
  groupId: string;
  shift: MilkingShift;
  date: string;
  animalIds: string[];
  index: number;
  onAdvance: (nextIndex: number | "revisao") => void;
  onBack: () => void;
}) {
  const { state, dispatch } = useFarm();
  const animal = state.animals.find((a) => a.id === animalIds[index]);
  const existing = measurementIn(state, sessionId, animalIds[index]);
  const initial = existing ? String(existing.liters).replace(".", ",") : "";
  const [value, setValue] = useState(initial);
  const [pendingNav, setPendingNav] = useState<null | (() => void)>(null);
  const parsed = parseDecimal(value);
  const total = animalIds.length;
  const isLast = index === total - 1;
  const group = state.groups.find((g) => g.id === groupId);

  if (!animal) return null;

  // Valor digitado e ainda não salvo: navegar pede confirmação.
  const dirty = value.trim() !== "" && value !== initial;
  const nav = (fn: () => void) => (dirty ? setPendingNav(() => fn) : fn());

  function saveAndAdvance() {
    if (parsed === null) return;
    dispatch({
      type: "RecordIndividualMilkMeasurement",
      sessionId,
      animalId: animal!.id,
      liters: parsed,
    });
    onAdvance(isLast ? "revisao" : index + 1);
  }

  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => nav(onBack)}
          className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink min-h-[44px] -ml-2 px-2"
        >
          <ChevronLeft size={16} /> Voltar
        </button>
        <p className="text-sm text-ink-soft tnum">
          {index + 1} de {total}
        </p>
      </div>

      <div className="h-1.5 rounded-full bg-paper-sunken mb-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-pasture-500 transition-all"
          style={{ width: `${((index + 1) / total) * 100}%` }}
        />
      </div>

      {/* Mapa do rebanho: um ponto por Animal — toque para ir direto a ele. */}
      <div
        className="flex gap-1 overflow-x-auto pb-1 mb-4 -mx-1 px-1"
        role="navigation"
        aria-label="Ir para um Animal"
      >
        {animalIds.map((id, i) => {
          const a = state.animals.find((x) => x.id === id);
          const measured = measurementIn(state, sessionId, id) !== undefined;
          const current = i === index;
          return (
            <button
              key={id}
              onClick={() => nav(() => onAdvance(i))}
              aria-label={`${a?.name ?? "Animal"} — ${measured ? "medido" : "sem medição"}`}
              aria-current={current}
              className="shrink-0 inline-flex items-center justify-center min-w-[28px] h-[28px]"
            >
              <span
                className={`block size-2.5 rounded-full transition ${
                  measured
                    ? "bg-pasture-500"
                    : "bg-ink/15"
                } ${current ? "ring-2 ring-offset-1 ring-pasture-600" : ""}`}
              />
            </button>
          );
        })}
      </div>

      <p className="text-center text-sm text-ink-soft mb-1 capitalize">
        {group?.name} · {SHIFT_LABEL[shift]} · {formatRelativeDay(date)}
      </p>

      <form
        onSubmit={(ev) => {
          ev.preventDefault();
          saveAndAdvance();
        }}
      >
        <p className="text-center text-lg font-semibold">{animal.name}</p>
        {animal.tag && (
          <p className="text-center text-sm text-ink-faint mb-4">{animal.tag}</p>
        )}

        <input
          autoFocus
          inputMode="decimal"
          placeholder="0,0"
          value={value}
          onChange={(ev) => setValue(ev.target.value)}
          className="w-full rounded-2xl border border-black/10 bg-white px-4 py-5 text-3xl font-semibold tnum text-center outline-none focus:border-pasture-500 focus:ring-2 focus:ring-pasture-100 transition"
          aria-label={`Medição individual de ${animal.name} em litros`}
        />
        <p className="text-center text-sm text-ink-soft mt-2 mb-5">
          Medição individual (litros)
        </p>

        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => nav(() => onAdvance(isLast ? "revisao" : index + 1))}
          >
            Pular
          </Button>
          <Button type="submit" className="flex-1" disabled={parsed === null}>
            {isLast ? "Salvar e revisar" : "Salvar e avançar"}
          </Button>
        </div>
      </form>

      {/* Valor digitado ainda não salvo: confirmar antes de sair da tela. */}
      {pendingNav && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-6">
          <div className="w-full max-w-sm rounded-2xl bg-paper-card p-5 shadow-xl">
            <p className="font-semibold">Valor ainda não salvo</p>
            <p className="text-sm text-ink-soft mt-1">
              Você digitou uma medição para {animal.name}. Salve antes de sair,
              ou descarte o valor digitado.
            </p>
            <div className="flex gap-2 mt-4">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setPendingNav(null)}
              >
                Continuar editando
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  const go = pendingNav;
                  setPendingNav(null);
                  go();
                }}
              >
                Descartar valor
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------- Aba Controle ----------

export default function ControleTab() {
  const { state, dispatch } = useFarm();
  const [searchParams] = useSearchParams();
  const initialDate = searchParams.get("date");
  const initialGroupId = searchParams.get("groupId");
  const [date, setDate] = useState(
    initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : today(),
  );
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    () => new Set(initialGroupId ? [initialGroupId] : []),
  );
  const [wizard, setWizard] = useState<Wizard>({ step: "dia" });
  const [quick, setQuick] = useState<{
    sessionId: string;
    animalId: string;
    title: string;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  /** Garante que exista uma sessão para (data, Lote, turno) e devolve o id. */
  function ensureSession(groupId: string, shift: MilkingShift): string {
    const existing = sessionFor(state, groupId, date, shift);
    if (existing) return existing.id;
    const sessionId = uid("cs");
    dispatch({
      type: "StartMilkControlSession",
      date,
      sessionId,
      groupId,
      shift,
    });
    return sessionId;
  }

  function startWalk(groupId: string, shift: MilkingShift) {
    const sessionId = ensureSession(groupId, shift);
    const ids = animalsInGroup(state, groupId)
      .filter((a) => a.status === "ativo")
      .map((a) => a.id);
    if (ids.length === 0) return;
    setWizard({ step: "medicao", sessionId, groupId, shift, animalIds: ids, index: 0 });
  }

  function quickEntry(groupId: string, shift: MilkingShift, animalId: string) {
    const sessionId = ensureSession(groupId, shift);
    const group = state.groups.find((g) => g.id === groupId);
    setQuick({
      sessionId,
      animalId,
      title: `${group?.name ?? "Lote"} · ${SHIFT_LABEL[shift]} · ${formatRelativeDay(date)}`,
    });
  }

  // ----- Etapa: caminho guiado, uma tela por Animal -----
  if (wizard.step === "medicao") {
    return (
      <MeasurementScreen
        key={wizard.index}
        sessionId={wizard.sessionId}
        groupId={wizard.groupId}
        shift={wizard.shift}
        date={date}
        animalIds={wizard.animalIds}
        index={wizard.index}
        onAdvance={(next) =>
          setWizard(
            next === "revisao"
              ? {
                  step: "revisao",
                  sessionId: wizard.sessionId,
                  groupId: wizard.groupId,
                  shift: wizard.shift,
                  animalIds: wizard.animalIds,
                }
              : { ...wizard, index: next }
          )
        }
        onBack={() => setWizard({ step: "dia" })}
      />
    );
  }

  // ----- Etapa: revisão antes de concluir -----
  if (wizard.step === "revisao") {
    const rows = wizard.animalIds.map((id) => {
      const m = state.measurements.find(
        (x) => x.sessionId === wizard.sessionId && x.animalId === id
      );
      const animal = state.animals.find((a) => a.id === id);
      return animal ? { animal, liters: m?.liters ?? null } : null;
    });
    const measured = rows.filter((r) => r?.liters !== null).length;
    const group = state.groups.find((g) => g.id === wizard.groupId);

    return (
      <Card className="p-4 md:p-5">
        <p className="font-semibold mb-1">Revisão do controle</p>
        <p className="text-sm text-ink-soft mb-4 capitalize">
          {group?.name} · {SHIFT_LABEL[wizard.shift]} · {formatRelativeDay(date)}{" "}
          — <span className="tnum">{measured} de {rows.length} animais medidos</span>
        </p>

        <div className="divide-y divide-black/5 mb-5">
          {rows.map(
            (r) =>
              r && (
                <div
                  key={r.animal.id}
                  className="flex items-center justify-between py-2.5"
                >
                  <span>{r.animal.name}</span>
                  {r.liters !== null ? (
                    <span className="tnum font-semibold">
                      {formatLiters(r.liters)}
                    </span>
                  ) : (
                    <AbsentValue />
                  )}
                </div>
              )
          )}
        </div>

        <p className="text-xs text-ink-faint mb-4">
          Quem ficou sem medição continua marcado no dia — dá para registrar
          depois, sem refazer o controle.
        </p>

        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() =>
              setWizard({
                step: "medicao",
                sessionId: wizard.sessionId,
                groupId: wizard.groupId,
                shift: wizard.shift,
                animalIds: wizard.animalIds,
                index: Math.max(0, wizard.animalIds.length - 1),
              })
            }
          >
            Voltar
          </Button>
          <Button
            className="flex-1"
            disabled={completing}
            onClick={async () => {
              setCompleting(true);
              const outcome = await dispatch({
                type: "CompleteMilkControlSession",
                sessionId: wizard.sessionId,
              });
              setCompleting(false);
              if (outcome.ok) {
                setNotice(
                  `Controle concluído — ${group?.name ?? "Lote"} · ${SHIFT_LABEL[wizard.shift]} · ${measured} de ${rows.length} animais medidos`
                );
              }
              setWizard({ step: "dia" });
            }}
          >
            <Check size={16} /> {completing ? "Concluindo…" : "Concluir controle"}
          </Button>
        </div>
      </Card>
    );
  }

  // ----- Visão do dia: um cartão por Lote -----
  return (
    <div>
      <DayNavigator date={date} onChange={setDate} />

      <SuccessNotice message={notice} onDismiss={() => setNotice(null)} />

      {state.groups.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ClipboardList size={28} />}
            title="Nenhum Lote cadastrado"
            hint="Cadastre um Lote para começar o Controle leiteiro."
          />
        </Card>
      ) : (
        state.groups.map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            date={date}
            expanded={expandedGroups.has(g.id)}
            onToggle={() => setExpandedGroups((current) => {
              const next = new Set(current);
              if (next.has(g.id)) next.delete(g.id);
              else next.add(g.id);
              return next;
            })}
            onStartWalk={startWalk}
            onQuickEntry={quickEntry}
          />
        ))
      )}

      {quick && (
        <QuickEntrySheet
          sessionId={quick.sessionId}
          animalId={quick.animalId}
          title={quick.title}
          onClose={() => setQuick(null)}
          onSaved={setNotice}
        />
      )}
    </div>
  );
}
