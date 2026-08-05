import { z } from 'zod';
import { env } from './env.js';
import { ApiError } from './http.js';
import { errorType, logger } from './logger.js';

/**
 * Fronteira única com o modelo. O provider só entende a Captura e devolve
 * intents sem IDs do banco; a conversão para Proposta é determinística e
 * continua separada da Confirmação que cria fatos.
 */

const confidence = z.enum(['HIGH', 'MEDIUM', 'LOW']);
const dateSchema = z.object({
  relative: z.string().nullable(),
  iso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  rawText: z.string(),
});
const nullableNumber = z.number().finite().nonnegative().nullable();
const common = {
  date: dateSchema,
  confidence,
  notes: z.string().nullable(),
};

const intentSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('daily_milk_total'),
    ...common,
    scopeLabel: z.string().nullable(),
    morningLiters: nullableNumber,
    afternoonLiters: nullableNumber,
    rawValueText: z.string(),
  }),
  z.object({
    type: z.literal('individual_milk_session'),
    ...common,
    scopeLabel: z.string().nullable(),
    period: z.enum(['MORNING', 'AFTERNOON']).nullable(),
    measurements: z.array(z.object({
      animalLabel: z.string().min(1),
      morningLiters: nullableNumber,
      afternoonLiters: nullableNumber,
      totalLiters: nullableNumber,
      rawValueText: z.string(),
      confidence,
      notes: z.string().nullable(),
    })).min(1),
  }),
  z.object({
    type: z.literal('milk_collection'),
    ...common,
    liters: nullableNumber,
    time: z.string().nullable(),
    sourceLabel: z.string().nullable(),
    rawValueText: z.string(),
  }),
  z.object({
    type: z.literal('revenue'),
    ...common,
    categoryLabel: z.string().nullable(),
    description: z.string(),
    amount: nullableNumber,
    received: z.boolean().nullable(),
    dueDate: dateSchema.nullable(),
  }),
  z.object({
    type: z.literal('purchase'),
    ...common,
    categoryLabel: z.string().nullable(),
    description: z.string(),
    amount: nullableNumber,
    paid: z.boolean().nullable(),
    dueDate: dateSchema.nullable(),
  }),
  z.object({
    type: z.literal('feeding_event'),
    ...common,
    contextLabel: z.string().nullable(),
    scopeLabel: z.string().nullable(),
    lines: z.array(z.object({
      itemLabel: z.string().min(1),
      quantity: nullableNumber,
      unitLabel: z.string().nullable(),
      rawValueText: z.string(),
    })).min(1),
  }),
  z.object({
    type: z.literal('unknown'),
    reason: z.string().min(1),
  }),
]);

const interpretationSchema = z.object({ intents: z.array(intentSchema).min(1).max(8) });
type Intent = z.infer<typeof intentSchema>;

export type AssistantProposalInput = {
  kind: 'producao_diaria' | 'controle_leiteiro' | 'coleta' | 'trato' | 'lancamento_financeiro' | 'desconhecida';
  title: string;
  fields: Array<{ key: string; label: string; value: string; confidence: 'alta' | 'media' | 'baixa' }>;
  consequences: string[];
  issues: string[];
};

export type AssistantContext = {
  groups: Array<{ name: string; milkingsPerDay: 1 | 2 }>;
  animals: Array<{ name: string; tag?: string }>;
  feedItems: Array<{ name: string; unit: string }>;
};

const CONSTITUTION = `Você transforma uma Captura de uma fazenda leiteira em Propostas revisáveis para o FazenDados.

Regras invioláveis:
- Não invente dados. Registre somente o que foi dito na Captura.
- Preserve rótulos exatamente como foram escritos ou falados: nomes de Animais, Lotes e Alimentos.
- Nunca produza IDs do sistema. O vínculo com IDs acontece depois, na Revisão humana.
- Uma Captura pode conter várias ações; devolva uma intent para cada ação independente.
- Se algo estiver ausente ou ambíguo, preserve o que existir e use confidence MEDIUM ou LOW; nunca descarte silenciosamente.
- Ausência não é zero. Não transforme estimativa, inferência ou sugestão de manejo em fato.
- Datas relativas usam relative (hoje, ontem, anteontem). Datas explícitas usam iso no formato AAAA-MM-DD. Sempre preserve rawText.
- Números em português: “nove e meio” = 9.5; “1.234,5” = 1234.5.
- Produção diária é um único volume por data para a Fazenda, sem turno e sem Lote.
- Controle leiteiro é Lote + data + turno (MORNING ou AFTERNOON), com uma medição por Animal.
- No controle leiteiro, leia linhas no padrão “animal - 7,5” ou “animal - 12.5”; o volume tem no máximo 3 dígitos inteiros, 1 casa decimal e fica entre 0 e 100 L. Nunca invente, junte ou corrija números malformados.
- Coleta é retirada de leite, independente da Produção diária.
- Trato é alimento fornecido a um Lote; compra de alimento é lançamento financeiro nesta V1.
- Não diagnostique doença, não recomende descarte e não crie ocupação de Pasto ou Instalação a partir da fala.`;

const ACTIONS = `Tipos de intent suportados. O campo type é obrigatório em cada intent:

1) type: "daily_milk_total": produção diária da Fazenda. Campos: type, date, scopeLabel, morningLiters, afternoonLiters, rawValueText, confidence, notes.
2) type: "individual_milk_session": controle leiteiro. Campos: type, date, scopeLabel, period, measurements[], confidence, notes. Cada medição tem animalLabel, morningLiters, afternoonLiters, totalLiters, rawValueText, confidence, notes. Para “Leite por vaca”, preserve cada linha no padrão “animal - volume” e só aceite volumes de 0 a 100 L com 1 casa decimal (vírgula ou ponto).
3) type: "milk_collection": coleta. Campos: type, date, liters, time, sourceLabel, rawValueText, confidence, notes.
4) type: "revenue": receita. Campos: type, date, categoryLabel, description, amount, received, dueDate, confidence, notes.
5) type: "purchase": despesa. Campos: type, date, categoryLabel, description, amount, paid, dueDate, confidence, notes.
6) type: "feeding_event": trato. Campos: type, date, contextLabel, scopeLabel, lines[] com itemLabel, quantity, unitLabel, rawValueText, confidence, notes.
7) type: "unknown": não corresponde a um Registro suportado. Campos: type, reason.`;

const OUTPUT_CONTRACT = `Responda SOMENTE com JSON válido, sem Markdown, no formato:
{ "intents": [ { ... } ] }
Cada intent deve conter explicitamente o campo type. Intents diferentes de unknown também devem conter confidence e notes no nível da intent.
Use null quando um campo opcional não foi informado. Não use campos extras.`;

function dateKeyInSaoPaulo(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayForRelative(relative: string | null): string | null {
  if (!relative) return null;
  const normalized = relative.toLowerCase().trim();
  const today = dateKeyInSaoPaulo();
  if (normalized === 'hoje') return today;
  if (normalized === 'ontem') return addDays(today, -1);
  if (normalized === 'anteontem') return addDays(today, -2);
  return null;
}

function confidenceLabel(value: z.infer<typeof confidence>): 'alta' | 'media' | 'baixa' {
  return value === 'HIGH' ? 'alta' : value === 'MEDIUM' ? 'media' : 'baixa';
}

function numberText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

function field(key: string, label: string, value: string, valueConfidence: z.infer<typeof confidence> = 'HIGH') {
  return { key, label, value, confidence: confidenceLabel(valueConfidence) } as const;
}

function dateField(date: z.infer<typeof dateSchema> | null | undefined, issues: string[]) {
  if (!date) {
    issues.push('Data não informada — preencha na Revisão.');
    return field('date', 'Data', '', 'LOW');
  }
  if (date.iso) return field('date', 'Data', date.iso, 'HIGH');
  const relative = todayForRelative(date.relative);
  if (relative) return field('date', 'Data', relative, 'HIGH');
  issues.push('Não foi possível resolver a data — preencha na Revisão.');
  return field('date', 'Data', '', 'LOW');
}

function uniqueIssues(issues: string[]): string[] {
  return [...new Set(issues.filter(Boolean))];
}

function toProposal(intent: Intent, context: AssistantContext): AssistantProposalInput {
  const issues: string[] = [];

  if (intent.type === 'unknown') {
    return {
      kind: 'desconhecida',
      title: 'Captura não reconhecida',
      fields: [field('reason', 'Motivo', intent.reason, 'LOW')],
      consequences: ['Nenhum Registro será criado.'],
      issues: [intent.reason, 'Revise a Captura ou descarte esta Proposta.'],
    };
  }

  const date = dateField(intent.date, issues);
  if (intent.type === 'daily_milk_total') {
    const values = [intent.morningLiters, intent.afternoonLiters].filter((value): value is number => value !== null);
    const liters = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    if (liters === null) issues.push('Volume não informado — preencha na Revisão.');
    if (intent.scopeLabel) issues.push('Produção diária é da Fazenda; a menção ao Lote foi preservada para conferência.');
    if (intent.notes) issues.push(intent.notes);
    return {
      kind: 'producao_diaria',
      title: 'Produção diária — Fazenda',
      fields: [
        date,
        field('liters', 'Volume', numberText(liters), intent.confidence),
        field('rawValueText', 'Trecho do volume', intent.rawValueText || '', intent.confidence),
      ],
      consequences: [liters === null ? 'Produção diária aguardando volume.' : `Registro de Produção diária: ${numberText(liters)} L`],
      issues: uniqueIssues(issues),
    };
  }

  if (intent.type === 'individual_milk_session') {
    const knownGroup = intent.scopeLabel
      ? context.groups.find((group) => group.name.toLowerCase() === intent.scopeLabel?.toLowerCase())
      : undefined;
    if (!intent.scopeLabel) issues.push('Lote não informado — escolha na Revisão.');
    else if (!knownGroup) issues.push(`Lote “${intent.scopeLabel}” não encontrado — escolha na Revisão.`);
    if (!intent.period) issues.push('Turno não informado — escolha manhã ou tarde na Revisão.');
    const rows: string[] = [];
    for (const measurement of intent.measurements) {
      const liters = intent.period === 'AFTERNOON'
        ? measurement.afternoonLiters ?? measurement.totalLiters
        : measurement.morningLiters ?? measurement.totalLiters;
      if (liters === null) {
        issues.push(`Sem volume para “${measurement.animalLabel}” — confira na Revisão.`);
        continue;
      }
      rows.push(`${measurement.animalLabel} ${numberText(liters)}`);
    }
    if (!rows.length) issues.push('Nenhuma medição utilizável foi encontrada.');
    if (intent.notes) issues.push(intent.notes);
    const shift = intent.period === 'MORNING' ? 'Manhã' : intent.period === 'AFTERNOON' ? 'Tarde' : '';
    return {
      kind: 'controle_leiteiro',
      title: `Controle leiteiro — ${intent.scopeLabel || 'Lote a definir'}${shift ? ` · ${shift}` : ''}`,
      fields: [
        date,
        field('group', 'Lote', intent.scopeLabel ?? '', intent.scopeLabel && knownGroup ? 'HIGH' : 'LOW'),
        field('shift', 'Ordenha', shift, intent.period ? 'HIGH' : 'LOW'),
        field('rows', 'Medições', rows.join(' · '), intent.confidence),
      ],
      consequences: [`${rows.length} Medição(ões) individual(is) serão conferidas na Revisão.`],
      issues: uniqueIssues(issues),
    };
  }

  if (intent.type === 'milk_collection') {
    if (intent.liters === null) issues.push('Volume não informado — preencha na Revisão.');
    if (!intent.time) issues.push('Horário não informado — preencha na Revisão.');
    if (intent.notes) issues.push(intent.notes);
    return {
      kind: 'coleta',
      title: `Coleta — ${numberText(intent.liters)} L`.trim(),
      fields: [
        date,
        field('time', 'Horário', intent.time ?? '', intent.time ? 'HIGH' : 'LOW'),
        field('liters', 'Volume', numberText(intent.liters), intent.confidence),
        field('source', 'Origem informada', intent.sourceLabel ?? '', 'MEDIUM'),
      ],
      consequences: ['Registro de Coleta independente da Produção diária.'],
      issues: uniqueIssues(issues),
    };
  }

  if (intent.type === 'feeding_event') {
    const knownGroup = intent.scopeLabel
      ? context.groups.find((group) => group.name.toLowerCase() === intent.scopeLabel?.toLowerCase())
      : undefined;
    if (!intent.scopeLabel) issues.push('Lote não informado — escolha na Revisão.');
    else if (!knownGroup) issues.push(`Lote “${intent.scopeLabel}” não encontrado — escolha na Revisão.`);
    const items = intent.lines.map((line) => `${line.itemLabel} ${numberText(line.quantity)}${line.unitLabel ? ` ${line.unitLabel}` : ''}`.trim()).join(' · ');
    if (intent.lines.some((line) => line.quantity === null)) issues.push('Há alimento sem quantidade — confira na Revisão.');
    if (intent.notes) issues.push(intent.notes);
    return {
      kind: 'trato',
      title: `Trato — ${intent.scopeLabel || 'Lote a definir'}`,
      fields: [date, field('group', 'Lote', intent.scopeLabel ?? '', intent.scopeLabel && knownGroup ? 'HIGH' : 'LOW'), field('items', 'Alimentos', items, intent.confidence)],
      consequences: ['Registro de Trato e atualização do Saldo de alimento derivado após a Confirmação.'],
      issues: uniqueIssues(issues),
    };
  }

  const kind = intent.type === 'revenue' ? 'receita' : 'despesa';
  const amount = intent.amount === null ? '' : numberText(intent.amount);
  if (intent.amount === null) issues.push('Valor não informado — preencha na Revisão.');
  if (intent.notes) issues.push(intent.notes);
  if (intent.type === 'revenue' && intent.received === true) issues.push('A Liquidação será confirmada no fluxo Financeiro; não foi aplicada automaticamente.');
  if (intent.type === 'purchase' && intent.paid === true) issues.push('A Liquidação será confirmada no fluxo Financeiro; não foi aplicada automaticamente.');
  return {
    kind: 'lancamento_financeiro',
    title: `${kind === 'receita' ? 'Receita' : 'Despesa'} — ${intent.description || intent.categoryLabel || 'a classificar'}`,
    fields: [
      date,
      field('kind', 'Natureza', kind, 'HIGH'),
      field('description', 'Descrição', intent.description || intent.categoryLabel || '', intent.confidence),
      field('amount', 'Valor', amount, intent.confidence),
      field('dueDate', 'Vencimento', intent.dueDate?.iso ?? todayForRelative(intent.dueDate?.relative ?? null) ?? '', intent.dueDate ? 'MEDIUM' : 'LOW'),
    ],
    consequences: ['Lançamento financeiro previsto; a Liquidação permanece uma decisão separada.'],
    issues: uniqueIssues(issues),
  };
}

function messageContent(raw: unknown): string {
  const content = (raw as { choices?: Array<{ message?: { content?: unknown } }> } | null)?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (content && typeof content === 'object' && typeof (content as { text?: unknown }).text === 'string') return (content as { text: string }).text;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is { text: string } => Boolean(part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'))
    .map((part) => part.text)
    .join('');
}

function stripMarkdownJson(value: string): string {
  const stripped = value.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  return start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped;
}

function nullableModelNumber(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const compact = value.trim().replace(/\s/g, '');
  if (!/^\d+(?:[,.]\d+)?$/.test(compact)) return null;
  const normalized = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function nullableIndividualMilkLiters(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && value <= 100 && Math.abs(value * 10 - Math.round(value * 10)) < 1e-9 ? value : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  const plain = trimmed.match(/^\d{1,3}(?:[,.]\d)?$/);
  const ocrLine = trimmed.match(/^.+?\s*-\s*(\d{1,3}(?:[,.]\d)?)$/);
  const rawNumber = plain?.[0] ?? ocrLine?.[1] ?? null;
  if (!rawNumber) return null;
  const parsed = Number(rawNumber.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null;
}

function modelConfidence(value: unknown): 'HIGH' | 'MEDIUM' | 'LOW' {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') : '';
  if (normalized === 'HIGH' || normalized === 'ALTA') return 'HIGH';
  if (normalized === 'MEDIUM' || normalized === 'MEDIA') return 'MEDIUM';
  return 'LOW';
}

function modelDate(value: unknown): unknown {
  if (typeof value === 'string') {
    return /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? { relative: null, iso: value, rawText: value }
      : { relative: value, iso: null, rawText: value };
  }
  if (!value || typeof value !== 'object') return { relative: null, iso: null, rawText: '' };
  const date = value as Record<string, unknown>;
  return {
    relative: typeof date.relative === 'string' ? date.relative : null,
    iso: typeof date.iso === 'string' ? date.iso : null,
    rawText: typeof date.rawText === 'string' ? date.rawText : '',
  };
}

function inferIntentType(intent: Record<string, unknown>): unknown {
  if (typeof intent.type === 'string') return intent.type;
  if (Array.isArray(intent.measurements)) return 'individual_milk_session';
  if (Array.isArray(intent.lines)) return 'feeding_event';
  if ('received' in intent) return 'revenue';
  if ('paid' in intent) return 'purchase';
  if ('liters' in intent && ('time' in intent || 'sourceLabel' in intent)) return 'milk_collection';
  if ('morningLiters' in intent || 'afternoonLiters' in intent) return 'daily_milk_total';
  if ('reason' in intent) return 'unknown';
  return undefined;
}

function normalizeModelIntent(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const intent = value as Record<string, unknown>;
  const type = inferIntentType(intent);
  const common = {
    ...intent,
    type,
    date: modelDate(intent.date),
    confidence: modelConfidence(intent.confidence),
    notes: typeof intent.notes === 'string' ? intent.notes : null,
  };

  if (type === 'individual_milk_session') {
    return {
      ...common,
      scopeLabel: typeof intent.scopeLabel === 'string' ? intent.scopeLabel : null,
      period: typeof intent.period === 'string'
        ? ({ MORNING: 'MORNING', AFTERNOON: 'AFTERNOON', MANHA: 'MORNING', TARDE: 'AFTERNOON' } as Record<string, string>)[intent.period.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')] ?? null
        : null,
      measurements: Array.isArray(intent.measurements) ? intent.measurements.map((item) => {
        const measurement = item && typeof item === 'object' ? item as Record<string, unknown> : {};
        return {
          ...measurement,
          morningLiters: nullableIndividualMilkLiters(measurement.morningLiters),
          afternoonLiters: nullableIndividualMilkLiters(measurement.afternoonLiters),
          totalLiters: nullableIndividualMilkLiters(measurement.totalLiters),
          rawValueText: typeof measurement.rawValueText === 'string' ? measurement.rawValueText : '',
          confidence: modelConfidence(measurement.confidence),
          notes: typeof measurement.notes === 'string' ? measurement.notes : null,
        };
      }) : [],
    };
  }

  if (type === 'daily_milk_total') {
    return { ...common, scopeLabel: typeof intent.scopeLabel === 'string' ? intent.scopeLabel : null, morningLiters: nullableModelNumber(intent.morningLiters), afternoonLiters: nullableModelNumber(intent.afternoonLiters), rawValueText: typeof intent.rawValueText === 'string' ? intent.rawValueText : '' };
  }
  if (type === 'milk_collection') {
    return { ...common, liters: nullableModelNumber(intent.liters), time: typeof intent.time === 'string' ? intent.time : null, sourceLabel: typeof intent.sourceLabel === 'string' ? intent.sourceLabel : null, rawValueText: typeof intent.rawValueText === 'string' ? intent.rawValueText : '' };
  }
  if (type === 'revenue' || type === 'purchase') {
    return { ...common, categoryLabel: typeof intent.categoryLabel === 'string' ? intent.categoryLabel : null, description: typeof intent.description === 'string' ? intent.description : '', amount: nullableModelNumber(intent.amount), [type === 'revenue' ? 'received' : 'paid']: typeof (type === 'revenue' ? intent.received : intent.paid) === 'boolean' ? (type === 'revenue' ? intent.received : intent.paid) : null, dueDate: intent.dueDate === null || intent.dueDate === undefined ? null : modelDate(intent.dueDate) };
  }
  if (type === 'feeding_event') {
    return { ...common, contextLabel: typeof intent.contextLabel === 'string' ? intent.contextLabel : null, scopeLabel: typeof intent.scopeLabel === 'string' ? intent.scopeLabel : null, lines: Array.isArray(intent.lines) ? intent.lines.map((item) => { const line = item && typeof item === 'object' ? item as Record<string, unknown> : {}; return { ...line, itemLabel: typeof line.itemLabel === 'string' ? line.itemLabel : '', quantity: nullableModelNumber(line.quantity), unitLabel: typeof line.unitLabel === 'string' ? line.unitLabel : null, rawValueText: typeof line.rawValueText === 'string' ? line.rawValueText : '' }; }) : [] };
  }
  if (type === 'unknown') return { type: 'unknown', reason: typeof intent.reason === 'string' ? intent.reason : 'Captura não reconhecida.' };
  return common;
}

function normalizeModelOutput(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const output = value as Record<string, unknown>;
  return { ...output, intents: Array.isArray(output.intents) ? output.intents.map(normalizeModelIntent) : [] };
}

type ParseFailureCategory = 'empty_content' | 'invalid_json' | 'schema_validation';
type ParseInterpretationResult =
  | { success: true; data: z.infer<typeof interpretationSchema> }
  | {
    success: false;
    category: ParseFailureCategory;
    issueCount: number;
    issueSummary: string | null;
  };

function validationIssueSummary(error: z.ZodError): string | null {
  const summary = error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join('.') || 'root'}:${issue.code}`)
    .join(',');
  return summary ? summary.slice(0, 600) : null;
}

function parseInterpretation(raw: unknown): ParseInterpretationResult {
  const content = messageContent(raw);
  if (!content.trim()) {
    return { success: false, category: 'empty_content', issueCount: 0, issueSummary: null };
  }
  try {
    const parsed: unknown = JSON.parse(stripMarkdownJson(content));
    const result = interpretationSchema.safeParse(normalizeModelOutput(parsed));
    return result.success
      ? { success: true, data: result.data }
      : {
        success: false,
        category: 'schema_validation',
        issueCount: result.error.issues.length,
        issueSummary: validationIssueSummary(result.error),
      };
  } catch {
    return { success: false, category: 'invalid_json', issueCount: 0, issueSummary: null };
  }
}

type AssistantObservability = {
  requestId?: string | null;
  captureId?: string | null;
  sourceKind?: 'text' | 'image' | 'mixed';
};

function modelResponseMetadata(raw: unknown) {
  const response = raw as {
    model?: unknown;
    choices?: Array<{ finish_reason?: unknown }>;
    usage?: {
      prompt_tokens?: unknown;
      completion_tokens?: unknown;
      total_tokens?: unknown;
    };
  } | null;
  return {
    provider_model: typeof response?.model === 'string' ? response.model : undefined,
    finish_reason: typeof response?.choices?.[0]?.finish_reason === 'string'
      ? response.choices[0].finish_reason
      : undefined,
    prompt_tokens: typeof response?.usage?.prompt_tokens === 'number' ? response.usage.prompt_tokens : undefined,
    completion_tokens: typeof response?.usage?.completion_tokens === 'number' ? response.usage.completion_tokens : undefined,
    total_tokens: typeof response?.usage?.total_tokens === 'number' ? response.usage.total_tokens : undefined,
  };
}

function buildSystemPrompt(context: AssistantContext): string {
  const groups = context.groups.length
    ? `\nLotes conhecidos (apenas referência de rótulo): ${context.groups.map((group) => `${group.name} (${group.milkingsPerDay === 1 ? 'uma' : 'duas'} ordenha(s)/dia)`).join(', ')}.`
    : '';
  const animals = context.animals.length
    ? `\nAnimais conhecidos (apenas referência de rótulo): ${context.animals.map((animal) => animal.tag ? `${animal.name} [${animal.tag}]` : animal.name).join(', ')}.`
    : '';
  const feedItems = context.feedItems.length
    ? `\nAlimentos conhecidos (apenas referência de rótulo): ${context.feedItems.map((item) => `${item.name} (${item.unit})`).join(', ')}.`
    : '';
  return `${CONSTITUTION}\n\nHoje é ${dateKeyInSaoPaulo()} no fuso de São Paulo.${groups}${animals}${feedItems}\n\n${ACTIONS}\n\n${OUTPUT_CONTRACT}`;
}

type ChatContent = string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: ChatContent };

async function chat(
  config: { apiKey: string; baseUrl: string; model: string; appUrl: string; timeoutMs: number; jsonOutput?: boolean },
  messages: ChatMessage[],
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': config.appUrl,
        'X-Title': 'FazenDados',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0,
        max_completion_tokens: 16_000,
        reasoning: { effort: 'minimal', exclude: true },
        ...(config.jsonOutput === false ? {} : { response_format: { type: 'json_object' } }),
      }),
    });
  } catch {
    throw new ApiError(502, 'LLM_FAILED', 'O serviço do Assistente está indisponível agora. Tente novamente.');
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(502, 'LLM_FAILED', 'O serviço do Assistente recusou a Captura. Tente novamente.');
  }
  return raw;
}

export async function interpretAssistantCapture(
  text: string,
  context: AssistantContext,
  observability: AssistantObservability = {},
): Promise<AssistantProposalInput[]> {
  const configuration = env();
  if (!configuration.OPENROUTER_API_KEY) {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Assistente real não configurado neste ambiente.');
  }

  const config = {
    apiKey: configuration.OPENROUTER_API_KEY,
    baseUrl: configuration.OPENROUTER_BASE_URL,
    model: configuration.OPENROUTER_INTENT_MODEL,
    appUrl: configuration.PUBLIC_APP_URL,
    timeoutMs: configuration.OPENROUTER_TIMEOUT_MS,
  };
  const startedAt = performance.now();
  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(context) },
    { role: 'user', content: text },
  ];

  const runAttempt = async (attempt: 'first' | 'repair', attemptMessages: ChatMessage[]) => {
    const attemptStartedAt = performance.now();
    let raw: unknown;
    try {
      raw = await chat(config, attemptMessages);
    } catch (error) {
      logger.error('assistant.interpretation.attempt', {
        request_id: observability.requestId,
        capture_id: observability.captureId,
        source_kind: observability.sourceKind,
        source_chars: text.length,
        provider: 'openrouter',
        configured_model: config.model,
        attempt,
        outcome: 'dependency_error',
        error_code: error instanceof ApiError ? error.code : 'INTERNAL_ERROR',
        error_type: errorType(error),
        duration_ms: Math.round(performance.now() - attemptStartedAt),
      });
      throw error;
    }
    const parsed = parseInterpretation(raw);
    const metadata = modelResponseMetadata(raw);
    const log = parsed.success ? logger.info : logger.warn;
    log('assistant.interpretation.attempt', {
      request_id: observability.requestId,
      capture_id: observability.captureId,
      source_kind: observability.sourceKind,
      source_chars: text.length,
      provider: 'openrouter',
      configured_model: config.model,
      attempt,
      outcome: parsed.success ? 'success' : 'invalid_output',
      failure_category: parsed.success ? undefined : parsed.category,
      validation_issue_count: parsed.success ? undefined : parsed.issueCount,
      validation_issues: parsed.success ? undefined : parsed.issueSummary ?? undefined,
      duration_ms: Math.round(performance.now() - attemptStartedAt),
      ...metadata,
    });
    return { raw, parsed };
  };

  const first = await runAttempt('first', messages);
  let parsed = first.parsed;
  if (!parsed.success) {
    const repair = await runAttempt('repair', [
      ...messages,
      { role: 'assistant', content: messageContent(first.raw) },
      { role: 'user', content: 'Corrija a resposta anterior. Devolva somente JSON válido no contrato, preserve os dados da Captura e não invente valores.' },
    ]);
    parsed = repair.parsed;
  }
  if (!parsed.success) {
    logger.error('assistant.interpretation.failed', {
      request_id: observability.requestId,
      capture_id: observability.captureId,
      source_kind: observability.sourceKind,
      source_chars: text.length,
      provider: 'openrouter',
      configured_model: config.model,
      outcome: 'invalid_output',
      failure_category: parsed.category,
      validation_issue_count: parsed.issueCount,
      validation_issues: parsed.issueSummary ?? undefined,
      attempts: 2,
      duration_ms: Math.round(performance.now() - startedAt),
    });
    throw new ApiError(502, 'LLM_INVALID_OUTPUT', 'O Assistente não conseguiu organizar a Captura. Ela continua disponível para nova tentativa.');
  }

  const proposals = parsed.data.intents.map((intent) => toProposal(intent, context));
  logger.info('assistant.interpretation.completed', {
    request_id: observability.requestId,
    capture_id: observability.captureId,
    source_kind: observability.sourceKind,
    source_chars: text.length,
    provider: 'openrouter',
    configured_model: config.model,
    outcome: 'success',
    attempts: first.parsed.success ? 1 : 2,
    intent_count: parsed.data.intents.length,
    proposal_count: proposals.length,
    duration_ms: Math.round(performance.now() - startedAt),
  });
  return proposals;
}

/** Leitura literal de imagem. Não produz intents nem inferências de domínio. */
export async function readImageCapture(image: { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; bytes: Uint8Array }): Promise<string> {
  const configuration = env();
  if (!configuration.OPENROUTER_API_KEY) {
    throw new ApiError(503, 'DEPENDENCY_UNAVAILABLE', 'Leitura de foto não configurada neste ambiente.');
  }
  const dataUrl = `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString('base64')}`;
  const raw = await chat({
    apiKey: configuration.OPENROUTER_API_KEY,
    baseUrl: configuration.OPENROUTER_BASE_URL,
    model: configuration.OPENROUTER_VISION_MODEL,
    appUrl: configuration.PUBLIC_APP_URL,
    timeoutMs: configuration.OPENROUTER_TIMEOUT_MS,
    jsonOutput: false,
  }, [
    { role: 'system', content: 'Você faz OCR de uma foto de caderno rural. Transcreva literalmente apenas o texto e números visíveis, mantendo linhas e rótulos. Não interprete, não some valores, não corrija, não complete lacunas e não faça recomendações. Se algo estiver ilegível, escreva [ilegível]. Responda somente a transcrição.' },
    { role: 'user', content: [{ type: 'text', text: 'Transcreva esta imagem.' }, { type: 'image_url', image_url: { url: dataUrl } }] },
  ]);
  const transcription = messageContent(raw).trim();
  if (!transcription) throw new ApiError(502, 'LLM_INVALID_OUTPUT', 'Não foi possível ler texto na foto. Tente outra imagem ou digite a Captura.');
  return transcription.slice(0, 20_000);
}
