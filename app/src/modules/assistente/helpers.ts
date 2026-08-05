import { formatRelativeDay } from "../../lib/dates";
import type { AssistantCapture } from "../../domain/types";

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

/** Referências privadas de imagem — a UI nunca recebe nem expõe storageKey/URL. */
export function captureImageReferences(capture: AssistantCapture): string[] {
  return capture.attachments
    ?.filter((attachment) => attachment.kind === "imagem")
    .map((attachment) => attachment.id) ?? [];
}

/** URL autenticada da mídia original; storage nunca é exposto ao navegador. */
export function captureAttachmentUrl(captureId: string, attachmentId: string): string {
  return `/api/assistant/captures/${encodeURIComponent(captureId)}/attachments/${encodeURIComponent(attachmentId)}`;
}
