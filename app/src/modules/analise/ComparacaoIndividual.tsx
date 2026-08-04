import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, Info } from "lucide-react";
import { animalDailyLiters, groupOf, useFarm } from "../../state/store";
import { addDays, formatLong, today } from "../../lib/dates";
import { formatLiters } from "../../lib/format";
import {
  AbsentValue,
  Card,
  CoverageBadge,
  EmptyState,
  SectionTitle,
} from "../../components/ui";
import { Segmented } from "./Segmented";

type Periodo = "30d" | "todos";
type Ordem = "desc" | "asc";

interface Linha {
  animalId: string;
  nome: string;
  lote: string | null;
  media: number | null;
  medicoes: number;
  cobertura: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function ComparacaoIndividual() {
  const { state } = useFarm();
  const [periodo, setPeriodo] = useState<Periodo>("30d");
  const [ordem, setOrdem] = useState<Ordem>("desc");
  const [comoAberto, setComoAberto] = useState(false);

  const inicioPeriodo =
    periodo === "30d"
      ? addDays(today(), -29)
      : state.sessions.reduce(
          (min, s) => (s.date < min ? s.date : min),
          today()
        );

  const controles = useMemo(
    () =>
      state.sessions.filter(
        (s) => s.date >= inicioPeriodo && s.date <= today()
      ),
    [state.sessions, inicioPeriodo]
  );

  // Dias de controle no período (um dia pode ter várias sessões: Lotes e turnos).
  const diasControle = useMemo(
    () => [...new Set(controles.map((s) => s.date))].sort(),
    [controles]
  );

  const linhas = useMemo<Linha[]>(() => {
    const totalDias = diasControle.length;

    const base: Linha[] = state.animals
      .filter((a) => a.status === "ativo")
      .map((a) => {
        // Litros/dia: soma das ordenhas do dia (manhã + tarde, ou ordenha única).
        const diarios = diasControle
          .map((d) => animalDailyLiters(state, a.id, d))
          .filter((v): v is number => v !== null);
        const n = diarios.length;
        const media = n
          ? round1(diarios.reduce((acc, v) => acc + v, 0) / n)
          : null;
        return {
          animalId: a.id,
          nome: a.name,
          lote: groupOf(state, a.id)?.name ?? null,
          media,
          medicoes: n,
          cobertura: totalDias ? n / totalDias : 0,
        };
      });

    // Ordena por média, sem rotular: animais sem medição ficam sempre ao final.
    return base.sort((a, b) => {
      if (a.media === null && b.media === null)
        return a.nome.localeCompare(b.nome, "pt-BR");
      if (a.media === null) return 1;
      if (b.media === null) return -1;
      return ordem === "desc" ? b.media - a.media : a.media - b.media;
    });
  }, [state, diasControle, ordem]);

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-2">
        <div>
          <SectionTitle>Comparação individual</SectionTitle>
          <p className="text-xs text-ink-faint -mt-1">
            Litros por dia de cada Animal nos dias de Controle leiteiro
          </p>
        </div>
        <Segmented
          ariaLabel="Período da comparação"
          options={[
            { value: "30d", label: "30 dias" },
            { value: "todos", label: "Todos os controles" },
          ]}
          value={periodo}
          onChange={setPeriodo}
        />
      </div>

      <p className="text-xs text-ink-soft mb-2">
        Período: <span className="tnum">{formatLong(inicioPeriodo)}</span> a{" "}
        <span className="tnum">{formatLong(today())}</span>
        {" · "}
        <span className="tnum">{controles.length}</span>{" "}
        {controles.length === 1 ? "controle" : "controles"} em{" "}
        <span className="tnum">{diasControle.length}</span>{" "}
        {diasControle.length === 1 ? "dia" : "dias"}
        {" · "}média calculada somente com medições confirmadas
      </p>

      <Card>
        {controles.length === 0 ? (
          <EmptyState
            icon={<Info size={28} />}
            title="Nenhum controle leiteiro no período"
            hint="Registre um Controle leiteiro no módulo Leite para comparar os Animais."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/5 text-left text-xs text-ink-faint">
                  <th className="font-medium px-4 md:px-5 py-3">Animal</th>
                  <th className="font-medium px-3 py-3 hidden sm:table-cell">
                    Lote atual
                  </th>
                  <th className="font-medium px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        setOrdem((o) => (o === "desc" ? "asc" : "desc"))
                      }
                      aria-label={`Ordenar por média, ${
                        ordem === "desc" ? "decrescente" : "crescente"
                      }`}
                      className="inline-flex items-center gap-1 min-h-[44px] -my-2 px-1 font-medium text-ink-soft hover:text-ink transition"
                    >
                      Média (L/dia)
                      {ordem === "desc" ? (
                        <ArrowDown size={13} />
                      ) : (
                        <ArrowUp size={13} />
                      )}
                    </button>
                  </th>
                  <th className="font-medium px-3 py-3 text-right">Medições</th>
                  <th className="font-medium pl-3 pr-4 md:pr-5 py-3 text-right">
                    Cobertura
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const insuficiente = l.cobertura < 0.5;
                  return (
                    <tr
                      key={l.animalId}
                      className={`border-b border-black/5 last:border-0 ${
                        insuficiente ? "opacity-55" : ""
                      }`}
                    >
                      <td className="px-4 md:px-5 py-3">
                        <span className="font-medium">{l.nome}</span>
                        <span className="block text-xs text-ink-faint sm:hidden">
                          {l.lote ?? "sem lote"}
                        </span>
                        {insuficiente && (
                          <span className="block text-xs text-ink-faint mt-0.5">
                            cobertura insuficiente para comparação conclusiva
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-ink-soft hidden sm:table-cell">
                        {l.lote ?? <AbsentValue label="sem lote" />}
                      </td>
                      <td className="px-3 py-3 text-right tnum font-medium">
                        {l.media !== null ? (
                          formatLiters(l.media)
                        ) : (
                          <AbsentValue />
                        )}
                      </td>
                      <td className="px-3 py-3 text-right tnum text-ink-soft">
                        {l.medicoes}
                      </td>
                      <td className="pl-3 pr-4 md:pr-5 py-3 text-right">
                        <CoverageBadge ratio={l.cobertura} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-black/5">
          <button
            type="button"
            onClick={() => setComoAberto((v) => !v)}
            aria-expanded={comoAberto}
            className="w-full flex items-center justify-between px-4 md:px-5 min-h-[44px] py-2.5 text-sm font-medium text-ink-soft hover:text-ink transition"
          >
            Como é calculado
            <ChevronDown
              size={16}
              className={`transition-transform ${comoAberto ? "rotate-180" : ""}`}
            />
          </button>
          {comoAberto && (
            <div className="px-4 md:px-5 pb-4 text-sm text-ink-soft space-y-2">
              <p>
                <strong className="font-medium text-ink">Média (L/dia):</strong>{" "}
                para cada dia de Controle leiteiro, somamos as ordenhas do
                Animal naquele dia (manhã + tarde; Lotes de 1 ordenha contam a
                ordenha única). A média é a soma desses totais diários dividida
                pelos dias em que o Animal foi medido.
              </p>
              <p>
                <strong className="font-medium text-ink">Medições:</strong> em
                quantos dias o Animal foi medido no período — um dia com duas
                ordenhas conta uma vez.
              </p>
              <p>
                <strong className="font-medium text-ink">Cobertura:</strong>{" "}
                dias medidos do Animal divididos pelos dias com Controle
                leiteiro no período. Abaixo de 50%, a linha aparece atenuada.
              </p>
              <p>
                A tabela ordena, mas não classifica os Animais. Ausência de
                medição nunca conta como zero.
              </p>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
