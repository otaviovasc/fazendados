import { z } from 'zod';
import { env } from './env.js';
import { ApiError } from './http.js';

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
- Coleta é retirada de leite, independente da Produção diária.
- Trato é alimento fornecido a um Lote; compra de alimento é lançamento financeiro nesta V1.
- Não diagnostique doença, não recomende descarte e não crie ocupação de Pasto ou Instalação a partir da fala.`;

const ACTIONS = `Tipos de intent suportados:

1) daily_milk_total: produção diária da Fazenda. Campos: date, scopeLabel, morningLiters, afternoonLiters, rawValueText, confidence, notes.
2) individual_milk_session: controle leiteiro. Campos: date, scopeLabel, period, measurements[]. Cada medição tem animalLabel, morningLiters, afternoonLiters, totalLiters, rawValueText, confidence, notes.
3) milk_collection: coleta. Campos: date, liters, time, sourceLabel, rawValueText, confidence, notes.
4) revenue: receita. Campos: date, categoryLabel, description, amount, received, dueDate, confidence, notes.
5) purchase: despesa. Campos: date, categoryLabel, description, amount, paid, dueDate, confidence, notes.
6) feeding_event: trato. Campos: date, contextLabel, scopeLabel, lines[] com itemLabel, quantity, unitLabel, rawValueText.
7) unknown: não corresponde a um Registro suportado. Campos: type, reason.`;

const OUTPUT_CONTRACT = `Responda SOMENTE com JSON válido, sem Markdown, no formato:
{ "intents": [ { ... } ] }
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
  if (!Array.isArray(content)) return '';
  return content
    .filter((part): part is { text: string } => Boolean(part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'))
    .map((part) => part.text)
    .join('');
}

function stripMarkdownJson(value: string): string {
  return value.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function parseInterpretation(raw: unknown): { success: true; data: z.infer<typeof interpretationSchema> } | { success: false } {
  const content = messageContent(raw);
  if (!content.trim()) return { success: false };
  try {
    const parsed: unknown = JSON.parse(stripMarkdownJson(content));
    const result = interpretationSchema.safeParse(parsed);
    return result.success ? { success: true, data: result.data } : { success: false };
  } catch {
    return { success: false };
  }
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

async function chat(
  config: { apiKey: string; baseUrl: string; model: string; appUrl: string; timeoutMs: number },
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
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
        response_format: { type: 'json_object' },
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

export async function interpretAssistantCapture(text: string, context: AssistantContext): Promise<AssistantProposalInput[]> {
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
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: buildSystemPrompt(context) },
    { role: 'user', content: text },
  ];
  const firstRaw = await chat(config, messages);
  let parsed = parseInterpretation(firstRaw);
  if (!parsed.success) {
    const repairRaw = await chat(config, [
      ...messages,
      { role: 'assistant', content: messageContent(firstRaw) },
      { role: 'user', content: 'Corrija a resposta anterior. Devolva somente JSON válido no contrato, preserve os dados da Captura e não invente valores.' },
    ]);
    parsed = parseInterpretation(repairRaw);
  }
  if (!parsed.success) {
    throw new ApiError(502, 'LLM_INVALID_OUTPUT', 'O Assistente não conseguiu organizar a Captura. Ela continua disponível para nova tentativa.');
  }

  return parsed.data.intents.map((intent) => toProposal(intent, context));
}
