import type {
  AssistantProposal,
  FarmState,
  HerdGroup,
  MilkingShift,
} from "../../domain/types";
import { addDays, formatLong, today } from "../../lib/dates";
import { SHIFT_LABEL } from "../../state/store";
import { matchAnimalLabel } from "./matching";

/**
 * Interpretação simulada da Captura: heurística pequena e honesta que monta
 * uma Proposta a partir de padrões simples do texto. Nenhuma IA de verdade —
 * cada regra declarada gera issues quando algo é assumido.
 *
 * Novo modelo: Produção diária é UM valor por dia, sempre da Fazenda;
 * Controle leiteiro é 1 Lote + 1 data + 1 turno, com linhas "rótulo litros"
 * cujos vínculos com Animais são resolvidos na Revisão (matching por nome/brinco).
 */

export type DraftProposal = Omit<
  AssistantProposal,
  "id" | "captureId" | "status" | "confirmedRecordIds"
>;

type Confidence = "alta" | "media" | "baixa";

const fmt1 = (n: number) => n.toFixed(1).replace(".", ",");
const NUM = "(\\d+(?:[,.]\\d+)?)";

function detectDate(lower: string): {
  date: string;
  confidence: Confidence;
  issue?: string;
} {
  if (/\bontem\b/.test(lower))
    return { date: addDays(today(), -1), confidence: "alta" };
  if (/\bhoje\b/.test(lower)) return { date: today(), confidence: "alta" };
  return {
    date: today(),
    confidence: "media",
    issue: "Data não mencionada — assumido hoje.",
  };
}

/** "138 litros e meio" → 138.5 · "345 litros" → 345 · "410 l" → 410 */
function litersIn(lower: string): { liters: number; approximate: boolean } | null {
  const m = lower.match(new RegExp(`${NUM}(\\s+e\\s+meio)?\\s*(?:litros?|l\\b)`));
  if (!m) return null;
  const base = Number(m[1].replace(",", "."));
  return { liters: m[2] ? base + 0.5 : base, approximate: Boolean(m[2]) };
}

export interface ParsedRow {
  rawLabel: string;
  liters: number;
}

const ROW_KEYWORDS = /\b(lote|litros?|controle|ordenha|produ|coleta|manh[ãa]|tarde|fazenda)\b/;

/**
 * Linhas "rótulo valor" do controle: "mimosa 7, estrela 9,8, brinco 300 8,9".
 * Preserva o rótulo cru (capitalizado) — o vínculo com o Animal é decidido
 * na Revisão, nunca aqui.
 */
function parseRows(lower: string): ParsedRow[] {
  const src = lower.includes(":") ? lower.slice(lower.indexOf(":") + 1) : lower;
  const rows: ParsedRow[] = [];
  // Vírgula só separa linhas quando NÃO está entre dígitos ("9,8" é decimal).
  for (const seg of src.split(/(?<!\d)[,;]|[,;](?!\d)/)) {
    const m = seg
      .trim()
      .match(new RegExp(`^(.*\\D.*?)\\s+${NUM}(\\s+e\\s+meio)?$`));
    if (!m) continue;
    const label = m[1].replace(/\s+/g, " ").trim();
    if (!label || ROW_KEYWORDS.test(label)) continue;
    const liters = Number(m[2].replace(",", ".")) + (m[3] ? 0.5 : 0);
    rows.push({ rawLabel: label.replace(/^./, (c) => c.toUpperCase()), liters });
  }
  return rows;
}

/** Lote mencionado no texto, casado com os Lotes ativos da Fazenda. */
function detectGroup(
  lower: string,
  state: FarmState
): { group: HerdGroup | null; mentioned: string | null } {
  const hit = state.groups.find((g) => lower.includes(g.name.toLowerCase()));
  if (hit) return { group: hit, mentioned: hit.name };
  const m = lower.match(/lote\s*(\d+)/);
  if (m) return { group: null, mentioned: `Lote ${m[1]}` };
  return { group: null, mentioned: null };
}

/** Turno da ordenha conforme o Lote (1 ordenha/dia → "unica"). */
function detectShift(
  lower: string,
  group: HerdGroup | null,
  issues: string[]
): { shift: MilkingShift; confidence: Confidence } {
  if (group?.milkingsPerDay === 1) return { shift: "unica", confidence: "alta" };
  if (/tarde/.test(lower)) return { shift: "tarde", confidence: "alta" };
  if (/manh[ãa]/.test(lower)) return { shift: "manha", confidence: "alta" };
  issues.push("Ordenha não mencionada — assumido manhã; corrija na Revisão.");
  return { shift: "manha", confidence: "baixa" };
}

/** "às 11 e 20" · "às 10:40" · "às 8h" → "11:20" | "10:40" | "08:00" */
function timeIn(lower: string): string | null {
  const m = lower.match(/[àa]s\s+(\d{1,2})(?:\s*[:h]\s*(\d{2})|\s+e\s+(\d{2}))?/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2] ?? m[3] ?? "00"}`;
}

export function interpretCapture(text: string, state: FarmState): DraftProposal {
  const lower = text.toLowerCase();
  const dateInfo = detectDate(lower);
  const issues: string[] = [];

  // 1) Controle leiteiro — palavra "controle" ou lista de pares "rótulo valor"
  const rows = parseRows(lower);
  if (/\bcontrole\b/.test(lower) || rows.length >= 2) {
    if (dateInfo.issue) issues.push(dateInfo.issue);
    const { group, mentioned } = detectGroup(lower, state);
    if (!group) {
      issues.push(
        mentioned
          ? `${mentioned} não encontrado — escolha o Lote na Revisão.`
          : "Lote não mencionado — escolha na Revisão."
      );
    }
    const { shift, confidence: shiftConf } = detectShift(lower, group, issues);
    if (rows.length < 2)
      issues.push("Não consegui separar as medições — confira as linhas na Revisão.");
    const notFound = rows
      .filter((r) => matchAnimalLabel(r.rawLabel, state.animals).status === "nao")
      .map((r) => `“${r.rawLabel}”`);
    if (notFound.length > 0)
      issues.push(
        `Não reconheci ${notFound.join(", ")} — vincule ou cadastre na Revisão.`
      );
    const groupName = group?.name ?? mentioned ?? "";
    const n = rows.length;
    return {
      kind: "controle_leiteiro",
      title: `Controle leiteiro — ${groupName || "Lote a definir"} · ${SHIFT_LABEL[shift]} · ${n} ${
        n === 1 ? "medição" : "medições"
      }`,
      fields: [
        { key: "date", label: "Data do controle", value: dateInfo.date, confidence: dateInfo.confidence },
        { key: "group", label: "Lote", value: groupName, confidence: group ? "alta" : "baixa" },
        { key: "shift", label: "Ordenha", value: SHIFT_LABEL[shift], confidence: shiftConf },
        {
          key: "rows",
          label: "Medições",
          value: rows.map((r) => `${r.rawLabel} ${fmt1(r.liters)}`).join(" · "),
          confidence: "media",
        },
      ],
      consequences: [
        `Controle leiteiro: ${groupName || "Lote a definir"} · ${formatLong(dateInfo.date)} · ${SHIFT_LABEL[shift]}`,
        `${n} ${n === 1 ? "Medição individual" : "Medições individuais"} — vínculos conferidos na Revisão`,
      ],
      issues,
    };
  }

  const lit = litersIn(lower);

  // 2) Coleta — palavra "coleta"/"laticínio" + volume
  if (lit && (/\bcoleta\b/.test(lower) || /latic[ií]nio/.test(lower))) {
    if (dateInfo.issue) issues.push(dateInfo.issue);
    const time = timeIn(lower);
    if (!time) issues.push("Horário não identificado — preencha na Revisão.");
    if (lit.approximate) issues.push("“litros e meio” interpretado como ,5 — confira o volume.");
    return {
      kind: "coleta",
      title: `Coleta — ${fmt1(lit.liters)} L`,
      fields: [
        { key: "date", label: "Data", value: dateInfo.date, confidence: dateInfo.confidence },
        { key: "time", label: "Horário", value: time ?? "", confidence: time ? "alta" : "baixa" },
        { key: "liters", label: "Volume", value: `${fmt1(lit.liters)} L`, confidence: lit.approximate ? "media" : "alta" },
      ],
      consequences: [
        `Registro de Coleta: ${fmt1(lit.liters)} L${time ? ` às ${time}` : ""}`,
      ],
      issues,
    };
  }

  // 3) Produção diária — UM valor por dia, sempre da Fazenda toda
  if (lit) {
    if (dateInfo.issue) issues.push(dateInfo.issue);
    if (lit.approximate) issues.push("“litros e meio” interpretado como ,5 — confira o volume.");
    if (/lote\s*\d|\bordenha\b|manh[ãa]|tarde/.test(lower))
      issues.push(
        "Produção diária é um valor só, da Fazenda toda — menção a Lote/ordenha foi ignorada."
      );
    return {
      kind: "producao_diaria",
      title: "Produção diária — Fazenda",
      fields: [
        { key: "date", label: "Data", value: dateInfo.date, confidence: dateInfo.confidence },
        { key: "liters", label: "Volume", value: `${fmt1(lit.liters)} L`, confidence: lit.approximate ? "media" : "alta" },
      ],
      consequences: [`Registro de Produção diária (Fazenda): ${fmt1(lit.liters)} L`],
      issues,
    };
  }

  // 4) Fallback — lançamento financeiro
  const receita = /recebi|vendi|receita/.test(lower);
  const despesa = /paguei|gastei|comprei|despesa|conta/.test(lower);
  const am =
    lower.match(/r\$\s*(\d+(?:[,.]\d{1,2})?)/) ??
    lower.match(/(\d+(?:[,.]\d{1,2})?)\s*reais/);
  if (dateInfo.issue) issues.push(dateInfo.issue);
  if (!am) issues.push("Valor não identificado — preencha na Revisão.");
  issues.push("Texto não reconhecido como leite — tratado como lançamento financeiro.");
  return {
    kind: "lancamento_financeiro",
    title: `Lançamento financeiro — ${receita ? "Receita" : "Despesa"}`,
    fields: [
      { key: "date", label: "Data", value: dateInfo.date, confidence: dateInfo.confidence },
      {
        key: "kind",
        label: "Tipo",
        value: receita ? "Receita" : "Despesa",
        confidence: receita || despesa ? "media" : "baixa",
      },
      {
        key: "description",
        label: "Descrição",
        value: text.trim().slice(0, 120),
        confidence: "media",
      },
      { key: "amount", label: "Valor (R$)", value: am ? am[1] : "", confidence: am ? "media" : "baixa" },
    ],
    consequences: [
      `Registro de ${receita ? "Receita" : "Despesa"}${am ? `: R$ ${am[1]}` : ""}`,
    ],
    issues,
  };
}
