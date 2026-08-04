import { formatRelativeDay } from "../../lib/dates";

/** "hoje · 07:12" a partir de um ISODateTime da Captura. */
export function formatWhen(isoDateTime: string): string {
  const date = isoDateTime.slice(0, 10);
  const time = isoDateTime.slice(11, 16);
  return `${formatRelativeDay(date)} · ${time}`;
}

export const KIND_LABEL: Record<string, string> = {
  producao_diaria: "Produção diária",
  controle_leiteiro: "Controle leiteiro",
  coleta: "Coleta",
  trato: "Trato",
  lancamento_financeiro: "Lançamento financeiro",
  desconhecida: "Captura não reconhecida",
};

export const CONFIDENCE_DOT: Record<string, string> = {
  alta: "bg-pasture-500",
  media: "bg-review-500",
  baixa: "bg-danger-600",
};

export const CONFIDENCE_LABEL: Record<string, string> = {
  alta: "confiança alta",
  media: "confiança média",
  baixa: "confiança baixa",
};
