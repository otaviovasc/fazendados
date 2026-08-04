import { useMemo, useState } from "react";
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
import { formatDay, lastNDays } from "../../lib/dates";
import { formatLiters } from "../../lib/format";
import { Card, EmptyState, SectionTitle } from "../../components/ui";
import { Segmented } from "./Segmented";
import { LineChart as LineIcon } from "lucide-react";

type Periodo = "7" | "30";

const round1 = (v: number) => Math.round(v * 10) / 10;

export function EvolucaoProducao() {
  const { state } = useFarm();
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const dias = Number(periodo);

  const dados = useMemo(
    () =>
      lastNDays(dias).map((date) => {
        const rec = productionFor(state, date);
        // Ausência de medição vira lacuna no gráfico (null), nunca zero.
        return { date, label: formatDay(date), total: rec ? round1(rec.liters) : null };
      }),
    [state, dias]
  );

  const medidos = dados.filter((d) => d.total !== null).length;
  const media =
    medidos > 0
      ? dados.reduce((acc, d) => acc + (d.total ?? 0), 0) / medidos
      : null;

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-2">
        <div>
          <SectionTitle>Evolução da produção</SectionTitle>
          <p className="text-xs text-ink-faint -mt-1">
            Produção diária da fazenda, em litros
          </p>
        </div>
        <Segmented
          ariaLabel="Período do gráfico"
          options={[
            { value: "7", label: "7 dias" },
            { value: "30", label: "30 dias" },
          ]}
          value={periodo}
          onChange={setPeriodo}
        />
      </div>

      <Card className="p-4 md:p-5">
        {medidos === 0 ? (
          <EmptyState
            icon={<LineIcon size={28} />}
            title="Nenhuma produção registrada no período"
            hint="Registre a Produção diária no módulo Leite para ver a evolução."
          />
        ) : (
          <>
        <div className="h-56 md:h-64 -mx-1">
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
          <span className="tnum">{medidos}</span> de <span className="tnum">{dias}</span>{" "}
          dias medidos no período
          {media !== null && (
            <>
              {" · "}média dos dias medidos:{" "}
              <span className="tnum font-medium text-ink">{formatLiters(media)}</span>
            </>
          )}
        </p>
        {medidos < dias && (
          <p className="mt-1 text-xs text-ink-faint">
            Dias sem medição aparecem como interrupções na linha — ausência não é zero.
          </p>
        )}
          </>
        )}
      </Card>
    </section>
  );
}
