import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownRight,
  ArrowUpRight,
  Beef,
  ChevronRight,
  Minus,
  Plus,
  Search,
  Users,
} from "lucide-react";
import { Line, LineChart } from "recharts";
import {
  animalsInGroup,
  groupOf,
  recentAnimalDailyTotals,
  today,
  useFarm,
} from "../../state/store";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Field,
  InlineError,
  PageHeader,
  SectionTitle,
  Sheet,
  UnsavedFooter,
  inputCls,
  useUnsavedGuard,
} from "../../components/ui";
import { formatLong } from "../../lib/dates";
import { formatLiters } from "../../lib/format";

/** Busca tolerante a maiúsculas e acentos. */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

type LoteFilter = "todos" | "sem_lote" | string;

const round1 = (v: number) => Math.round(v * 10) / 10;

const fmt1 = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Ração recomendada: 1 kg para cada 3 L da última medição diária. */
const racaoRecomendada = (litrosDia: number) => round1(litrosDia / 3);

/** Variação percentual entre os dois últimos dias medidos. */
function variacao(totals: { liters: number }[]): number | null {
  if (totals.length < 2) return null;
  const [last, prev] = totals;
  if (prev.liters <= 0) return null;
  return ((last.liters - prev.liters) / prev.liters) * 100;
}

function VariacaoChip({ value }: { value: number | null }) {
  if (value === null) return null;
  const abs = Math.abs(value);
  const Icon = abs < 0.05 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const tone =
    abs < 0.05
      ? "text-ink-soft bg-black/5"
      : value > 0
        ? "text-pasture-700 bg-pasture-100"
        : "text-danger-600 bg-danger-100";
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold tnum ${tone}`}
    >
      <Icon size={13} />
      {abs.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
    </span>
  );
}

/** Miniatura da evolução das medições diárias do animal. */
function Sparkline({ totals }: { totals: { date: string; liters: number }[] }) {
  if (totals.length < 2) return null;
  const data = [...totals].reverse();
  return (
    <LineChart width={88} height={32} data={data} margin={{ top: 3, right: 2, bottom: 3, left: 2 }}>
      <Line
        type="monotone"
        dataKey="liters"
        stroke="#2F5233"
        strokeWidth={1.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}

export default function RebanhoPage() {
  const { state } = useFarm();
  const [query, setQuery] = useState("");
  const [loteFilter, setLoteFilter] = useState<LoteFilter>("todos");
  const [showArchived, setShowArchived] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [groupSheetOpen, setGroupSheetOpen] = useState(false);

  const visible = useMemo(() => {
    const q = norm(query.trim());
    return state.animals
      .filter((a) => (showArchived ? true : a.status === "ativo"))
      .filter((a) => {
        if (!q) return true;
        return norm(a.name).includes(q) || (a.tag ? norm(a.tag).includes(q) : false);
      })
      .filter((a) => {
        if (loteFilter === "todos") return true;
        const g = groupOf(state, a.id);
        if (loteFilter === "sem_lote") return g === null;
        return g?.id === loteFilter;
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [state, query, loteFilter, showArchived]);

  const archivedCount = state.animals.filter((a) => a.status === "arquivado").length;

  return (
    <div>
      <PageHeader
        title="Rebanho"
        subtitle={`${state.animals.filter((a) => a.status === "ativo").length} animais ativos`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setGroupSheetOpen(true)}>
              <Plus size={16} />
              Criar lote
            </Button>
            <Button onClick={() => setSheetOpen(true)}>
              <Plus size={16} />
              Cadastrar animal
            </Button>
          </div>
        }
      />

      {/* Busca */}
      <div className="relative mb-3">
        <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          className={`${inputCls} pl-10`}
          placeholder="Buscar por nome ou brinco"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Filtro por lote */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-1 px-1">
        <FilterChip active={loteFilter === "todos"} onClick={() => setLoteFilter("todos")}>
          Todos
        </FilterChip>
        {state.groups.map((g) => (
          <FilterChip
            key={g.id}
            active={loteFilter === g.id}
            onClick={() => setLoteFilter(g.id)}
          >
            {g.name}
          </FilterChip>
        ))}
        <FilterChip
          active={loteFilter === "sem_lote"}
          onClick={() => setLoteFilter("sem_lote")}
        >
          Sem lote
        </FilterChip>
      </div>

      {/* Lista de animais */}
      <Card className="mb-6">
        {visible.length === 0 ? (
          query.trim() === "" &&
          loteFilter === "todos" &&
          !showArchived &&
          state.animals.length === 0 ? (
            <EmptyState
              icon={<Beef size={28} />}
              title="Nenhum animal cadastrado"
              hint="Toque em “Cadastrar animal” para registrar o primeiro."
            />
          ) : (
            <EmptyState
              icon={<Beef size={28} />}
              title="Nenhum animal encontrado"
              hint="Ajuste a busca ou o filtro de lote."
            />
          )
        ) : (
          <ul className="divide-y divide-black/5">
            {visible.map((a) => {
              const g = groupOf(state, a.id);
              const recentTotals = recentAnimalDailyTotals(state, a.id, 10);
              const lastDay = recentTotals[0];
              return (
                <li key={a.id}>
                  <Link
                    to={`/rebanho/${a.id}`}
                    className="flex items-center gap-3 px-4 py-3 min-h-[72px] hover:bg-ink/[0.03] transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{a.name}</p>
                        <VariacaoChip value={variacao(recentTotals)} />
                      </div>
                      <p className="text-sm text-ink-soft truncate tnum">
                        {a.tag ? `${a.tag} · ` : ""}
                        {g ? g.name : "Sem lote"}
                      </p>
                      {lastDay ? (
                        <p className="mt-0.5 text-xs text-ink-soft tnum">
                          Recomendado{" "}
                          <span className="font-medium text-ink">
                            {fmt1(racaoRecomendada(lastDay.liters))} kg
                          </span>{" "}
                          de ração · último dia medido {formatLiters(lastDay.liters)}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs text-ink-faint tnum">
                          Sem medições individuais
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <Sparkline totals={recentTotals} />
                      {a.status === "arquivado" && <Chip tone="neutro">arquivado</Chip>}
                    </div>
                    <ChevronRight size={18} className="text-ink-faint shrink-0" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        {archivedCount > 0 && (
          <div className="border-t border-black/5 px-4 py-2.5">
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="text-sm font-medium text-pasture-700 hover:text-pasture-900 min-h-[44px] -my-1 py-2"
            >
              {showArchived
                ? "Ocultar arquivados"
                : `Mostrar arquivados (${archivedCount})`}
            </button>
          </div>
        )}
      </Card>

      {/* Gestão de lotes */}
      <SectionTitle>Lotes</SectionTitle>
      <Card>
        {state.groups.length === 0 ? (
          <EmptyState
            icon={<Users size={28} />}
            title="Nenhum lote ainda"
            hint="Toque em “Criar lote” acima para organizar os animais."
          />
        ) : (
          <ul className="divide-y divide-black/5">
            {state.groups.map((g) => {
              const members = animalsInGroup(state, g.id).filter(
                (a) => a.status === "ativo"
              ).length;
              return (
                <li key={g.id} className="flex items-center gap-3 px-4 py-3 min-h-[52px]">
                  <Users size={18} className="text-ink-faint shrink-0" />
                  <p className="font-medium flex-1 truncate">{g.name}</p>
                  <p className="text-sm text-ink-soft tnum">
                    {members} {members === 1 ? "animal" : "animais"}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <NewGroupSheet
        open={groupSheetOpen}
        onClose={() => setGroupSheetOpen(false)}
      />
      <CadastrarAnimalSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition min-h-[36px] ${
        active
          ? "bg-pasture-600 text-white"
          : "bg-paper-card border border-black/10 text-ink-soft hover:bg-ink/5"
      }`}
    >
      {children}
    </button>
  );
}

export function NewGroupSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { dispatch } = useFarm();
  const [name, setName] = useState("");
  const [milkingsPerDay, setMilkingsPerDay] = useState<1 | 2>(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName("");
    setMilkingsPerDay(2);
    setError(null);
  };

  const guard = useUnsavedGuard(name.trim() !== "", () => {
    reset();
    onClose();
  });

  const submit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "CreateHerdGroup",
      name: n,
      milkingsPerDay,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    reset();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={guard.requestClose}
      title="Criar lote"
      footer={
        guard.asking ? (
          <UnsavedFooter onKeepEditing={guard.keepEditing} onDiscard={guard.discard} />
        ) : (
          <Button
            className="w-full"
            onClick={submit}
            disabled={!name.trim() || busy}
          >
            {busy ? "Criando…" : "Criar lote"}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && <InlineError>{error}</InlineError>}
        <Field label="Nome">
          <input
            className={inputCls}
            placeholder="Ex.: Lote 3"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            autoFocus
          />
        </Field>
        <Field label="Ordenhas por dia">
          <div
            role="group"
            aria-label="Ordenhas por dia"
            className="inline-flex rounded-xl bg-paper-sunken p-1"
          >
            {([1, 2] as const).map((v) => {
              const active = milkingsPerDay === v;
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setMilkingsPerDay(v)}
                  className={`min-h-[44px] px-4 rounded-lg text-sm font-medium transition ${
                    active
                      ? "bg-paper-card text-ink shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                      : "text-ink-soft hover:text-ink"
                  }`}
                >
                  {v}×
                </button>
              );
            })}
          </div>
        </Field>
      </div>
    </Sheet>
  );
}

function CadastrarAnimalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useFarm();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [groupId, setGroupId] = useState("");
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const duplicate = trimmed
    ? state.animals.find(
        (a) => a.status === "ativo" && norm(a.name) === norm(trimmed)
      )
    : undefined;

  const reset = () => {
    setName("");
    setTag("");
    setGroupId("");
    setDate(today());
    setError(null);
  };

  const dirty =
    trimmed !== "" || tag.trim() !== "" || groupId !== "" || date !== today();
  const guard = useUnsavedGuard(dirty, () => {
    reset();
    onClose();
  });

  const submit = async () => {
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "RegisterAnimal",
      name: trimmed,
      tag: tag.trim() || undefined,
      groupId: groupId || undefined,
      date,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    reset();
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={guard.requestClose}
      title="Cadastrar animal"
      footer={
        guard.asking ? (
          <UnsavedFooter onKeepEditing={guard.keepEditing} onDiscard={guard.discard} />
        ) : (
          <Button className="w-full" onClick={submit} disabled={!trimmed || busy}>
            {busy ? "Salvando…" : "Registrar animal"}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && <InlineError>{error}</InlineError>}
        <Field label="Nome">
          <input
            className={inputCls}
            placeholder="Ex.: Estrela"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
          {duplicate && (
            <span className="block text-xs text-danger-600 mt-1">
              Já existe um animal ativo chamado “{duplicate.name}”. Confirme se
              não é o mesmo animal.
            </span>
          )}
        </Field>
        <Field label="Brinco" hint="Opcional — número ou código do brinco.">
          <input
            className={inputCls}
            placeholder="Ex.: B-102"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
          />
        </Field>
        <Field label="Lote" hint="Opcional — pode ser definido depois.">
          <select
            className={inputCls}
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">Sem lote</option>
            {state.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data de cadastro">
          <input
            type="date"
            className={inputCls}
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value || today())}
          />
          <span className="block text-xs text-ink-soft mt-1">
            {formatLong(date)}
          </span>
        </Field>
      </div>
    </Sheet>
  );
}
