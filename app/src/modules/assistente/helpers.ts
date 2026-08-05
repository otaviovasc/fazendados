import { dateKeyInSaoPaulo, formatLong, formatRelativeDay, timeInSaoPaulo } from "../../lib/dates";
import { formatCents, formatLiters } from "../../lib/format";
import type {
  AssistantCapture,
  AssistantProposal,
  DailyMilkProduction,
  FarmState,
  MilkCollection,
} from "../../domain/types";

/** "hoje · 07:12" a partir de um ISODateTime da Captura. */
export function formatWhen(isoDateTime: string): string {
  return `${formatRelativeDay(dateKeyInSaoPaulo(isoDateTime))} · ${timeInSaoPaulo(isoDateTime)}`;
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

const SHIFT_LABEL: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  unica: "Única",
};

export type ConfirmedHistorySummary = {
  title: string;
  detail: string;
  production?: DailyMilkProduction;
  collection?: MilkCollection;
  control?: {
    path: string;
  };
};

function hasRecord(ids: string[], id: string): boolean {
  return ids.includes(id);
}

/** Resolve a confirmed Proposal into user-facing facts; IDs remain internal. */
export function confirmedHistorySummary(
  state: FarmState,
  proposal: AssistantProposal,
): ConfirmedHistorySummary {
  const ids = proposal.confirmedRecordIds;

  if (proposal.kind === "producao_diaria") {
    const production = state.productions.find((item) => hasRecord(ids, item.id));
    if (production) {
      return {
        title: "Produção diária",
        detail: `${formatLongDate(production.date)} · ${formatLiters(production.liters)}`,
        production,
      };
    }
  }

  if (proposal.kind === "coleta") {
    const collection = state.collections.find((item) => hasRecord(ids, item.id));
    if (collection) {
      return {
        title: "Coleta",
        detail: `${formatLongDate(collection.date)} · ${collection.time} · ${formatLiters(collection.liters)}`,
        collection,
      };
    }
  }

  if (proposal.kind === "controle_leiteiro") {
    const session = state.sessions.find((item) => hasRecord(ids, item.id));
    if (session) {
      const measurements = state.measurements.filter((item) => item.sessionId === session.id);
      const groupName = state.groups.find((group) => group.id === session.groupId)?.name ?? "Lote";
      const total = measurements.reduce((sum, item) => sum + item.liters, 0);
      return {
        title: "Controle leiteiro",
        detail: `${formatLongDate(session.date)} · ${groupName} · ${SHIFT_LABEL[session.shift]} · ${measurements.length} ${measurements.length === 1 ? "animal medido" : "animais medidos"} · ${formatLiters(total)} no total`,
        control: {
          path: `/leite/controle?date=${encodeURIComponent(session.date)}&groupId=${encodeURIComponent(session.groupId)}`,
        },
      };
    }
  }

  if (proposal.kind === "trato") {
    const feeding = state.feedingEvents.find((item) => hasRecord(ids, item.id));
    if (feeding) {
      const groupName = state.groups.find((group) => group.id === feeding.groupId)?.name ?? "Lote";
      return {
        title: "Trato",
        detail: `${formatLongDate(feeding.date)} · ${groupName} · ${feeding.items.length} ${feeding.items.length === 1 ? "item" : "itens"}`,
      };
    }
  }

  if (proposal.kind === "lancamento_financeiro") {
    const financial = state.financialEntries.find((item) => hasRecord(ids, item.id));
    if (financial) {
      return {
        title: financial.kind === "receita" ? "Receita" : "Despesa",
        detail: `${formatLongDate(financial.date)} · ${formatCents(financial.amountCents)} · ${financial.description}`,
      };
    }
  }

  return {
    title: KIND_LABEL[proposal.kind] ?? proposal.title,
    detail: "Registro confirmado",
  };
}

export function confirmationAt(state: FarmState, proposalId: string): string | undefined {
  return state.audit.find(
    (event) => event.action === "confirmacao" && event.entityType === "proposta" && event.entityId === proposalId,
  )?.at;
}

function formatLongDate(date: string): string {
  return formatLong(date);
}

export function sortAssistantHistory(
  state: FarmState,
  proposals: AssistantProposal[],
): AssistantProposal[] {
  return [...proposals]
    .filter((proposal) => proposal.status !== "pendente")
    .sort((left, right) => {
      const leftAt = captureOfState(state, left.captureId)?.createdAt ?? "";
      const rightAt = captureOfState(state, right.captureId)?.createdAt ?? "";
      return rightAt.localeCompare(leftAt) || right.id.localeCompare(left.id);
    });
}

function captureOfState(state: FarmState, captureId: string): AssistantCapture | undefined {
  return state.captures.find((capture) => capture.id === captureId);
}
