import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { productionFor, useFarm } from "../../state/store";
import {
  Button,
  Card,
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
  formatRelativeDay,
  startOfMonth,
  today,
} from "../../lib/dates";
import { CorrectSheet, type CorrectionTarget } from "./CorrectSheet";
import { MonthCalendar, type DayContent } from "./MonthCalendar";

const round1 = (v: number) => Math.round(v * 10) / 10;

/** Intensidade do preenchimento da célula, entre 0 e 1, relativa ao mês. */
function intensity(liters: number, min: number, max: number): number {
  if (max <= min) return 1;
  return (liters - min) / (max - min);
}

function ProductionSheet({
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
  const [liters, setLiters] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseDecimal(liters);
  const invalid = liters.trim() !== "" && parsed === null;
  const existing = productionFor(state, date);
  const guard = useUnsavedGuard(liters.trim() !== "" || date !== initialDate, onClose);

  async function submit() {
    if (parsed === null || busy || existing) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "RecordDailyMilkProduction",
      date,
      liters: parsed,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onSaved(
      `Produção de ${formatRelativeDay(date)} registrada — ${formatLiters(parsed)}`
    );
    onClose();
  }

  return (
    <Sheet
      open
      onClose={guard.requestClose}
      title="Registrar produção"
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
              disabled={parsed === null || busy || Boolean(existing)}
              className="flex-1"
            >
              {busy ? "Registrando…" : "Registrar produção"}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
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

        <Field
          label="Produção do dia (L)"
          hint="Um valor por dia, para a Fazenda inteira — some as ordenhas, se houver mais de uma."
        >
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

        {existing && (
          <div className="rounded-xl bg-review-100 text-review-700 text-sm px-3.5 py-3">
            Já existe Produção diária nesta data ({formatLiters(existing.liters)}).
            Para ajustar o valor, toque no dia no calendário e use "Corrigir" — a
            correção pede um motivo e guarda o antes e o depois na auditoria.
          </div>
        )}

        {invalid && (
          <p className="text-sm text-danger-600">
            Valor inválido — use números, ex.: 348,5.
          </p>
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

function MonthChart({ month }: { month: string }) {
  const { state } = useFarm();

  const dados = useMemo(
    () =>
      calendarGrid(month)
        .filter((date): date is string => date !== null)
        .map((date) => {
          const rec = productionFor(state, date);
          // Ausência de medição vira lacuna no gráfico (null), nunca zero.
          return { date, label: date.slice(8), total: rec ? round1(rec.liters) : null };
        }),
    [state, month]
  );

  const medidos = dados.filter((d) => d.total !== null).length;
  const media =
    medidos > 0
      ? dados.reduce((acc, d) => acc + (d.total ?? 0), 0) / medidos
      : null;

  if (medidos === 0) {
    return (
      <p className="px-4 py-5 md:px-5 text-sm text-ink-soft">
        Nenhuma produção registrada neste mês. Toque em um dia para registrar.
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
                typeof value === "number" ? formatLiters(value) : "sem medição",
                "Produção diária",
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
        <span className="tnum">{medidos}</span> de{" "}
        <span className="tnum">{dados.length}</span> dias medidos no mês
        {media !== null && (
          <>
            {" · "}média dos dias medidos:{" "}
            <span className="tnum font-medium text-ink">{formatLiters(media)}</span>
          </>
        )}
      </p>
      {medidos < dados.length && (
        <p className="mt-1 text-xs text-ink-faint">
          Dias sem medição aparecem como interrupções na linha — ausência não é zero.
        </p>
      )}
    </div>
  );
}

export default function ProducaoTab() {
  const { state } = useFarm();
  const [month, setMonth] = useState(() => startOfMonth(today()));
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [target, setTarget] = useState<CorrectionTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const litersList = useMemo(
    () =>
      calendarGrid(month)
        .map((date) => (date ? productionFor(state, date)?.liters : undefined))
        .filter((v): v is number => v !== undefined),
    [state, month]
  );
  const min = Math.min(...litersList);
  const max = Math.max(...litersList);

  function dayContent(date: string): DayContent | null {
    const rec = productionFor(state, date);
    if (!rec) return null;
    return {
      label: formatLiters(rec.liters),
      heat: 0.1 + 0.24 * intensity(rec.liters, min, max),
    };
  }

  function openDay(date: string) {
    const rec = productionFor(state, date);
    if (rec) {
      setTarget({ kind: "producao", rec });
    } else {
      setSheetDate(date);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-ink-soft">
          Toque em um dia para registrar ou corrigir
        </p>
        <Button onClick={() => setSheetDate(today())}>
          <Plus size={16} /> Registrar produção
        </Button>
      </div>

      <SuccessNotice message={notice} onDismiss={() => setNotice(null)} />

      <Card className="overflow-hidden">
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          dayContent={dayContent}
          onDayPress={openDay}
          dayAriaLabel={(date, content) =>
            content
              ? `${formatDay(date)}: ${content.label} — corrigir`
              : `${formatDay(date)}: registrar produção`
          }
        />
        <div className="border-t border-black/5">
          <MonthChart month={month} />
        </div>
      </Card>

      {sheetDate && (
        <ProductionSheet
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
