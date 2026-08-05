import assert from 'node:assert/strict';
import test from 'node:test';
import { actionSchema, executeCommand, type CommandAction } from './commands.js';
import { ApiError } from './http.js';
import {
  assistantProposals,
  auditEvents,
  financialEntries,
  herdGroups,
  animals,
  individualMilkMeasurements,
  milkControlSessions,
} from '../db/schema.js';
import type { AuthContext } from './auth.js';

test('interpreta medição individual quando o LLM devolve litros como texto OCR', async () => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/test';
  process.env.OPENROUTER_API_KEY = 'test-key';

  const originalFetch = globalThis.fetch;

  try {
    const { interpretAssistantCapture } = await import('./assistant.js');
    for (const liters of ['12,5', '12.5']) {
      globalThis.fetch = async () => Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              intents: [{
                type: 'individual_milk_session',
                date: { relative: 'hoje', iso: null, rawText: 'hoje' },
                confidence: 'HIGH',
                notes: null,
                scopeLabel: 'Lote 1',
                period: 'MORNING',
                measurements: [{
                  animalLabel: 'Mimosa',
                  morningLiters: liters,
                  afternoonLiters: null,
                  totalLiters: null,
                  rawValueText: liters,
                  confidence: 'HIGH',
                  notes: null,
                }],
              }],
            }),
          },
        }],
      });

      const [proposal] = await interpretAssistantCapture(`Mimosa ${liters}`, {
        groups: [{ name: 'Lote 1', milkingsPerDay: 2 }],
        animals: [{ name: 'Mimosa' }],
        feedItems: [],
      });

      assert.equal(proposal.kind, 'controle_leiteiro');
      assert.match(proposal.fields.find((field) => field.key === 'rows')?.value ?? '', /12[,.]5/);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('interpreta linhas OCR no padrão "Animal - litros" sem concatenar números do rótulo', async () => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/test';
  process.env.OPENROUTER_API_KEY = 'test-key';

  const originalFetch = globalThis.fetch;

  try {
    const { interpretAssistantCapture } = await import('./assistant.js');
    const cases = [
      { label: 'Vaca 101', value: '7,5', expected: /Vaca 101 7,5/ },
      { label: 'Vaca 202', value: '12.5', expected: /Vaca 202 12,5/ },
    ];

    for (const item of cases) {
      globalThis.fetch = async () => Response.json({
        choices: [{
          message: {
            content: JSON.stringify({
              intents: [{
                type: 'individual_milk_session',
                date: { relative: 'hoje', iso: null, rawText: 'hoje' },
                confidence: 'HIGH',
                notes: null,
                scopeLabel: 'Lote 1',
                period: 'MORNING',
                measurements: [{
                  animalLabel: item.label,
                  morningLiters: `${item.label} - ${item.value}`,
                  afternoonLiters: null,
                  totalLiters: null,
                  rawValueText: `${item.label} - ${item.value}`,
                  confidence: 'HIGH',
                  notes: null,
                }],
              }],
            }),
          },
        }],
      });

      const [proposal] = await interpretAssistantCapture(`${item.label} - ${item.value}`, {
        groups: [{ name: 'Lote 1', milkingsPerDay: 2 }],
        animals: [{ name: item.label }],
        feedItems: [],
      });

      assert.equal(proposal.kind, 'controle_leiteiro');
      assert.match(proposal.fields.find((field) => field.key === 'rows')?.value ?? '', item.expected);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejeita volume OCR malformado em vez de concatenar números', async () => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/test';
  process.env.OPENROUTER_API_KEY = 'test-key';

  const originalFetch = globalThis.fetch;

  try {
    const { interpretAssistantCapture } = await import('./assistant.js');
    globalThis.fetch = async () => Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            intents: [{
              type: 'individual_milk_session',
              date: { relative: 'hoje', iso: null, rawText: 'hoje' },
              confidence: 'HIGH',
              notes: null,
              scopeLabel: 'Lote 1',
              period: 'MORNING',
              measurements: [{
                animalLabel: 'Vaca 101',
                morningLiters: 'Vaca 101 - 7,5 e 2',
                afternoonLiters: null,
                totalLiters: null,
                rawValueText: 'Vaca 101 - 7,5 e 2',
                confidence: 'HIGH',
                notes: null,
              }],
            }],
          }),
        },
      }],
    });

    const [proposal] = await interpretAssistantCapture('Vaca 101 - 7,5 e 2', {
      groups: [{ name: 'Lote 1', milkingsPerDay: 2 }],
      animals: [{ name: 'Vaca 101' }],
      feedItems: [],
    });

    assert.equal(proposal.kind, 'controle_leiteiro');
    assert.equal(proposal.fields.find((field) => field.key === 'rows')?.value, '');
    assert.match(proposal.issues.join('\n'), /Sem volume/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('contrato de comando limita medição individual a 100 L', () => {
  const action = {
    type: 'RecordIndividualMilkMeasurement',
    sessionId: 'session1',
    animalId: 'animal1',
    liters: 100,
  };
  assert.equal(actionSchema.safeParse(action).success, true);
  assert.equal(actionSchema.safeParse({ ...action, liters: 100.1 }).success, false);
  assert.equal(actionSchema.safeParse({ ...action, liters: 12.55 }).success, false);
});

const auth: AuthContext = {
  user: { id: 'usr1', farmId: 'farm1', name: 'Ana', username: 'ana' },
  farm: { id: 'farm1', name: 'Fazenda' },
};

function proposal(kind: string, fields: Array<{ key: string; value: string }>) {
  return {
    id: `prop-${kind}`,
    captureId: 'cap1',
    kind,
    title: 'Proposta',
    fields: fields.map((field) => ({ key: field.key, label: field.key, value: field.value, confidence: 'alta' as const })),
    consequences: [],
    issues: [],
    status: 'pendente',
    dismissReason: null,
    confirmedRecordIds: [],
  };
}

function createMemoryTx(options: {
  proposal: ReturnType<typeof proposal>;
  groups?: Array<{ id: string; farmId: string; name: string; milkingsPerDay: 1 | 2 }>;
  animals?: Array<{ id: string; farmId: string; name: string; tag: string | null; status: string }>;
  sessions?: Array<{ id: string; farmId: string; date: string; groupId: string; shift: string; status: string; origin: string }>;
  measurements?: Array<{ id: string; sessionId: string; animalId: string; liters: number }>;
  staleProposalReads?: boolean;
}): any {
  const state = {
    proposal: options.proposal,
    groups: options.groups ?? [],
    animals: options.animals ?? [],
    sessions: options.sessions ?? [],
    measurements: options.measurements ?? [],
    financialEntries: [] as unknown[],
    audits: [] as unknown[],
    proposalUpdates: 0,
  };

  const tableRows = (table: unknown) => {
    if (table === assistantProposals) return [state.proposal];
    if (table === herdGroups) return state.groups;
    if (table === animals) return state.animals;
    if (table === milkControlSessions) return state.sessions;
    if (table === individualMilkMeasurements) return state.measurements;
    return [];
  };

  const tx = {
    state,
    select(selection?: unknown) {
      const query = {
        from(table: unknown) {
          let rows: any[] = tableRows(table);
          return {
            innerJoin() { return this; },
            where() { return this; },
            limit(limit: number) {
              if (selection && table === assistantProposals) {
                const proposalRows = options.staleProposalReads ? rows.map((row: any) => ({ ...row, status: 'pendente' })) : rows;
                return proposalRows.slice(0, limit).map((row) => ({ proposal: row }));
              }
              return rows.slice(0, limit);
            },
            then(resolve: (value: unknown[]) => void) {
              if (selection && table === assistantProposals) {
                const proposalRows = options.staleProposalReads ? rows.map((row: any) => ({ ...row, status: 'pendente' })) : rows;
                rows = proposalRows.map((row) => ({ proposal: row }));
              }
              resolve(rows);
            },
          };
        },
      };
      return query;
    },
    insert(table: unknown) {
      return {
        values(value: any) {
          return {
            onConflictDoUpdate() { return this; },
            returning() {
              if (table === financialEntries) state.financialEntries.push(value);
              if (table === auditEvents) state.audits.push(value);
              if (table === milkControlSessions) state.sessions.push(value);
              if (table === individualMilkMeasurements) state.measurements.push(value);
              return Array.isArray(value) ? value : [value];
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(value: any) {
          return {
            where() {
              return {
                returning() {
                  if (table === assistantProposals) {
                    if (value.status === 'confirmada' && state.proposal.status !== 'pendente') return [];
                    state.proposalUpdates += 1;
                    state.proposal = { ...state.proposal, ...value };
                    return [state.proposal];
                  }
                  if (table === milkControlSessions) {
                    state.sessions = state.sessions.map((session) => ({ ...session, ...value }));
                    return state.sessions;
                  }
                  return [];
                },
              };
            },
          };
        },
      };
    },
  };

  return tx;
}

test('confirmação rejeita lançamento financeiro sem natureza explícita', async () => {
  const tx = createMemoryTx({
    proposal: proposal('lancamento_financeiro', [
      { key: 'date', value: '2026-08-04' },
      { key: 'kind', value: '' },
      { key: 'description', value: 'Ração' },
      { key: 'amount', value: '120,00' },
      { key: 'dueDate', value: '' },
    ]),
  });

  await assert.rejects(
    executeCommand(tx, auth, {
      type: 'ConfirmAssistantProposal',
      proposalId: 'prop-lancamento_financeiro',
      fields: tx.state.proposal.fields,
    } satisfies CommandAction),
    (error: unknown) => error instanceof ApiError && error.code === 'INVALID_PROPOSAL',
  );
  assert.equal(tx.state.financialEntries.length, 0);
});

test('confirmação de controle leiteiro rejeita medição existente sem correção explícita', async () => {
  const tx = createMemoryTx({
    proposal: proposal('controle_leiteiro', [
      { key: 'date', value: '2026-08-04' },
      { key: 'group', value: 'Lote 1' },
      { key: 'shift', value: 'Manhã' },
    ]),
    groups: [{ id: 'group1', farmId: 'farm1', name: 'Lote 1', milkingsPerDay: 2 }],
    animals: [{ id: 'animal1', farmId: 'farm1', name: 'Mimosa', tag: null, status: 'ativo' }],
    sessions: [{ id: 'session1', farmId: 'farm1', date: '2026-08-04', groupId: 'group1', shift: 'manha', status: 'em_andamento', origin: 'assistente' }],
    measurements: [{ id: 'mm1', sessionId: 'session1', animalId: 'animal1', liters: 7.5 }],
  });

  await assert.rejects(
    executeCommand(tx, auth, {
      type: 'ConfirmAssistantProposal',
      proposalId: 'prop-controle_leiteiro',
      fields: tx.state.proposal.fields,
      bindings: [{ animalId: 'animal1', liters: 8 }],
    } satisfies CommandAction),
    (error: unknown) => error instanceof ApiError && error.code === 'MEASUREMENT_EXISTS',
  );
});

test('confirmação rejeita controle leiteiro sem turno explícito', async () => {
  const tx = createMemoryTx({
    proposal: proposal('controle_leiteiro', [
      { key: 'date', value: '2026-08-04' },
      { key: 'group', value: 'Lote 1' },
      { key: 'shift', value: '' },
    ]),
    groups: [{ id: 'group1', farmId: 'farm1', name: 'Lote 1', milkingsPerDay: 2 }],
    animals: [{ id: 'animal1', farmId: 'farm1', name: 'Mimosa', tag: null, status: 'ativo' }],
  });

  await assert.rejects(
    executeCommand(tx, auth, {
      type: 'ConfirmAssistantProposal',
      proposalId: 'prop-controle_leiteiro',
      fields: tx.state.proposal.fields,
      bindings: [{ animalId: 'animal1', liters: 8 }],
    } satisfies CommandAction),
    (error: unknown) => error instanceof ApiError && error.code === 'INVALID_PROPOSAL',
  );
});

test('segunda confirmação concorrente da mesma proposta não materializa duplicatas', async () => {
  const tx = createMemoryTx({
    proposal: proposal('lancamento_financeiro', [
      { key: 'date', value: '2026-08-04' },
      { key: 'kind', value: 'Receita' },
      { key: 'description', value: 'Leite' },
      { key: 'amount', value: '120,00' },
      { key: 'dueDate', value: '' },
    ]),
    staleProposalReads: true,
  });

  const action = {
    type: 'ConfirmAssistantProposal',
    proposalId: 'prop-lancamento_financeiro',
    fields: tx.state.proposal.fields,
  } satisfies CommandAction;

  await executeCommand(tx, auth, action);
  await executeCommand(tx, auth, action);

  assert.equal(tx.state.financialEntries.length, 1);
});
