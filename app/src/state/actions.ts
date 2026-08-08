// Contrato de comandos do cliente — espelha 1:1 o `actionSchema` do servidor
// (src/server/commands.ts). Toda mutação atravessa POST /api/commands com
// idempotencyKey; nenhum fato é criado apenas no cliente.
import type {
  InstallationType,
  LatLng,
  MilkingShift,
  AssistantAttachmentCategory,
  ProposalField,
  ProposalKind,
} from "../domain/types";

/** Proposta enviada junto da Captura (o servidor atribui ids e status). */
export interface ProposalInput {
  kind: ProposalKind;
  title: string;
  fields: ProposalField[];
  consequences: string[];
  issues: string[];
  dismissReason?: string;
}

export type Action =
  | { type: "RecordDailyMilkProduction"; date: string; liters: number }
  | {
      type: "StartMilkControlSession";
      date: string;
      sessionId: string;
      groupId: string;
      shift: MilkingShift;
    }
  | {
      type: "RecordIndividualMilkMeasurement";
      sessionId: string;
      animalId: string;
      liters: number;
    }
  | { type: "CompleteMilkControlSession"; sessionId: string }
  | { type: "RecordMilkCollection"; date: string; time: string; liters: number }
  | {
      // Correção data-only (D-026): edita fatos, nunca entidades de cadastro;
      // motivo obrigatório e antes/depois gravados na auditoria pelo servidor.
      type: "CorrectOperationalFact";
      entityType: "producao_diaria" | "coleta" | "medicao_individual";
      entityId: string;
      newLiters: number;
      reason: string;
      description: string;
      before: string;
      after: string;
    }
  | { type: "RegisterAnimal"; name: string; tag?: string; groupId?: string; date: string }
  | { type: "UpdateAnimal"; animalId: string; name: string; tag?: string }
  | { type: "ArchiveAnimal"; animalId: string; reason: string; date: string }
  | { type: "CreateHerdGroup"; name: string; milkingsPerDay: 1 | 2 }
  | { type: "AssignAnimalToGroup"; animalId: string; groupId: string; date: string }
  | { type: "RegisterPasture"; name: string; polygon: LatLng[] }
  | { type: "SetFarmBoundary"; name: string; polygon: LatLng[] }
  | { type: "UpdatePasture"; pastureId: string; name: string; polygon: LatLng[] }
  | { type: "RegisterInstallation"; name: string; instType: InstallationType; point: LatLng }
  | { type: "MoveHerdGroup"; groupId: string; pastureId: string; date: string }
  | { type: "RegisterFeedItem"; name: string; unit: string }
  | {
      type: "RecordFeedEntry";
      itemId: string;
      date: string;
      quantity: number;
      origin: string;
      note?: string;
    }
  | {
      type: "RecordFeedingEvent";
      groupId: string;
      date: string;
      items: { itemId: string; quantity: number }[];
    }
  | {
      type: "RecordFinancialEntry";
      kind: "receita" | "despesa";
      description: string;
      amountCents: number;
      date: string;
      dueDate?: string;
    }
  | { type: "SettleFinancialEntry"; entryId: string; date: string }
  | { type: "CreateAssistantCapture"; text: string; proposals: ProposalInput[] }
  | { type: "CreateAssistantCaptureFromAttachment"; attachmentId: string; text?: string }
  | { type: "UpdateAssistantAttachment"; attachmentId: string; name: string; category: AssistantAttachmentCategory }
  | { type: "DeleteAssistantAttachment"; attachmentId: string }
  | {
      type: "ConfirmAssistantProposal";
      proposalId: string;
      fields: ProposalField[];
      bindings?: { animalId: string; liters: number; assignmentAction?: "move" | "keep" }[];
    }
  | { type: "DismissAssistantProposal"; proposalId: string; reason?: string };
