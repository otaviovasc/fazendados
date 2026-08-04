import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Plus, Trash2, Wheat } from "lucide-react";
import { feedBalance, today, useFarm } from "../../state/store";
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
import { formatQty, parseDecimal } from "../../lib/format";
import { formatRelativeDay } from "../../lib/dates";

const ORIGENS = ["compra", "estoque inicial", "ajuste"] as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Movement = {
  id: string;
  date: string;
  kind: "entrada" | "trato";
  detail: string;
  quantity: number;
};

export default function EstoquePage() {
  const { state } = useFarm();
  const [entryOpen, setEntryOpen] = useState(false);
  const [feedingOpen, setFeedingOpen] = useState(false);

  function movementsOf(itemId: string): Movement[] {
    const entries: Movement[] = state.feedEntries
      .filter((e) => e.itemId === itemId)
      .map((e) => ({
        id: e.id,
        date: e.date,
        kind: "entrada",
        detail: e.note ? `${cap(e.origin)} — ${e.note}` : cap(e.origin),
        quantity: e.quantity,
      }));
    const tratos: Movement[] = state.feedingEvents.flatMap((ev) =>
      ev.items
        .filter((i) => i.itemId === itemId)
        .map((i) => ({
          id: `${ev.id}_${i.itemId}`,
          date: ev.date,
          kind: "trato" as const,
          detail: `Trato — ${state.groups.find((g) => g.id === ev.groupId)?.name ?? "Lote"}`,
          quantity: i.quantity,
        }))
    );
    return [...entries, ...tratos].sort((a, b) => b.date.localeCompare(a.date));
  }

  return (
    <div>
      <PageHeader
        title="Estoque"
        subtitle="Saldo derivado de entradas e tratos — nunca editável diretamente"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setFeedingOpen(true)}>
              <ArrowUpFromLine size={16} /> Registrar trato
            </Button>
            <Button onClick={() => setEntryOpen(true)}>
              <ArrowDownToLine size={16} /> Registrar entrada
            </Button>
          </div>
        }
      />

      {state.feedItems.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wheat size={32} />}
            title="Nenhum alimento cadastrado"
            hint="Cadastre o primeiro alimento para começar a registrar entradas e tratos."
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {state.feedItems.map((item) => {
            const saldo = feedBalance(state, item.id);
            const movements = movementsOf(item.id);
            return (
              <Card key={item.id} className="p-4 md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    <p className="text-xs text-ink-faint mt-0.5">unidade: {item.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      Saldo
                    </p>
                    <p
                      className={`text-2xl font-semibold tnum ${
                        saldo < 0 ? "text-danger-600" : ""
                      }`}
                    >
                      {formatQty(saldo, item.unit)}
                    </p>
                  </div>
                </div>

                <div className="mt-4">
                  <SectionTitle>Movimentações</SectionTitle>
                  {movements.length === 0 ? (
                    <p className="text-sm text-ink-soft py-2">
                      Nenhuma movimentação registrada.
                    </p>
                  ) : (
                    <ul className="divide-y divide-black/5">
                      {movements.map((m) => (
                        <li key={m.id} className="flex items-center gap-3 py-2.5">
                          <span
                            className={`shrink-0 rounded-full p-1.5 ${
                              m.kind === "entrada"
                                ? "bg-pasture-100 text-pasture-700"
                                : "bg-ink/5 text-ink-soft"
                            }`}
                          >
                            {m.kind === "entrada" ? (
                              <ArrowDownToLine size={14} />
                            ) : (
                              <ArrowUpFromLine size={14} />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm truncate">{m.detail}</p>
                            <p className="text-xs text-ink-faint">
                              {formatRelativeDay(m.date)}
                            </p>
                          </div>
                          <span
                            className={`text-sm font-medium tnum ${
                              m.kind === "entrada" ? "text-pasture-700" : "text-ink"
                            }`}
                          >
                            {m.kind === "entrada" ? "+" : "−"}
                            {formatQty(m.quantity, item.unit)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <NewFeedItemCard />

      <FeedEntrySheet open={entryOpen} onClose={() => setEntryOpen(false)} />
      <FeedingEventSheet open={feedingOpen} onClose={() => setFeedingOpen(false)} />
    </div>
  );
}

// ---------- Novo alimento (inline) ----------

function NewFeedItemCard() {
  const { dispatch } = useFarm();
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("kg");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = name.trim().length > 0 && unit.trim().length > 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "RegisterFeedItem",
      name: name.trim(),
      unit,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    setName("");
    setUnit("kg");
  };

  return (
    <Card className="p-4 md:p-5 mt-6">
      <SectionTitle>Novo alimento</SectionTitle>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="flex-1">
          <Field label="Nome">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex.: Ração lactação 18%"
            />
          </Field>
        </div>
        <div className="sm:w-32">
          <Field label="Unidade" hint="Não pode ser alterada depois.">
            <select
              className={inputCls}
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="kg">kg</option>
              <option value="sc">sc</option>
              <option value="l">l</option>
              <option value="t">t</option>
            </select>
          </Field>
        </div>
        <Button variant="secondary" disabled={!valid || busy} onClick={submit}>
          <Plus size={16} /> {busy ? "Adicionando…" : "Adicionar"}
        </Button>
      </div>
      {error && <div className="mt-3"><InlineError>{error}</InlineError></div>}
    </Card>
  );
}

// ---------- Registrar entrada ----------

function FeedEntrySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useFarm();
  const [itemId, setItemId] = useState("");
  const [qty, setQty] = useState("");
  const [date, setDate] = useState(today());
  const [origin, setOrigin] = useState<string>("compra");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseDecimal(qty);
  const valid =
    itemId !== "" &&
    parsed !== null &&
    parsed > 0 &&
    date !== "" &&
    (origin !== "ajuste" || note.trim().length > 0);

  function reset() {
    setItemId("");
    setQty("");
    setDate(today());
    setOrigin("compra");
    setNote("");
    setError(null);
  }

  const dirty =
    itemId !== "" ||
    qty.trim() !== "" ||
    note.trim() !== "" ||
    origin !== "compra" ||
    date !== today();
  const guard = useUnsavedGuard(dirty, () => {
    reset();
    onClose();
  });

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "RecordFeedEntry",
      itemId,
      date,
      quantity: parsed!,
      origin,
      note: note.trim() || undefined,
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
      title="Registrar entrada de alimento"
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
        <Field label="Alimento">
          <select
            className={inputCls}
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
          >
            <option value="">Selecionar…</option>
            {state.feedItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.unit})
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quantidade">
            <input
              className={inputCls}
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="Data">
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Origem">
          <select
            className={inputCls}
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          >
            {ORIGENS.map((o) => (
              <option key={o} value={o}>
                {cap(o)}
              </option>
            ))}
          </select>
        </Field>
        {origin === "ajuste" && (
          <Field label="Motivo do ajuste" hint="Obrigatório para ajustes de estoque.">
            <input
              className={inputCls}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex.: quebra na pesagem, sobra de silo"
            />
          </Field>
        )}
      </div>
    </Sheet>
  );
}

// ---------- Registrar trato ----------

type FeedRow = { itemId: string; qty: string };

function FeedingEventSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useFarm();
  const [groupId, setGroupId] = useState("");
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState<FeedRow[]>([{ itemId: "", qty: "" }]);

  const filled = rows
    .map((r) => ({ itemId: r.itemId, quantity: parseDecimal(r.qty) }))
    .filter(
      (r): r is { itemId: string; quantity: number } =>
        r.itemId !== "" && r.quantity !== null && r.quantity > 0
    );
  const valid = groupId !== "" && date !== "" && filled.length > 0;

  function setRow(idx: number, patch: Partial<FeedRow>) {
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function reset() {
    setGroupId("");
    setDate(today());
    setRows([{ itemId: "", qty: "" }]);
  }

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Registrar trato"
      footer={
        <Button
          className="w-full"
          disabled={!valid}
          onClick={() => {
            dispatch({ type: "RecordFeedingEvent", groupId, date, items: filled });
            reset();
            onClose();
          }}
        >
          Confirmar registro
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lote">
            <select
              className={inputCls}
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              <option value="">Selecionar…</option>
              {state.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Data">
            <input
              type="date"
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </Field>
        </div>

        <div>
          <SectionTitle>Itens do trato</SectionTitle>
          <div className="flex flex-col gap-3">
            {rows.map((row, idx) => {
              const parsed = parseDecimal(row.qty);
              const item = state.feedItems.find((i) => i.id === row.itemId);
              const insufficient =
                item !== undefined &&
                parsed !== null &&
                parsed > feedBalance(state, item.id);
              return (
                <div key={idx} className="rounded-xl border border-black/10 p-3">
                  <div className="flex gap-2">
                    <select
                      className={inputCls}
                      value={row.itemId}
                      onChange={(e) => setRow(idx, { itemId: e.target.value })}
                    >
                      <option value="">Alimento…</option>
                      {state.feedItems.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} ({i.unit})
                        </option>
                      ))}
                    </select>
                    <input
                      className={`${inputCls} w-24 shrink-0`}
                      inputMode="decimal"
                      value={row.qty}
                      onChange={(e) => setRow(idx, { qty: e.target.value })}
                      placeholder="Qtd."
                    />
                    {rows.length > 1 && (
                      <button
                        className="shrink-0 p-2 text-ink-faint hover:text-danger-600 min-h-[44px]"
                        onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}
                        aria-label="Remover item"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  {insufficient && (
                    <p className="mt-2">
                      <Chip tone="pendente">
                        saldo insuficiente — saldo atual{" "}
                        {formatQty(feedBalance(state, item!.id), item!.unit)}
                      </Chip>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <Button
            variant="ghost"
            className="mt-2"
            onClick={() => setRows((rs) => [...rs, { itemId: "", qty: "" }])}
          >
            <Plus size={16} /> Adicionar item
          </Button>
          <p className="text-xs text-ink-soft mt-2">
            Somente linhas preenchidas entram no registro. Se a quantidade superar o
            saldo, o fato real prevalece — o registro não é bloqueado.
          </p>
        </div>
      </div>
    </Sheet>
  );
}
