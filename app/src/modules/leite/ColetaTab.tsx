import { useMemo, useState } from "react";
import { Pencil, Plus, Truck } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useFarm } from "../../state/store";
import type { MilkCollection } from "../../domain/types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Sheet,
  SuccessNotice,
  UnsavedFooter,
  inputCls,
  useUnsavedGuard,
} from "../../components/ui";
import { formatLiters, parseDecimal } from "../../lib/format";
import {
  calendarGrid,
  formatDay,
  formatLong,
  formatRelativeDay,
  startOfMonth,
  today,
} from "../../lib/dates";
import { CorrectSheet, type CorrectionTarget } from "./CorrectSheet";
import { MonthCalendar, type DayContent } from "./MonthCalendar";

const round1 = (v: number) => Math.round(v * 10) / 10;

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Coletas agrupadas por data, com total do dia. */
function useCollectionsByDate() {
  const { state } = useFarm();
  return useMemo(() => {
    const byDate = new Map<string, MilkCollection[]>();
    for (const c of state.collections) {
      const list = byDate.get(c.date) ?? [];
      list.push(c);
      byDate.set(c.date, list);
    }
    for (const list of byDate.values()) {
      list.sort((a, b) => a.time.localeCompare(b.time));
    }
    return byDate;
  }, [state.collections]);
}

const dayTotal = (list: MilkCollection[]) =>
  round1(list.reduce((acc, c) => acc + c.liters, 0));

function CollectionSheet({
  initialDate,
  onClose,
  onSaved,
}: {
  initialDate: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { state, dispatch } = useFarm();
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState(nowTime());
  const [liters, setLiters] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseDecimal(liters);
  const duplicates = state.collections.filter((c) => c.date === date);
  const guard = useUnsavedGuard(
    liters.trim() !== "" || date !== initialDate,
    onClose
  );

  async function submit() {
    if (parsed === null || !time || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "RecordMilkCollection",
      date,
      time,
      liters: parsed,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onSaved(`Coleta registrada — ${formatLiters(parsed)} às ${time}`);
    onClose();
  }

  return (
    <Sheet
      open
      onClose={guard.requestClose}
      title="Registrar coleta"
      footer={
        guard.asking ? (
          <UnsavedFooter onKeepEditing={guard.keepEditing} onDiscard={guard.discard} />
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={guard.requestClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={parsed === null || !time || busy}
              className="flex-1"
            >
              {busy ? "Registrando…" : "Registrar coleta"}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data">
            <input
              type="date"
              className={inputCls}
              value={date}
              max={today()}
              onChange={(ev) => {
                setDate(ev.target.value);
                setError(null);
              }}
            />
          </Field>
          <Field label="Horário">
            <input
              type="time"
              className={inputCls}
              value={time}
              onChange={(ev) => setTime(ev.target.value)}
            />
          </Field>
        </div>

        <Field label="Volume coletado (L)">
          <input
            className={inputCls}
            inputMode="decimal"
            placeholder="0,0"
            value={liters}
            onChange={(ev) => {
              setLiters(ev.target.value);
              setError(null);
            }}
          />
        </Field>

        {duplicates.length > 0 && (
          <div className="rounded-xl bg-review-100 text-review-700 text-sm px-3.5 py-3">
            <p className="font-medium mb-1">Possível duplicata</p>
            <p>
              Já existe Coleta nesta data (
              {duplicates
                .map((c) => `${formatLiters(c.liters)} às ${c.time}`)
                .join(" · ")}
              ). Os Registros não são mesclados automaticamente — confira antes
              de confirmar.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-danger-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function MonthChart({
  month,
  byDate,
}: {
  month: string;
  byDate: Map<string, MilkCollection[]>;
}) {
  const dados = useMemo(
    () =>
      calendarGrid(month)
        .filter((date): date is string => date !== null)
        .map((date) => {
          const list = byDate.get(date);
          // Ausência de coleta vira lacuna no gráfico (null), nunca zero.
          return {
            date,
            label: date.slice(8),
            total: list ? dayTotal(list) : null,
          };
        }),
    [byDate, month]
  );

  const comColeta = dados.filter((d) => d.total !== null);
  const totalMes = comColeta.reduce((acc, d) => acc + (d.total ?? 0), 0);
  const coletas = [...byDate.entries()]
    .filter(([date]) => date.startsWith(month.slice(0, 7)))
    .reduce((acc, [, list]) => acc + list.length, 0);

  if (comColeta.length === 0) {
    return (
      <p className="px-4 py-5 md:px-5 text-sm text-ink-soft">
        Nenhuma coleta registrada neste mês. Toque em um dia para registrar.
      </p>
    );
  }

  return (
    <div className="p-4 md:p-5">
      <div className="h-44 md:h-52 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={24}
              tick={{ fontSize: 11, fill: "#A8A29E" }}
            />
            <YAxis
              width={40}
              tickLine={false}
              axisLine={false}
              domain={["auto", "auto"]}
              tick={{ fontSize: 11, fill: "#A8A29E" }}
              tickFormatter={(v: number) => String(Math.round(v))}
            />
            <Tooltip
              formatter={(value) => [
                typeof value === "number" ? formatLiters(value) : "sem coleta",
                "Coletado no dia",
              ]}
              labelFormatter={(label) => `Dia ${label}`}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.08)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                fontSize: 13,
              }}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#2F5233"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "#2F5233", strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-sm text-ink-soft">
        <span className="tnum">{coletas}</span>{" "}
        {coletas === 1 ? "coleta" : "coletas"} em{" "}
        <span className="tnum">{comColeta.length}</span>{" "}
        {comColeta.length === 1 ? "dia" : "dias"} · total do mês:{" "}
        <span className="tnum font-medium text-ink">{formatLiters(round1(totalMes))}</span>
      </p>
      <p className="mt-1 text-xs text-ink-faint">
        Dias sem coleta aparecem como interrupções na linha — ausência não é zero.
      </p>
    </div>
  );
}

export default function ColetaTab() {
  const { state } = useFarm();
  const [month, setMonth] = useState(() => startOfMonth(today()));
  const [selectedDate, setSelectedDate] = useState(today());
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [target, setTarget] = useState<CorrectionTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const byDate = useCollectionsByDate();

  const monthTotals = useMemo(
    () =>
      calendarGrid(month)
        .map((date) => (date ? byDate.get(date) : undefined))
        .filter((list): list is MilkCollection[] => Boolean(list))
        .map(dayTotal),
    [byDate, month]
  );
  const min = Math.min(...monthTotals);
  const max = Math.max(...monthTotals);

  function dayContent(date: string): DayContent | null {
    const list = byDate.get(date);
    if (!list) return null;
    const total = dayTotal(list);
    return {
      label:
        list.length > 1
          ? `${formatLiters(total)} ×${list.length}`
          : formatLiters(total),
      heat: 0.1 + 0.24 * (max <= min ? 1 : (total - min) / (max - min)),
    };
  }

  const selectedList = byDate.get(selectedDate) ?? [];

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-ink-soft">
          Toque em um dia para ver e registrar coletas
        </p>
        <Button onClick={() => setSheetDate(today())}>
          <Plus size={16} /> Registrar coleta
        </Button>
      </div>

      <SuccessNotice message={notice} onDismiss={() => setNotice(null)} />

      {state.collections.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Truck size={28} />}
            title="Nenhuma coleta registrada"
            hint="Registre cada passagem do laticínio: data, horário e volume."
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            dayContent={dayContent}
            onDayPress={setSelectedDate}
            selectedDate={selectedDate}
            dayAriaLabel={(date, content) =>
              content
                ? `${formatDay(date)}: ${content.label} coletados`
                : `${formatDay(date)}: sem coleta`
            }
          />

          {/* Detalhe do dia selecionado */}
          <div className="border-t border-black/5 px-4 py-3 md:px-5">
            <div className="flex items-center justify-between gap-3 mb-1">
              <p className="font-medium capitalize">{formatLong(selectedDate)}</p>
              <button
                onClick={() => setSheetDate(selectedDate)}
                className="inline-flex items-center gap-1 text-sm font-medium text-pasture-700 hover:text-pasture-900 min-h-[44px] -my-1"
              >
                <Plus size={15} /> Registrar neste dia
              </button>
            </div>
            {selectedList.length === 0 ? (
              <p className="text-sm text-ink-soft py-1">
                Sem coleta em {formatRelativeDay(selectedDate)}.
              </p>
            ) : (
              <ul className="divide-y divide-black/5">
                {selectedList.map((c) => (
                  <li key={c.id} className="py-2.5 flex items-center gap-3">
                    <Truck size={16} className="text-ink-faint shrink-0" />
                    <p className="flex-1 text-sm text-ink-soft tnum">às {c.time}</p>
                    <p className="tnum font-semibold">{formatLiters(c.liters)}</p>
                    <button
                      onClick={() => setTarget({ kind: "coleta", rec: c })}
                      className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink min-h-[44px] px-2 -mr-2"
                    >
                      <Pencil size={13} /> Corrigir
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-black/5">
            <MonthChart month={month} byDate={byDate} />
          </div>
        </Card>
      )}

      {sheetDate && (
        <CollectionSheet
          key={sheetDate}
          initialDate={sheetDate}
          onClose={() => setSheetDate(null)}
          onSaved={setNotice}
        />
      )}
      {target && (
        <CorrectSheet
          key={target.rec.id}
          target={target}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}
