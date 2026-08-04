// Materialização de Propostas confirmadas: a Confirmação executa os MESMOS
// comandos manuais do domínio (contrato Captura → Proposta → Revisão →
// Confirmação). Cada comando atravessa a fila idempotente do store; se
// qualquer passo falha, a Proposta NÃO é confirmada e o motivo volta no
// resumo para a pessoa corrigir na Revisão.
import { SHIFT_LABEL, type Action, type CommandOutcome } from "../../state/store";
import type {
  AssistantProposal,
  FarmState,
  MilkingShift,
  ProposalField,
} from "../../domain/types";
import { formatCents, formatLiters, parseDecimal } from "../../lib/format";
import { today } from "../../lib/dates";
import { uid } from "../../lib/prng";
import { normalizeLabel } from "./matching";

export type DispatchFn = (action: Action) => Promise<CommandOutcome>;

export interface RowBinding {
  animalId: string;
  liters: number;
}

export interface MaterializeResult {
  facts: number;
  summary: string;
  /** Ids dos fatos criados — gravados na Proposta na Confirmação. */
  recordIds: string[];
}

const num = (v: string): number | null =>
  parseDecimal(v.replace(/[^\d,.-]/g, ""));

const fail = (summary: string): MaterializeResult => ({ facts: 0, summary, recordIds: [] });

const failed = (outcome: CommandOutcome): outcome is { ok: false; code: string; message: string } =>
  !outcome.ok;

/** Extrai o id do fato criado de um resultado de comando bem-sucedido. */
const idOf = (outcome: CommandOutcome, key: string): string => {
  const r = outcome.ok ? (outcome.result as Record<string, { id?: string }> | null) : null;
  return r?.[key]?.id ?? "";
};

export async function materializeProposal(
  dispatch: DispatchFn,
  state: FarmState,
  proposal: AssistantProposal,
  fields: ProposalField[],
  bindings?: RowBinding[],
): Promise<MaterializeResult> {
  const get = (k: string) => fields.find((f) => f.key === k)?.value ?? "";

  switch (proposal.kind) {
    case "producao_diaria": {
      const liters = num(get("liters"));
      if (liters === null) return fail("Nada registrado — confira o volume.");
      const outcome = await dispatch({
        type: "RecordDailyMilkProduction",
        date: get("date") || today(),
        liters,
      });
      if (failed(outcome)) return fail(`Não foi possível registrar: ${outcome.message}`);
      return {
        facts: 1,
        summary: `Produção diária registrada — ${formatLiters(liters)}`,
        recordIds: [idOf(outcome, "production")],
      };
    }

    case "coleta": {
      const liters = num(get("liters"));
      const time = get("time").trim();
      if (liters === null || !time) return fail("Nada registrado — confira volume e horário.");
      const outcome = await dispatch({
        type: "RecordMilkCollection",
        date: get("date") || today(),
        time,
        liters,
      });
      if (failed(outcome)) return fail(`Não foi possível registrar: ${outcome.message}`);
      return {
        facts: 1,
        summary: `Coleta registrada — ${formatLiters(liters)} às ${time}`,
        recordIds: [idOf(outcome, "collection")],
      };
    }

    case "controle_leiteiro": {
      const group = state.groups.find(
        (g) => normalizeLabel(g.name) === normalizeLabel(get("group")),
      );
      if (!group) return fail("Nada registrado — escolha o Lote.");
      const rows = (bindings ?? []).filter((b) => b.liters > 0);
      if (rows.length === 0)
        return fail("Nada registrado — nenhuma medição vinculada.");
      const shiftLabel = normalizeLabel(get("shift"));
      const shift: MilkingShift = shiftLabel.includes("tarde")
        ? "tarde"
        : shiftLabel.includes("unica")
          ? "unica"
          : "manha";
      const date = get("date") || today();

      // Reutiliza a sessão do dia quando já existe (ex.: controle começado
      // manualmente); só cria uma nova quando não há nenhuma para o turno.
      const existing = state.sessions.find(
        (s) => s.groupId === group.id && s.date === date && s.shift === shift,
      );
      if (existing?.status === "concluido") {
        return fail(
          `O controle de ${group.name} (${SHIFT_LABEL[shift]}) já está concluído — ajuste pelo Controle.`,
        );
      }
      let sessionId = existing?.id;
      if (!sessionId) {
        sessionId = uid("cs");
        const started = await dispatch({
          type: "StartMilkControlSession",
          date,
          sessionId,
          groupId: group.id,
          shift,
        });
        if (failed(started)) return fail(`Não foi possível abrir o controle: ${started.message}`);
      }

      let recorded = 0;
      const recordIds: string[] = [];
      for (const r of rows) {
        const outcome = await dispatch({
          type: "RecordIndividualMilkMeasurement",
          sessionId,
          animalId: r.animalId,
          liters: r.liters,
        });
        if (failed(outcome)) {
          return fail(
            recorded > 0
              ? `${recorded} medições registradas, mas ${outcome.message}`
              : `Não foi possível registrar: ${outcome.message}`,
          );
        }
        recordIds.push(idOf(outcome, "measurement"));
        recorded += 1;
      }

      await dispatch({ type: "CompleteMilkControlSession", sessionId });
      const n = rows.length;
      return {
        facts: 1 + n, // sessão + medições individuais
        summary: `${n} ${n === 1 ? "medição registrada" : "medições registradas"} — ${group.name} · ${SHIFT_LABEL[shift]}`,
        recordIds: [sessionId, ...recordIds],
      };
    }

    case "lancamento_financeiro": {
      const amount = num(get("amount"));
      if (amount === null) return fail("Nada registrado — confira o valor.");
      const amountCents = Math.round(amount * 100);
      const outcome = await dispatch({
        type: "RecordFinancialEntry",
        kind: /receita/i.test(get("kind")) ? "receita" : "despesa",
        description: get("description").trim() || proposal.title,
        amountCents,
        date: get("date") || today(),
      });
      if (failed(outcome)) return fail(`Não foi possível registrar: ${outcome.message}`);
      return {
        facts: 1,
        summary: `Lançamento registrado — ${formatCents(amountCents)}`,
        recordIds: [idOf(outcome, "financialEntry")],
      };
    }

    default:
      return { facts: 0, summary: "", recordIds: [] }; // trato: sem materialização no V1
  }
}
