import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Archive,
  ArrowRightLeft,
  ChevronLeft,
  Pencil,
  History,
  Milk,
} from "lucide-react";
import { groupOf, SHIFT_LABEL, today, useFarm } from "../../state/store";
import type { MilkingShift } from "../../domain/types";
import {
  AbsentValue,
  Button,
  Card,
  Chip,
  CoverageBadge,
  EmptyState,
  FactNatureChip,
  Field,
  InlineError,
  PageHeader,
  SectionTitle,
  Sheet,
  SuccessNotice,
  UnsavedFooter,
  inputCls,
  useUnsavedGuard,
} from "../../components/ui";
import { formatLiters } from "../../lib/format";
import { formatLong } from "../../lib/dates";

export default function AnimalPage() {
  const { animalId } = useParams();
  const { state } = useFarm();
  const animal = state.animals.find((a) => a.id === animalId);

  if (!animal) {
    return (
      <Card>
        <EmptyState
          title="Animal não encontrado"
          hint="O cadastro pode ter sido removido ou o endereço está incorreto."
          action={
            <Link to="/rebanho">
              <Button variant="secondary">Voltar ao Rebanho</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const lote = groupOf(state, animal.id);

  return (
    <div>
      <Link
        to="/rebanho"
        className="inline-flex items-center gap-1 text-sm font-medium text-pasture-700 hover:text-pasture-900 mb-3 min-h-[44px] -mt-2"
      >
        <ChevronLeft size={16} />
        Rebanho
      </Link>

      <PageHeader
        title={animal.name}
        subtitle={[animal.tag, lote ? lote.name : "Sem lote"]
          .filter(Boolean)
          .join(" · ")}
        action={
          animal.status === "arquivado" ? (
            <Chip tone="neutro">arquivado</Chip>
          ) : (
            <Chip tone="confirmada">ativo</Chip>
          )
        }
      />

      {animal.status === "arquivado" && (
        <Card className="p-4 mb-5 flex items-start gap-3">
          <Archive size={18} className="text-ink-faint mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium">
              Arquivado em {animal.archivedAt ? formatLong(animal.archivedAt) : "—"}
            </p>
            {animal.archiveReason && (
              <p className="text-sm text-ink-soft mt-0.5">
                Motivo: {animal.archiveReason}
              </p>
            )}
          </div>
        </Card>
      )}

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
        <div>
          <DesempenhoCard animalId={animal.id} />
          <AcoesCard animalId={animal.id} />
        </div>
        <LinhaDoTempo animalId={animal.id} />
      </div>
    </div>
  );
}

// ---------- Desempenho leiteiro ----------

const round1 = (v: number) => Math.round(v * 10) / 10;

/** "7,0" — número sem unidade, para o detalhamento por ordenha. */
const fmt1 = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const SHIFT_ORDER: MilkingShift[] = ["manha", "tarde", "unica"];

interface DiaMedido {
  date: string;
  turnos: { shift: MilkingShift; liters: number }[];
  total: number;
}

function DesempenhoCard({ animalId }: { animalId: string }) {
  const { state } = useFarm();

  // Agrupa as Medições por dia: litros/dia = soma das ordenhas do dia.
  const dias = useMemo<DiaMedido[]>(() => {
    const sessionById = new Map(state.sessions.map((s) => [s.id, s]));
    const byDate = new Map<string, DiaMedido>();
    for (const m of state.measurements) {
      if (m.animalId !== animalId) continue;
      const session = sessionById.get(m.sessionId);
      if (!session) continue;
      const entry = byDate.get(session.date) ?? {
        date: session.date,
        turnos: [],
        total: 0,
      };
      entry.turnos.push({ shift: session.shift, liters: m.liters });
      byDate.set(session.date, entry);
    }
    return [...byDate.values()]
      .map((d) => ({
        ...d,
        turnos: d.turnos.sort(
          (a, b) => SHIFT_ORDER.indexOf(a.shift) - SHIFT_ORDER.indexOf(b.shift)
        ),
        total: round1(d.turnos.reduce((acc, t) => acc + t.liters, 0)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [state, animalId]);

  // Cobertura: dias medidos do Animal / dias com Controle leiteiro na Fazenda.
  const totalDiasControle = useMemo(
    () => new Set(state.sessions.map((s) => s.date)).size,
    [state.sessions]
  );

  const mediaDia = dias.length
    ? round1(dias.reduce((acc, d) => acc + d.total, 0) / dias.length)
    : null;

  return (
    <div className="mb-6">
      <SectionTitle>Desempenho leiteiro</SectionTitle>
      <Card className="p-4">
        {dias.length === 0 ? (
          <div className="py-2">
            <AbsentValue label="sem medição" />
            <p className="text-sm text-ink-soft mt-1">
              Este animal ainda não tem Medições individuais em nenhum Controle
              leiteiro.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="text-sm text-ink-soft">
                Período: {formatLong(dias[0].date)} a{" "}
                {formatLong(dias[dias.length - 1].date)} ·{" "}
                <span className="tnum">{dias.length}</span>{" "}
                {dias.length === 1 ? "dia medido" : "dias medidos"}
              </p>
              {totalDiasControle > 0 && (
                <CoverageBadge ratio={dias.length / totalDiasControle} />
              )}
            </div>
            {mediaDia !== null && (
              <p className="text-2xl font-semibold tnum mt-2">
                {formatLiters(mediaDia)}
                <span className="text-sm font-normal text-ink-soft ml-1.5">
                  média por dia (L/dia)
                </span>
              </p>
            )}
            <ul className="mt-3 divide-y divide-black/5">
              {[...dias].reverse().map((d) => (
                <li key={d.date} className="py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-soft">{formatLong(d.date)}</span>
                    <span className="font-medium tnum">
                      {formatLiters(d.total)}
                    </span>
                  </div>
                  <p className="text-xs text-ink-faint tnum text-right">
                    {d.turnos
                      .map((t) => `${fmt1(t.liters)} ${SHIFT_LABEL[t.shift]}`)
                      .join(" · ")}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

// ---------- Ações ----------

function AcoesCard({ animalId }: { animalId: string }) {
  const { state } = useFarm();
  const animal = state.animals.find((item) => item.id === animalId);
  const [moverOpen, setMoverOpen] = useState(false);
  const [arquivarOpen, setArquivarOpen] = useState(false);
  const [editarOpen, setEditarOpen] = useState(false);

  if (!animal) return null;

  return (
    <div className="mb-6">
      <SectionTitle>Ações</SectionTitle>
      <Card className="p-4 flex flex-col sm:flex-row gap-2">
        <Button variant="secondary" onClick={() => setEditarOpen(true)}>
          <Pencil size={16} />
          Editar dados
        </Button>
        {animal.status === "ativo" && (
          <>
            <Button variant="secondary" onClick={() => setMoverOpen(true)}>
              <ArrowRightLeft size={16} />
              Mover de lote
            </Button>
            <Button variant="danger" onClick={() => setArquivarOpen(true)}>
              <Archive size={16} />
              Arquivar
            </Button>
          </>
        )}
      </Card>
      <EditarAnimalSheet
        animal={animal}
        open={editarOpen}
        onClose={() => setEditarOpen(false)}
      />
      <MoverDeLoteSheet
        animalId={animalId}
        open={moverOpen}
        onClose={() => setMoverOpen(false)}
      />
      <ArquivarSheet
        animalId={animalId}
        open={arquivarOpen}
        onClose={() => setArquivarOpen(false)}
      />
    </div>
  );
}

function EditarAnimalSheet({
  animal,
  open,
  onClose,
}: {
  animal: { id: string; name: string; tag?: string };
  open: boolean;
  onClose: () => void;
}) {
  const { dispatch } = useFarm();
  const [name, setName] = useState(animal.name);
  const [tag, setTag] = useState(animal.tag ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const reset = () => {
    setName(animal.name);
    setTag(animal.tag ?? "");
    setBusy(false);
    setError(null);
    setSuccess(false);
  };

  useEffect(() => {
    if (open) reset();
  }, [open]);

  const dirty = !success && (name.trim() !== animal.name || tag.trim() !== (animal.tag ?? ""));
  const guard = useUnsavedGuard(dirty, () => {
    reset();
    onClose();
  });

  const close = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    const nextName = name.trim();
    if (!nextName || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "UpdateAnimal",
      animalId: animal.id,
      name: nextName,
      tag: tag.trim() || undefined,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    setSuccess(true);
  };

  return (
    <Sheet
      open={open}
      onClose={success ? close : guard.requestClose}
      title="Editar dados do animal"
      footer={
        guard.asking ? (
          <UnsavedFooter onKeepEditing={guard.keepEditing} onDiscard={guard.discard} />
        ) : success ? (
          <Button className="w-full" onClick={close}>
            Concluído
          </Button>
        ) : (
          <Button className="w-full" onClick={submit} disabled={!name.trim() || busy || !dirty}>
            {busy ? "Salvando…" : "Salvar alterações"}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && <InlineError>{error}</InlineError>}
        <SuccessNotice
          message={success ? "Dados do Animal atualizados." : null}
          onDismiss={() => setSuccess(false)}
        />
        <Field label="Nome">
          <input
            className={inputCls}
            value={name}
            disabled={success}
            onChange={(event) => setName(event.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Brinco" hint="Opcional — deixe vazio se o Animal não tiver brinco.">
          <input
            className={inputCls}
            value={tag}
            disabled={success}
            onChange={(event) => setTag(event.target.value)}
          />
        </Field>
        <p className="text-sm text-ink-soft">
          Nome e brinco serão atualizados. Medições, Lotações e histórico permanecem intactos.
        </p>
      </div>
    </Sheet>
  );
}

function MoverDeLoteSheet({
  animalId,
  open,
  onClose,
}: {
  animalId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { state, dispatch } = useFarm();
  const loteAtual = groupOf(state, animalId);
  const [groupId, setGroupId] = useState("");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destinos = state.groups.filter((g) => g.id !== loteAtual?.id);
  const destino = groupId || destinos[0]?.id || "";

  const dirty = groupId !== "" || date !== today();
  const guard = useUnsavedGuard(dirty, () => {
    setGroupId("");
    setDate(today());
    setError(null);
    onClose();
  });

  const submit = async () => {
    if (!destino || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "AssignAnimalToGroup",
      animalId,
      groupId: destino,
      date,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    setGroupId("");
    setDate(today());
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={guard.requestClose}
      title="Mover de lote"
      footer={
        guard.asking ? (
          <UnsavedFooter onKeepEditing={guard.keepEditing} onDiscard={guard.discard} />
        ) : (
          <Button className="w-full" onClick={submit} disabled={!destino || busy}>
            {busy ? "Salvando…" : "Confirmar nova Lotação"}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && <InlineError>{error}</InlineError>}
        <p className="text-sm text-ink-soft">
          Lote atual:{" "}
          <span className="font-medium text-ink">
            {loteAtual ? loteAtual.name : "Sem lote"}
          </span>
        </p>
        <Field label="Novo lote">
          {destinos.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Não há outro lote cadastrado para mover este animal.
            </p>
          ) : (
            <select
              className={inputCls}
              value={destino}
              onChange={(e) => setGroupId(e.target.value)}
            >
              {destinos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field
          label="Data da movimentação"
          hint="A Lotação atual é encerrada e a nova começa nesta data."
        >
          <input
            type="date"
            className={inputCls}
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value || today())}
          />
        </Field>
      </div>
    </Sheet>
  );
}

function ArquivarSheet({
  animalId,
  open,
  onClose,
}: {
  animalId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { dispatch } = useFarm();
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = reason.trim() !== "" || date !== today();
  const guard = useUnsavedGuard(dirty, () => {
    setReason("");
    setDate(today());
    setError(null);
    onClose();
  });

  const submit = async () => {
    const r = reason.trim();
    if (!r || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "ArchiveAnimal",
      animalId,
      reason: r,
      date,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    setReason("");
    setDate(today());
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={guard.requestClose}
      title="Arquivar animal"
      footer={
        guard.asking ? (
          <UnsavedFooter onKeepEditing={guard.keepEditing} onDiscard={guard.discard} />
        ) : (
          <Button
            variant="danger"
            className="w-full"
            onClick={submit}
            disabled={!reason.trim() || busy}
          >
            {busy ? "Salvando…" : "Arquivar animal"}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && <InlineError>{error}</InlineError>}
        <Field
          label="Motivo"
          hint="Obrigatório — o motivo fica registrado no histórico do animal."
        >
          <input
            className={inputCls}
            placeholder="Ex.: Vendida, Morte, Transferida"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Field label="Data do arquivamento">
          <input
            type="date"
            className={inputCls}
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value || today())}
          />
        </Field>
        <p className="text-sm text-ink-soft">
          O animal sai das listas do dia a dia, mas o histórico de Lotações e
          Medições individuais é preservado.
        </p>
      </div>
    </Sheet>
  );
}

// ---------- Linha do tempo ----------

type TimelineItem = {
  key: string;
  date: string; // ISODate
  sortKey: string; // ISODateTime para desempate
  kind: "lotacao" | "medicao" | "auditoria";
  title: string;
  detail?: string;
  reason?: string;
};

const kindIcon = {
  lotacao: ArrowRightLeft,
  medicao: Milk,
  auditoria: History,
} as const;

const kindLabel = {
  lotacao: "Lotação",
  medicao: "Controle leiteiro",
  auditoria: "Histórico",
} as const;

function LinhaDoTempo({ animalId }: { animalId: string }) {
  const { state } = useFarm();

  const items = useMemo(() => {
    const out: TimelineItem[] = [];
    const groupName = (id: string) =>
      state.groups.find((g) => g.id === id)?.name ?? "Lote removido";
    const sessionById = new Map(state.sessions.map((s) => [s.id, s]));

    for (const asg of state.assignments.filter((a) => a.animalId === animalId)) {
      out.push({
        key: asg.id,
        date: asg.start,
        sortKey: asg.start,
        kind: "lotacao",
        title: `Lotação em ${groupName(asg.groupId)}`,
        detail: `${formatLong(asg.start)} → ${
          asg.end ? formatLong(asg.end) : "atual"
        }`,
      });
    }

    for (const m of state.measurements.filter((m) => m.animalId === animalId)) {
      const date = sessionById.get(m.sessionId)?.date ?? "";
      out.push({
        key: m.id,
        date,
        sortKey: date,
        kind: "medicao",
        title: "Controle leiteiro",
        detail: `Medição individual: ${formatLiters(m.liters)}`,
      });
    }

    for (const ev of state.audit.filter(
      (e) => e.entityType === "animal" && e.entityId === animalId
    )) {
      const date = ev.at.slice(0, 10);
      out.push({
        key: ev.id,
        date,
        sortKey: ev.at,
        kind: "auditoria",
        title: ev.description,
        detail:
          ev.before !== undefined && ev.after !== undefined
            ? `Antes: ${ev.before} · Depois: ${ev.after}`
            : undefined,
        reason: ev.reason,
      });
    }

    return out.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
  }, [state, animalId]);

  return (
    <div className="mb-6">
      <SectionTitle>Linha do tempo</SectionTitle>
      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={<History size={28} />}
            title="Sem eventos ainda"
            hint="Lotações, Controles leiteiros e registros de histórico aparecem aqui."
          />
        ) : (
          <ul className="divide-y divide-black/5">
            {items.map((it) => {
              const Icon = kindIcon[it.kind];
              return (
                <li key={it.key} className="flex gap-3 px-4 py-3">
                  <div className="shrink-0 mt-0.5 text-ink-faint">
                    <Icon size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-medium">{it.title}</p>
                      <span className="text-xs text-ink-faint tnum">
                        {it.date ? formatLong(it.date) : "—"}
                      </span>
                    </div>
                    <p className="text-xs text-ink-faint mb-1">
                      {kindLabel[it.kind]}
                    </p>
                    {it.detail && (
                      <p className="text-sm text-ink-soft tnum">{it.detail}</p>
                    )}
                    {it.reason && (
                      <p className="text-sm text-ink-soft mt-0.5">
                        Motivo: {it.reason}
                      </p>
                    )}
                    <div className="mt-1.5">
                      <FactNatureChip nature="registro" />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
