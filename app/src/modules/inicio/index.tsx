import { Link } from "react-router-dom";
import {
  ArrowRight,
  ClipboardList,
  LogOut,
  Milk,
  Sun,
  Truck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  animalsInGroup,
  openOccupancy,
  pastureOfGroup,
  pendingProposals,
  productionFor,
  useFarm,
} from "../../state/store";
import {
  formatDay,
  formatLong,
  formatRelativeDay,
  lastNDays,
  today,
} from "../../lib/dates";
import { formatLiters } from "../../lib/format";
import {
  AbsentValue,
  Card,
  Chip,
  PageHeader,
  SectionTitle,
} from "../../components/ui";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

const ACTION_LABEL: Record<string, string> = {
  registro: "Registro",
  correcao: "Correção",
  confirmacao: "Confirmação",
  liquidacao: "Liquidação",
  movimentacao: "Movimentação",
  arquivamento: "Arquivamento",
};

export default function InicioPage() {
  const { state, logout } = useFarm();
  const t = today();

  const todayProduction = productionFor(state, t);
  const todayCollections = state.collections.filter((c) => c.date === t);
  const pending = pendingProposals(state);

  // Evolução dos últimos 7 dias — ausência vira lacuna no gráfico, nunca zero.
  const week = lastNDays(7).map((d) => {
    const p = productionFor(state, d);
    return { date: d, label: formatDay(d), liters: p ? p.liters : null };
  });
  const measured = week.filter((d) => d.liters !== null).length;

  const recentAudit = [...state.audit]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${greeting()}, ${state.user.name}`}
        subtitle={`${state.farm.name} · ${formatLong(t)}`}
        action={
          <button
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 min-h-[44px] text-sm font-medium text-ink-soft hover:bg-ink/5"
            aria-label="Sair"
            title="Sair"
          >
            <LogOut size={16} /> Sair
          </button>
        }
      />

      {/* ---------- Hoje ---------- */}
      <section>
        <SectionTitle>Hoje</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Produção diária */}
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-ink-soft">
              <Milk size={16} />
              <span className="text-sm font-medium">Produção diária</span>
            </div>
            {todayProduction ? (
              <div className="flex flex-col gap-1">
                <span className="tnum text-lg font-semibold">
                  {formatLiters(todayProduction.liters)}
                </span>
                <span className="text-sm text-ink-soft">
                  registrada hoje
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <AbsentValue label="sem registro hoje" />
                <Link
                  to="/leite/producao"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-pasture-600 min-h-[44px]"
                >
                  Registrar produção <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </Card>

          {/* Coleta */}
          <Card className="p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-ink-soft">
              <Truck size={16} />
              <span className="text-sm font-medium">Coleta</span>
            </div>
            {todayCollections.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="tnum text-lg font-semibold">
                  {formatLiters(
                    todayCollections.reduce((acc, c) => acc + c.liters, 0)
                  )}
                </span>
                <span className="text-sm text-ink-soft">
                  {todayCollections.length === 1
                    ? `às ${todayCollections[0].time}`
                    : `${todayCollections.length} coletas · última às ${
                        todayCollections[todayCollections.length - 1].time
                      }`}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <AbsentValue label="sem coleta registrada" />
                <Link
                  to="/leite/coleta"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-pasture-600 min-h-[44px]"
                >
                  Registrar coleta <ArrowRight size={15} />
                </Link>
              </div>
            )}
          </Card>

          {/* Revisões pendentes */}
          <Card
            className={`p-4 flex flex-col gap-3 ${
              pending.length > 0 ? "border-review-500/30 bg-review-100/40" : ""
            }`}
          >
            <div className="flex items-center gap-2 text-ink-soft">
              <ClipboardList size={16} />
              <span className="text-sm font-medium">Revisões pendentes</span>
            </div>
            {pending.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="tnum text-lg font-semibold text-review-700">
                  {pending.length}{" "}
                  {pending.length === 1 ? "proposta" : "propostas"}
                </span>
                <Link
                  to="/assistente"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-review-700 min-h-[44px]"
                >
                  Revisar no Assistente <ArrowRight size={15} />
                </Link>
              </div>
            ) : (
              <span className="text-sm text-ink-soft">
                Nenhuma proposta aguardando revisão.
              </span>
            )}
          </Card>
        </div>
      </section>

      {/* ---------- Ações rápidas ---------- */}
      <section>
        <SectionTitle>Registrar</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              to: "/leite/producao",
              icon: Milk,
              title: "Produção diária",
              hint: "Litros da ordenha",
            },
            {
              to: "/leite/controle",
              icon: ClipboardList,
              title: "Controle leiteiro",
              hint: "Medição individual",
            },
            {
              to: "/leite/coleta",
              icon: Truck,
              title: "Coleta",
              hint: "Retirada do laticínio",
            },
          ].map(({ to, icon: Icon, title, hint }) => (
            <Link
              key={to}
              to={to}
              className="bg-paper-card rounded-2xl border border-black/5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] p-4 flex items-center gap-3 min-h-[64px] hover:border-pasture-500/40 transition"
            >
              <span className="flex items-center justify-center w-11 h-11 rounded-xl bg-pasture-100 text-pasture-600 shrink-0">
                <Icon size={20} />
              </span>
              <span>
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-ink-soft mt-0.5">
                  {hint}
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ---------- Evolução 7 dias ---------- */}
        <section>
          <SectionTitle>Produção dos últimos 7 dias</SectionTitle>
          <Card className="p-4">
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={week}
                  margin={{ top: 6, right: 4, left: -18, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="#1C1917"
                    strokeOpacity={0.06}
                  />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#A8A29E" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "#A8A29E" }}
                    width={42}
                  />
                  <Tooltip
                    formatter={(value) => [
                      typeof value === "number" ? formatLiters(value) : "sem medição",
                      "Produção diária",
                    ]}
                    labelFormatter={(_, payload) => {
                      const p = payload?.[0]?.payload as
                        | { date?: string }
                        | undefined;
                      return p?.date ? formatDay(p.date) : "";
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="liters"
                    stroke="#2F5233"
                    strokeWidth={2}
                    fill="#DCE8DA"
                    fillOpacity={0.6}
                    connectNulls={false}
                    dot={{ r: 2.5, fill: "#2F5233", strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-ink-soft mt-2">
              {measured} de 7 dias medidos
            </p>
          </Card>
        </section>

        {/* ---------- Lotes nos pastos ---------- */}
        <section>
          <SectionTitle>Lotes nos pastos</SectionTitle>
          <Card className="divide-y divide-black/5">
            {state.groups.map((g) => {
              const pasture = pastureOfGroup(state, g.id);
              const occ = openOccupancy(state, g.id);
              const count = animalsInGroup(state, g.id).length;
              return (
                <div
                  key={g.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium">{g.name}</p>
                    <p className="text-xs text-ink-soft mt-0.5">
                      {count} {count === 1 ? "animal" : "animais"}
                    </p>
                  </div>
                  <div className="text-right">
                    {pasture ? (
                      <>
                        <p className="text-sm font-medium text-pasture-700">
                          {pasture.name}
                        </p>
                        {occ && (
                          <p className="text-xs text-ink-soft mt-0.5">
                            desde {formatDay(occ.start)}
                          </p>
                        )}
                      </>
                    ) : (
                      <AbsentValue label="sem pasto definido" />
                    )}
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      </div>

      {/* ---------- Atividade recente ---------- */}
      <section>
        <SectionTitle>Atividade recente</SectionTitle>
        <Card className="divide-y divide-black/5">
          {recentAudit.length === 0 && (
            <div className="px-4 py-6 flex flex-col items-center text-center">
              <Sun size={20} className="text-ink-faint mb-2" />
              <p className="text-sm text-ink-soft">
                Nenhuma atividade registrada ainda.
              </p>
            </div>
          )}
          {recentAudit.map((ev) => (
            <div key={ev.id} className="px-4 py-3 flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink-faint">
                  {formatRelativeDay(ev.at.slice(0, 10))} ·{" "}
                  {ACTION_LABEL[ev.action] ?? ev.action}
                </span>
                <Chip tone={ev.origin === "assistente" ? "captura" : "neutro"}>
                  {ev.origin === "assistente" ? "assistente" : "manual"}
                </Chip>
              </div>
              <p className="text-sm">{ev.description}</p>
              {ev.reason && (
                <p className="text-xs text-ink-soft">Motivo: {ev.reason}</p>
              )}
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
