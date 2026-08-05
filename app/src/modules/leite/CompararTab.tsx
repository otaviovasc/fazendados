import { Info } from "lucide-react";
import { productionFor, sessionsOnDate, useFarm } from "../../state/store";
import { AbsentValue, Card, SectionTitle } from "../../components/ui";
import { formatLiters } from "../../lib/format";
import { dateKeyInSaoPaulo, formatLong, formatRelativeDay, formatWeekday, lastNDays } from "../../lib/dates";

function SourceValue({
  label,
  value,
  absentLabel,
}: {
  label: string;
  value: number | null;
  absentLabel?: string;
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-ink-faint mb-0.5">
        {label}
      </p>
      {value === null ? (
        <AbsentValue label={absentLabel} />
      ) : (
        <p className="tnum font-semibold">{formatLiters(value)}</p>
      )}
    </div>
  );
}

export default function CompararTab() {
  const { state } = useFarm();
  const days = lastNDays(14).reverse();

  const rows = days.map((day) => {
    const prod = productionFor(state, day);
    const prodTotal = prod ? prod.liters : null;

    const daySessions = sessionsOnDate(state, day);
    const dayMeasurements = state.measurements.filter((m) =>
      daySessions.some((s) => s.id === m.sessionId)
    );
    const measTotal =
      dayMeasurements.length > 0
        ? Math.round(dayMeasurements.reduce((acc, m) => acc + m.liters, 0) * 10) / 10
        : null;

    const dayCollections = state.collections.filter((c) => c.date === day);
    const colTotal =
      dayCollections.length > 0
        ? dayCollections.reduce((acc, c) => acc + c.liters, 0)
        : null;

    const pairs: { label: string; diff: number }[] = [];
    if (prodTotal !== null && measTotal !== null)
      pairs.push({
        label: "Produção × medições",
        diff: Math.abs(prodTotal - measTotal),
      });
    if (prodTotal !== null && colTotal !== null)
      pairs.push({
        label: "Produção × coleta",
        diff: Math.abs(prodTotal - colTotal),
      });
    if (measTotal !== null && colTotal !== null)
      pairs.push({
        label: "Medições × coleta",
        diff: Math.abs(measTotal - colTotal),
      });

    return { day, prodTotal, measTotal, colTotal, pairs };
  });

  const corrections = state.audit
    .filter((a) => a.action === "correcao")
    .slice(0, 5);

  return (
    <div>
      <Card className="p-4 md:p-5 mb-4 flex gap-3">
        <Info size={18} className="text-ink-faint shrink-0 mt-0.5" />
        <p className="text-sm text-ink-soft">
          Produção diária, Medições individuais e Coleta são fatos independentes,
          registrados em momentos diferentes. A Diferença observada apenas
          compara os números — o sistema não infere causa nem aponta erro.
        </p>
      </Card>

      <SectionTitle>Últimos 14 dias</SectionTitle>
      <Card className="divide-y divide-black/5 mb-6">
        {rows.map((r) => (
          <div key={r.day} className="px-4 py-3.5 md:px-5">
            <p className="font-medium capitalize mb-2">
              {formatWeekday(r.day)}{" "}
              <span className="text-ink-soft font-normal">
                · {formatRelativeDay(r.day)}
              </span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              <SourceValue label="Produção diária" value={r.prodTotal} />
              <SourceValue
                label="Soma de medições"
                value={r.measTotal}
                absentLabel="sem controle"
              />
              <SourceValue
                label="Coleta"
                value={r.colTotal}
                absentLabel="sem registro"
              />
            </div>
            {r.pairs.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {r.pairs.map((p) => (
                  <p key={p.label} className="text-xs text-ink-faint tnum">
                    Diferença observada ({p.label}): {formatLiters(p.diff)}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </Card>

      <SectionTitle>Correções recentes</SectionTitle>
      {corrections.length === 0 ? (
        <Card className="p-4 md:p-5">
          <p className="text-sm text-ink-soft">
            Nenhuma correção registrada ainda.
          </p>
        </Card>
      ) : (
        <Card className="divide-y divide-black/5">
          {corrections.map((c) => (
            <div key={c.id} className="px-4 py-3.5 md:px-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium">{c.description}</p>
                <p className="text-xs text-ink-faint shrink-0">
                  {formatLong(dateKeyInSaoPaulo(c.at))}
                </p>
              </div>
              {c.before && c.after && (
                <p className="text-sm text-ink-soft tnum mt-1">
                  {c.before} → {c.after}
                </p>
              )}
              {c.reason && (
                <p className="text-xs text-ink-faint mt-1">
                  Motivo: {c.reason}
                </p>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
