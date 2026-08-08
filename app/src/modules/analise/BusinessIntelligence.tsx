import { useMemo, useState } from "react";
import { Activity, AlertTriangle, BarChart3, CircleDollarSign, Database, Droplets, Wheat } from "lucide-react";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FarmState } from "../../domain/types";
import { addDays, formatDay, formatLong, today } from "../../lib/dates";
import { formatCents, formatLiters } from "../../lib/format";
import { feedBalance, useFarm } from "../../state/store";
import { Card, Chip, EmptyState, SectionTitle } from "../../components/ui";
import { Segmented } from "./Segmented";

type Period = "30" | "90" | "todos";

function inPeriod(date: string, start: string, end: string) {
  return date >= start && date <= end;
}

function rangeFor(state: FarmState, period: Period) {
  const allDates = [
    ...state.productions.map((item) => item.date),
    ...state.collections.map((item) => item.date),
    ...state.sessions.map((item) => item.date),
    ...state.financialEntries.flatMap((item) => [item.date, item.settledAt].filter((date): date is string => Boolean(date))),
    ...state.feedEntries.map((item) => item.date),
    ...state.feedingEvents.map((item) => item.date),
  ].sort();
  const end = today();
  const historicalDates = allDates.filter((date) => date <= end);
  const start = period === "todos" ? historicalDates[0] ?? end : addDays(end, -Number(period) + 1);
  return { start, end };
}

function assignmentAt(state: FarmState, animalId: string, date: string) {
  return state.assignments.find((assignment) => assignment.animalId === animalId && assignment.start <= date && (assignment.end === null || assignment.end >= date));
}

function animalsInGroupAt(state: FarmState, groupId: string, date: string) {
  return state.animals.filter((animal) => assignmentAt(state, animal.id, date)?.groupId === groupId);
}

function Metric({ label, value, hint, icon: Icon, tone = "text-ink" }: { label: string; value: string; hint: string; icon: typeof Activity; tone?: string }) {
  return <Card className="p-4">
    <div className="flex items-center gap-2 text-ink-soft"><Icon size={16} /><span className="text-sm font-medium">{label}</span></div>
    <p className={`tnum text-xl font-semibold mt-3 ${tone}`}>{value}</p>
    <p className="text-xs text-ink-faint mt-1">{hint}</p>
  </Card>;
}

export function BusinessIntelligence() {
  const { state } = useFarm();
  const [period, setPeriod] = useState<Period>("90");
  const { start, end } = useMemo(() => rangeFor(state, period), [state, period]);

  const data = useMemo(() => {
    const productions = state.productions.filter((item) => inPeriod(item.date, start, end));
    const collections = state.collections.filter((item) => inPeriod(item.date, start, end));
    const sessions = state.sessions.filter((item) => inPeriod(item.date, start, end));
    const measurements = state.measurements.filter((measurement) => {
      const session = state.sessions.find((item) => item.id === measurement.sessionId);
      return session ? inPeriod(session.date, start, end) : false;
    });
    const financial = state.financialEntries.filter((item) => item.settledAt && inPeriod(item.settledAt, start, end));
    const productionTotal = productions.reduce((sum, item) => sum + item.liters, 0);
    const collectionTotal = collections.reduce((sum, item) => sum + item.liters, 0);
    const cashResult = financial.reduce((sum, item) => sum + (item.kind === "receita" ? item.amountCents : -item.amountCents), 0);
    const expectedMeasurements = sessions.reduce((sum, session) => sum + animalsInGroupAt(state, session.groupId, session.date).length, 0);
    const measuredDays = new Set(measurements.map((measurement) => state.sessions.find((session) => session.id === measurement.sessionId)?.date).filter(Boolean)).size;
    const controlledDays = new Set(sessions.map((session) => session.date)).size;
    const byDay = new Map<string, { production: number | null; collection: number | null; controlled: number | null }>();
    for (const item of productions) byDay.set(item.date, { ...(byDay.get(item.date) ?? { production: null, collection: null, controlled: null }), production: item.liters });
    for (const item of collections) byDay.set(item.date, { ...(byDay.get(item.date) ?? { production: null, collection: null, controlled: null }), collection: (byDay.get(item.date)?.collection ?? 0) + item.liters });
    for (const session of sessions) {
      const total = measurements.filter((measurement) => measurement.sessionId === session.id).reduce((sum, measurement) => sum + measurement.liters, 0);
      byDay.set(session.date, { ...(byDay.get(session.date) ?? { production: null, collection: null, controlled: null }), controlled: (byDay.get(session.date)?.controlled ?? 0) + total });
    }
    const chart = [...byDay.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({ date, label: formatDay(date), ...values }));
    return { productions, collections, sessions, measurements, financial, productionTotal, collectionTotal, cashResult, expectedMeasurements, measuredDays, controlledDays, chart };
  }, [state, start, end]);

  const groupRows = useMemo(() => state.groups.map((group) => {
    const sessions = data.sessions.filter((session) => session.groupId === group.id);
    const sessionIds = new Set(sessions.map((session) => session.id));
    const measurements = data.measurements.filter((measurement) => sessionIds.has(measurement.sessionId));
    const expected = sessions.reduce((sum, session) => sum + animalsInGroupAt(state, group.id, session.date).length, 0);
    return { group, sessions, measurements, expected, coverage: expected ? measurements.length / expected : 0, liters: measurements.reduce((sum, measurement) => sum + measurement.liters, 0) };
  }), [state, data.sessions, data.measurements]);

  const lowStock = state.feedItems.filter((item) => feedBalance(state, item.id) <= 0);
  const observedDifference = data.productionTotal - data.collectionTotal;
  const productionAverage = data.productions.length ? data.productionTotal / data.productions.length : null;

  return <section className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><SectionTitle>Painel de inteligência operacional</SectionTitle><p className="text-sm text-ink-soft">Fatos independentes conectados por período, fonte e Cobertura de dados.</p></div>
      <Segmented ariaLabel="Período do painel" options={[{ value: "30", label: "30 dias" }, { value: "90", label: "90 dias" }, { value: "todos", label: "Todos" }]} value={period} onChange={setPeriod} />
    </div>

    <p className="text-xs text-ink-faint">Período analisado: <span className="tnum">{formatLong(start)}</span> a <span className="tnum">{formatLong(end)}</span>. Ausências não entram como zero.</p>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Metric label="Produção média" value={productionAverage === null ? "—" : formatLiters(productionAverage)} hint={`${data.productions.length} dias medidos`} icon={Droplets} tone="text-pasture-700" />
      <Metric label="Diferença observada" value={formatLiters(observedDifference)} hint={`${formatLiters(data.productionTotal)} produzidos · ${formatLiters(data.collectionTotal)} coletados`} icon={Activity} tone={observedDifference < 0 ? "text-danger-600" : "text-ink"} />
      <Metric label="Cobertura dos controles" value={data.expectedMeasurements ? `${Math.round((data.measurements.length / data.expectedMeasurements) * 100)}%` : "—"} hint={`${data.measurements.length} medições de ${data.expectedMeasurements} esperadas · ${data.measuredDays}/${data.controlledDays} dias com ao menos uma medição`} icon={BarChart3} />
      <Metric label="Resultado de caixa" value={formatCents(data.cashResult)} hint={`${data.financial.length} lançamentos liquidados`} icon={CircleDollarSign} tone={data.cashResult >= 0 ? "text-pasture-700" : "text-danger-600"} />
    </div>

    <Card className="p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3"><Activity size={17} className="text-pasture-600" /><div><h3 className="font-semibold">Fontes do leite</h3><p className="text-xs text-ink-faint">Comparação factual — não explica a causa da diferença.</p></div></div>
      {data.chart.length === 0 ? <EmptyState title="Sem fatos de leite no período" hint="Registre Produção diária, Controle leiteiro ou Coleta para abrir a análise." /> : <div className="h-64 -mx-1"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.chart} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="rgba(0,0,0,0.06)" /><XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tick={{ fontSize: 11, fill: "#A8A29E" }} /><YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#A8A29E" }} /><Tooltip formatter={(value) => typeof value === "number" ? formatLiters(value) : "sem medição"} labelFormatter={(label) => `Dia ${label}`} /><Line type="monotone" dataKey="production" name="Produção diária" stroke="#2F5233" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /><Line type="monotone" dataKey="collection" name="Coleta" stroke="#B45309" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /><Line type="monotone" dataKey="controlled" name="Soma dos controles" stroke="#2563EB" strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} /></LineChart></ResponsiveContainer></div>}
      <div className="flex flex-wrap gap-2 mt-3"><Chip tone="registro">Produção diária</Chip><Chip tone="neutro">Coleta</Chip><Chip tone="pendente">Soma dos controles</Chip></div>
    </Card>

    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="overflow-hidden"><div className="p-4 md:p-5 border-b border-black/5"><div className="flex items-center gap-2"><Wheat size={17} className="text-pasture-600" /><div><h3 className="font-semibold">Desempenho por Lote</h3><p className="text-xs text-ink-faint">Litros medidos e Cobertura; não é produção total do Lote.</p></div></div></div>{groupRows.length === 0 ? <EmptyState title="Nenhum Lote cadastrado" /> : <div className="divide-y divide-black/5">{groupRows.map((row) => <div key={row.group.id} className="p-4 flex items-center gap-3"><div className="min-w-0 flex-1"><p className="font-medium truncate">{row.group.name}</p><p className="text-xs text-ink-faint mt-0.5">{row.sessions.length} sessões · {row.measurements.length} medições</p></div><div className="text-right"><p className="tnum font-semibold">{formatLiters(row.liters)}</p><p className="text-xs text-ink-faint">{Math.round(row.coverage * 100)}% cobertura</p></div></div>)}</div>}</Card>

      <Card className="overflow-hidden"><div className="p-4 md:p-5 border-b border-black/5"><div className="flex items-center gap-2"><Database size={17} className="text-pasture-600" /><div><h3 className="font-semibold">Qualidade e ontologia</h3><p className="text-xs text-ink-faint">O que cada fato significa e onde a decisão pode falhar.</p></div></div></div><div className="p-4 md:p-5 space-y-3 text-sm"><Lineage label="Produção diária" detail="um volume único por data da Fazenda" count={data.productions.length} /><Lineage label="Controle leiteiro" detail="Lote + data + Turno; mede Animais" count={data.sessions.length} /><Lineage label="Coleta" detail="retirada do laticínio, independente da produção" count={data.collections.length} /><Lineage label="Alimento" detail="saldo derivado de entradas menos Tratos" count={state.feedItems.length} />{lowStock.length > 0 && <div className="rounded-xl bg-review-100 text-review-700 px-3 py-2.5 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{lowStock.length} {lowStock.length === 1 ? "Alimento sem saldo positivo" : "Alimentos sem saldo positivo"}. Confira o estoque antes do próximo Trato.</span></div>}</div></Card>
    </div>
  </section>;
}

function Lineage({ label, detail, count }: { label: string; detail: string; count: number }) {
  return <div className="flex items-start gap-3"><span className="size-2 rounded-full bg-pasture-500 mt-1.5 shrink-0" /><div className="min-w-0 flex-1"><p className="font-medium">{label}</p><p className="text-xs text-ink-soft">{detail}</p></div><span className="tnum text-xs text-ink-faint">{count}</span></div>;
}
