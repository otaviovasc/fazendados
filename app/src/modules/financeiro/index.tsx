import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Plus, Wallet } from "lucide-react";
import { today, useFarm } from "../../state/store";
import type { FinancialEntry } from "../../domain/types";
import {
  Button,
  Card,
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
import { formatCents, parseDecimal } from "../../lib/format";
import { formatDay, formatLong, formatRelativeDay } from "../../lib/dates";

const monthFmt = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });

export default function FinanceiroPage() {
  const { state } = useFarm();
  const [newOpen, setNewOpen] = useState(false);
  const [settling, setSettling] = useState<FinancialEntry | null>(null);

  const monthKey = today().slice(0, 7); // "2026-08"
  const monthLabel = monthFmt.format(new Date(today() + "T12:00:00"));

  const settledThisMonth = state.financialEntries.filter(
    (e) => e.settledAt !== null && e.settledAt.startsWith(monthKey)
  );
  const resultado = settledThisMonth.reduce(
    (acc, e) => acc + (e.kind === "receita" ? e.amountCents : -e.amountCents),
    0
  );

  const pending = state.financialEntries
    .filter((e) => e.settledAt === null)
    .sort((a, b) => (a.dueDate ?? a.date).localeCompare(b.dueDate ?? b.date));
  const settled = state.financialEntries
    .filter((e) => e.settledAt !== null)
    .sort((a, b) => b.settledAt!.localeCompare(a.settledAt!));

  return (
    <div>
      <PageHeader
        title="Financeiro"
        subtitle="Receitas e despesas da fazenda"
        action={
          <Button onClick={() => setNewOpen(true)}>
            <Plus size={16} /> Novo lançamento
          </Button>
        }
      />

      <Card className="p-5 mb-6">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
          Resultado de caixa — {monthLabel}
        </p>
        <p
          className={`text-3xl font-semibold tnum mt-1 ${
            resultado < 0 ? "text-danger-600" : "text-pasture-700"
          }`}
        >
          {formatCents(resultado)}
        </p>
        <p className="text-xs text-ink-soft mt-1">
          Receitas liquidadas − despesas liquidadas · somente lançamentos liquidados
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionTitle>Previstos (pendentes)</SectionTitle>
          <Card>
            {pending.length === 0 ? (
              <EmptyState
                icon={<Wallet size={28} />}
                title="Nada previsto"
                hint="Não há lançamentos aguardando Liquidação."
              />
            ) : (
              <ul className="divide-y divide-black/5">
                {pending.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    action={
                      <Button variant="secondary" onClick={() => setSettling(e)}>
                        Liquidar
                      </Button>
                    }
                  />
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section>
          <SectionTitle>Liquidados</SectionTitle>
          <Card>
            {settled.length === 0 ? (
              <EmptyState
                icon={<Wallet size={28} />}
                title="Nenhum lançamento liquidado"
                hint="Lançamentos liquidados aparecem aqui e compõem o Resultado de caixa."
              />
            ) : (
              <ul className="divide-y divide-black/5">
                {settled.map((e) => (
                  <EntryRow key={e.id} entry={e} />
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      <NewEntrySheet open={newOpen} onClose={() => setNewOpen(false)} />
      <SettleSheet entry={settling} onClose={() => setSettling(null)} />
    </div>
  );
}

// ---------- Linha de lançamento ----------

function EntryRow({ entry, action }: { entry: FinancialEntry; action?: React.ReactNode }) {
  const receita = entry.kind === "receita";
  const liquidado = entry.settledAt !== null;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 md:px-5 py-3">
      <span
        className={`shrink-0 rounded-full p-2 ${
          receita ? "bg-pasture-100 text-pasture-700" : "bg-danger-100 text-danger-600"
        }`}
      >
        {receita ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
      </span>
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-sm font-medium truncate">{entry.description}</p>
        <p className="text-xs text-ink-faint">
          {liquidado
            ? `liquidado ${formatRelativeDay(entry.settledAt!)}`
            : entry.dueDate
              ? `vence ${formatDay(entry.dueDate)} · ${formatLong(entry.date)}`
              : formatLong(entry.date)}
        </p>
      </div>
      <span
        className={`shrink-0 text-sm font-semibold tnum ${
          receita ? "text-pasture-700" : "text-danger-600"
        }`}
      >
        {receita ? "+" : "−"}
        {formatCents(entry.amountCents)}
      </span>
      {action && <span className="max-sm:w-full max-sm:[&>button]:w-full">{action}</span>}
    </li>
  );
}

// ---------- Liquidação ----------

function SettleSheet({ entry, onClose }: { entry: FinancialEntry | null; onClose: () => void }) {
  const { dispatch } = useFarm();
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = date !== "" && !busy;

  return (
    <Sheet
      open={entry !== null}
      onClose={onClose}
      title="Liquidação"
      footer={
        <Button
          className="w-full"
          disabled={!valid}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const outcome = await dispatch({
              type: "SettleFinancialEntry",
              entryId: entry!.id,
              date,
            });
            setBusy(false);
            if (!outcome.ok) {
              setError(outcome.message);
              return;
            }
            onClose();
          }}
        >
          {busy ? "Liquidando…" : "Confirmar liquidação"}
        </Button>
      }
    >
      {entry && (
        <div className="flex flex-col gap-4">
          {error && <InlineError>{error}</InlineError>}
          <div className="rounded-xl bg-paper-sunken p-3.5">
            <p className="text-sm font-medium">{entry.description}</p>
            <p
              className={`text-lg font-semibold tnum mt-0.5 ${
                entry.kind === "receita" ? "text-pasture-700" : "text-danger-600"
              }`}
            >
              {entry.kind === "receita" ? "+" : "−"}
              {formatCents(entry.amountCents)}
            </p>
          </div>
          <Field label="Data da liquidação">
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
      )}
    </Sheet>
  );
}

// ---------- Novo lançamento ----------

function NewEntrySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch } = useFarm();
  const [kind, setKind] = useState<"receita" | "despesa">("receita");
  const [description, setDescription] = useState("");
  const [valor, setValor] = useState("");
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseDecimal(valor);
  const valid =
    description.trim().length > 0 && parsed !== null && parsed > 0 && date !== "";

  function reset() {
    setKind("receita");
    setDescription("");
    setValor("");
    setDate(today());
    setDueDate("");
    setError(null);
  }

  const dirty =
    description.trim() !== "" || valor.trim() !== "" || dueDate !== "" || date !== today();
  const guard = useUnsavedGuard(dirty, () => {
    reset();
    onClose();
  });

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "RecordFinancialEntry",
      kind,
      description: description.trim(),
      amountCents: Math.round(parsed! * 100),
      date,
      dueDate: dueDate || undefined,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    reset();
    onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={guard.requestClose}
      title="Novo lançamento"
      footer={
        guard.asking ? (
          <UnsavedFooter onKeepEditing={guard.keepEditing} onDiscard={guard.discard} />
        ) : (
          <Button className="w-full" disabled={!valid || busy} onClick={submit}>
            {busy ? "Salvando…" : "Confirmar registro"}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-4">
        {error && <InlineError>{error}</InlineError>}
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink/5 p-1">
          {(["receita", "despesa"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded-lg py-2.5 text-sm font-semibold transition min-h-[44px] ${
                kind === k
                  ? k === "receita"
                    ? "bg-white shadow-sm text-pasture-700"
                    : "bg-white shadow-sm text-danger-600"
                  : "text-ink-soft"
              }`}
            >
              {k === "receita" ? "Receita" : "Despesa"}
            </button>
          ))}
        </div>
        <Field label="Descrição">
          <input
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="ex.: Leite — 2ª quinzena (laticínio)"
          />
        </Field>
        <Field label="Valor (R$)">
          <input
            className={inputCls}
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="0,00"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
          <Field label="Vencimento" hint="Opcional.">
            <input
              type="date"
              className={inputCls}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </Field>
        </div>
        <p className="text-xs text-ink-soft">
          O lançamento nasce como previsto e só entra no Resultado de caixa após a
          Liquidação.
        </p>
      </div>
    </Sheet>
  );
}
