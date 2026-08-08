import assert from 'node:assert/strict';
import test from 'node:test';
import { actionSchema, executeCommand, type CommandAction } from './commands.js';
import { ApiError } from './http.js';
import {
  assistantProposals,
  animalGroupAssignments,
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

test('normaliza Controle leiteiro quando o modelo omite o discriminador type', async () => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/test';
  process.env.OPENROUTER_API_KEY = 'test-key';

  const originalFetch = globalThis.fetch;
  let calls = 0;

  try {
    const { interpretAssistantCapture } = await import('./assistant.js');
    globalThis.fetch = async () => {
      calls += 1;
      return Response.json({
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              intents: [{
                date: 'hoje',
                scopeLabel: 'Lote 1',
                period: 'MORNING',
                measurements: [{
                  animalLabel: 'Mimosa',
                  totalLiters: '12,5',
                  rawValueText: 'Mimosa - 12,5',
                  confidence: 'HIGH',
                }],
              }],
            }),
          },
        }],
      });
    };

    const [proposal] = await interpretAssistantCapture('Controle do Lote 1', {
      groups: [{ name: 'Lote 1', milkingsPerDay: 2 }],
      animals: [{ name: 'Mimosa' }],
      feedItems: [],
    });

    assert.equal(calls, 1);
    assert.equal(proposal.kind, 'controle_leiteiro');
    assert.match(proposal.fields.find((field) => field.key === 'rows')?.value ?? '', /Mimosa 12,5/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('registra diagnóstico estrutural seguro quando a saída do modelo é inválida', async () => {
  process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/test';
  process.env.OPENROUTER_API_KEY = 'test-key';

  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const originalError = console.error;
  const entries: string[] = [];

  try {
    globalThis.fetch = async () => Response.json({
      model: 'provider/model-version',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      choices: [{
        finish_reason: 'stop',
        message: {
          content: JSON.stringify({
            intents: [{ unsupported: 'SENSITIVE_MARKER' }],
          }),
        },
      }],
    });
    console.warn = (entry: string) => entries.push(entry);
    console.error = (entry: string) => entries.push(entry);
    const { interpretAssistantCapture } = await import('./assistant.js');

    await assert.rejects(
      interpretAssistantCapture(
        'CAPTURE_SENSITIVE_MARKER',
        { groups: [], animals: [], feedItems: [] },
        { requestId: 'req-test', captureId: 'cap-test', sourceKind: 'text' },
      ),
      (error: unknown) => error instanceof ApiError && error.code === 'LLM_INVALID_OUTPUT',
    );

    const logs = entries.map((entry) => JSON.parse(entry) as Record<string, unknown>);
    const attempts = logs.filter((entry) => entry.event === 'assistant.interpretation.attempt');
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0].request_id, 'req-test');
    assert.equal(attempts[0].failure_category, 'schema_validation');
    assert.equal(attempts[0].finish_reason, 'stop');
    assert.equal(attempts[0].provider_model, 'provider/model-version');
    assert.equal(attempts[0].total_tokens, 15);
    assert.match(String(attempts[0].validation_issues), /intents\.0\.type/);
    assert.equal(logs.some((entry) => entry.event === 'assistant.interpretation.failed'), true);
    assert.doesNotMatch(entries.join('\n'), /SENSITIVE_MARKER/);
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
    console.error = originalError;
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
    assert.equal(proposal.fields.find((field) => field.key === 'rows')?.value, 'Vaca 101');
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
  crossFarmAnimals?: Array<{ id: string; farmId: string; name: string; tag: string | null; status: string }>;
  assignments?: Array<{ id: string; animalId: string; groupId: string; start: string; end: string | null }>;
  sessions?: Array<{ id: string; farmId: string; date: string; groupId: string; shift: string; status: string; origin: string }>;
  measurements?: Array<{ id: string; sessionId: string; animalId: string; liters: number }>;
  staleProposalReads?: boolean;
}): any {
  const state = {
    proposal: options.proposal,
    groups: options.groups ?? [],
    animals: [...(options.animals ?? []), ...(options.crossFarmAnimals ?? [])],
    assignments: options.assignments ?? [],
    sessions: options.sessions ?? [],
    measurements: options.measurements ?? [],
    financialEntries: [] as unknown[],
    audits: [] as unknown[],
    proposalUpdates: 0,
  };

  const tableRows = (table: unknown) => {
    if (table === assistantProposals) return [state.proposal];
    if (table === herdGroups) return state.groups;
    if (table === animals) return state.animals.filter((animal: { farmId: string }) => animal.farmId === auth.farm.id);
    if (table === animalGroupAssignments) return state.assignments;
    if (table === milkControlSessions) return state.sessions;
    if (table === individualMilkMeasurements) return state.measurements;
    return [];
  };

  const tx = {
    state,
    execute() {
      return { rows: [] };
    },
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
          if (table === auditEvents) state.audits.push(value);
          return {
            onConflictDoUpdate() { return this; },
            returning() {
              if (table === financialEntries) state.financialEntries.push(value);
              if (table === milkControlSessions) state.sessions.push(value);
              if (table === individualMilkMeasurements) state.measurements.push(value);
              if (table === animals) state.animals.push(value);
              if (table === animalGroupAssignments) state.assignments.push(value);
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
              if (table === animalGroupAssignments) {
                state.assignments = state.assignments.map((assignment) => ({ ...assignment, ...value }));
              }
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
                  if (table === individualMilkMeasurements) {
                    state.measurements = state.measurements.map((measurement) => ({ ...measurement, ...value }));
                    return state.measurements;
                  }
                  if (table === animalGroupAssignments) {
                    state.assignments = state.assignments.map((assignment) => ({ ...assignment, ...value }));
                    return state.assignments;
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

test('corrige Medição individual concluída com motivo e auditoria', async () => {
  const tx = createMemoryTx({
    proposal: proposal('coleta', []),
    sessions: [{ id: 'session1', farmId: 'farm1', date: '2026-08-04', groupId: 'group1', shift: 'manha', status: 'concluido', origin: 'assistente' }],
    measurements: [{ id: 'measurement1', sessionId: 'session1', animalId: 'animal1', liters: 7.5 }],
  });

  const result = await executeCommand(tx, auth, {
    type: 'CorrectOperationalFact',
    entityType: 'medicao_individual',
    entityId: 'measurement1',
    newLiters: 8,
    description: 'Correção na medição individual de Mimosa',
    before: '7,5 L',
    after: '8,0 L',
    reason: 'Conferi a anotação do caderno',
  } satisfies CommandAction) as { measurement: { liters: number } };

  assert.equal(result.measurement.liters, 8);
  assert.equal(tx.state.measurements[0].liters, 8);
  assert.equal(tx.state.audits[0].action, 'correcao');
  assert.equal(tx.state.audits[0].entityType, 'medicao_individual');
});

test('registra Medição individual ausente em Controle já concluído', async () => {
  const tx = createMemoryTx({
    proposal: proposal('coleta', []),
    animals: [{ id: 'animal2', farmId: 'farm1', name: 'Lurdinha', tag: null, status: 'ativo' }],
    sessions: [{ id: 'session1', farmId: 'farm1', date: '2026-08-04', groupId: 'group1', shift: 'manha', status: 'concluido', origin: 'manual' }],
  });

  const result = await executeCommand(tx, auth, {
    type: 'RecordIndividualMilkMeasurement',
    sessionId: 'session1',
    animalId: 'animal2',
    liters: 13,
  } satisfies CommandAction) as { measurement: { animalId: string; liters: number } };

  assert.equal(result.measurement.animalId, 'animal2');
  assert.equal(result.measurement.liters, 13);
  assert.equal(tx.state.measurements.length, 1);
  assert.equal(tx.state.sessions[0].status, 'concluido');
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
    assignments: [{ id: 'as1', animalId: 'animal1', groupId: 'group1', start: '2026-01-01', end: null }],
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

test('confirma ordenha única do Lote 2 usando o rótulo exibido na Revisão', async () => {
  const group2 = { id: 'group2', farmId: 'farm1', name: 'Lote 2', milkingsPerDay: 1 as const };
  const animal = { id: 'animal1', farmId: 'farm1', name: 'Sardinha', tag: null, status: 'ativo' };
  const tx = createMemoryTx({
    proposal: proposal('controle_leiteiro', [
      { key: 'date', value: '2026-07-11' },
      { key: 'group', value: 'Lote 2' },
      { key: 'shift', value: 'ordenha única' },
    ]),
    groups: [group2],
    animals: [animal],
    assignments: [{ id: 'as1', animalId: animal.id, groupId: group2.id, start: '2026-01-01', end: null }],
  });

  const result = await executeCommand(tx, auth, {
    type: 'ConfirmAssistantProposal',
    proposalId: tx.state.proposal.id,
    fields: tx.state.proposal.fields,
    bindings: [{ animalId: animal.id, liters: 9 }],
  } satisfies CommandAction) as { facts: number; recordIds: string[] };

  assert.equal(result.facts, 2);
  assert.equal(result.recordIds.length, 2);
  assert.equal(
    tx.state.audits.some((event: { description?: string }) =>
      event.description?.includes('(Lote 2, 2026-07-11, unica)'),
    ),
    true,
  );
  assert.equal(tx.state.assignments[0].groupId, group2.id);
});

function milkControlProposal() {
  return proposal('controle_leiteiro', [
    { key: 'date', value: '2026-08-04' },
    { key: 'group', value: 'Lote 1' },
    { key: 'shift', value: 'Manhã' },
  ]);
}

const milkControlGroup = { id: 'group1', farmId: 'farm1', name: 'Lote 1', milkingsPerDay: 2 as const };
const otherGroup = { id: 'group2', farmId: 'farm1', name: 'Lote 2', milkingsPerDay: 2 as const };
const mimosa = { id: 'animal1', farmId: 'farm1', name: 'Mimosa', tag: '001', status: 'ativo' };

test('confirma controle com Animal já lotado no Lote informado sem exigir decisão', async () => {
  const tx = createMemoryTx({
    proposal: milkControlProposal(), groups: [milkControlGroup], animals: [mimosa],
    assignments: [{ id: 'as1', animalId: mimosa.id, groupId: milkControlGroup.id, start: '2026-01-01', end: null }],
  });

  const result = await executeCommand(tx, auth, {
    type: 'ConfirmAssistantProposal', proposalId: tx.state.proposal.id, fields: tx.state.proposal.fields,
    bindings: [{ animalId: mimosa.id, liters: 8 }],
  } satisfies CommandAction) as { facts: number; recordIds: string[] };

  assert.equal(result.facts, 2);
  assert.equal(tx.state.assignments.length, 1);
  assert.equal(result.recordIds.length, 2);
});

test('confirma medição nova em Controle assistido já concluído', async () => {
  const tx = createMemoryTx({
    proposal: milkControlProposal(),
    groups: [milkControlGroup],
    animals: [mimosa],
    assignments: [{ id: 'as1', animalId: mimosa.id, groupId: milkControlGroup.id, start: '2026-01-01', end: null }],
    sessions: [{ id: 'session1', farmId: 'farm1', date: '2026-08-04', groupId: 'group1', shift: 'manha', status: 'concluido', origin: 'manual' }],
  });

  const result = await executeCommand(tx, auth, {
    type: 'ConfirmAssistantProposal',
    proposalId: tx.state.proposal.id,
    fields: tx.state.proposal.fields,
    bindings: [{ animalId: mimosa.id, liters: 8 }],
  } satisfies CommandAction) as { facts: number; recordIds: string[] };

  assert.equal(result.facts, 1);
  assert.equal(result.recordIds.length, 1);
  assert.equal(tx.state.measurements.length, 1);
  assert.equal(tx.state.sessions[0].status, 'concluido');
});

test('rejeita Controle com Lotação divergente sem decisão e não materializa fatos', async () => {
  const tx = createMemoryTx({
    proposal: milkControlProposal(), groups: [milkControlGroup, otherGroup], animals: [mimosa],
    assignments: [{ id: 'as1', animalId: mimosa.id, groupId: otherGroup.id, start: '2026-01-01', end: null }],
  });

  await assert.rejects(
    executeCommand(tx, auth, {
      type: 'ConfirmAssistantProposal', proposalId: tx.state.proposal.id, fields: tx.state.proposal.fields,
      bindings: [{ animalId: mimosa.id, liters: 8 }],
    } satisfies CommandAction),
    (error: unknown) => error instanceof ApiError && error.code === 'ASSIGNMENT_DECISION_REQUIRED',
  );
  assert.equal(tx.state.sessions.length, 0);
  assert.equal(tx.state.measurements.length, 0);
});

test('rejeita Controle sem Lotação na data até haver uma decisão explícita', async () => {
  const tx = createMemoryTx({ proposal: milkControlProposal(), groups: [milkControlGroup], animals: [mimosa] });

  await assert.rejects(
    executeCommand(tx, auth, {
      type: 'ConfirmAssistantProposal', proposalId: tx.state.proposal.id, fields: tx.state.proposal.fields,
      bindings: [{ animalId: mimosa.id, liters: 8 }],
    } satisfies CommandAction),
    (error: unknown) => error instanceof ApiError && error.code === 'ASSIGNMENT_DECISION_REQUIRED',
  );
  assert.equal(tx.state.sessions.length, 0);
});

test('rejeita decisão de Lotação desnecessária para não aplicar escolha obsoleta', async () => {
  const tx = createMemoryTx({
    proposal: milkControlProposal(), groups: [milkControlGroup], animals: [mimosa],
    assignments: [{ id: 'as1', animalId: mimosa.id, groupId: milkControlGroup.id, start: '2026-01-01', end: null }],
  });

  await assert.rejects(
    executeCommand(tx, auth, {
      type: 'ConfirmAssistantProposal', proposalId: tx.state.proposal.id, fields: tx.state.proposal.fields,
      bindings: [{ animalId: mimosa.id, liters: 8, assignmentAction: 'move' }],
    } satisfies CommandAction),
    (error: unknown) => error instanceof ApiError && error.code === 'UNNECESSARY_ASSIGNMENT_DECISION',
  );
});

test('rejeita histórico com Lotação sobreposta antes de materializar o Controle', async () => {
  const tx = createMemoryTx({
    proposal: milkControlProposal(), groups: [milkControlGroup, otherGroup], animals: [mimosa],
    assignments: [
      { id: 'as1', animalId: mimosa.id, groupId: milkControlGroup.id, start: '2026-01-01', end: null },
      { id: 'as2', animalId: mimosa.id, groupId: otherGroup.id, start: '2026-08-01', end: null },
    ],
  });

  await assert.rejects(
    executeCommand(tx, auth, {
      type: 'ConfirmAssistantProposal', proposalId: tx.state.proposal.id, fields: tx.state.proposal.fields,
      bindings: [{ animalId: mimosa.id, liters: 8 }],
    } satisfies CommandAction),
    (error: unknown) => error instanceof ApiError && error.code === 'ASSIGNMENT_OVERLAP',
  );
  assert.equal(tx.state.sessions.length, 0);
});

test('rejeita nova Medição para Animal arquivado', async () => {
  const archived = { ...mimosa, status: 'arquivado' };
  const tx = createMemoryTx({
    proposal: milkControlProposal(), groups: [milkControlGroup], animals: [archived],
    assignments: [{ id: 'as1', animalId: archived.id, groupId: milkControlGroup.id, start: '2026-01-01', end: null }],
  });

  await assert.rejects(
    executeCommand(tx, auth, {
      type: 'ConfirmAssistantProposal', proposalId: tx.state.proposal.id, fields: tx.state.proposal.fields,
      bindings: [{ animalId: archived.id, liters: 8 }],
    } satisfies CommandAction),
    (error: unknown) => error instanceof ApiError && error.code === 'ANIMAL_ARCHIVED',
  );
});

test('keep confirma somente a Medição quando a Lotação diverge', async () => {
  const tx = createMemoryTx({
    proposal: milkControlProposal(), groups: [milkControlGroup, otherGroup], animals: [mimosa],
    assignments: [{ id: 'as1', animalId: mimosa.id, groupId: otherGroup.id, start: '2026-01-01', end: null }],
  });

  const result = await executeCommand(tx, auth, {
    type: 'ConfirmAssistantProposal', proposalId: tx.state.proposal.id, fields: tx.state.proposal.fields,
    bindings: [{ animalId: mimosa.id, liters: 8, assignmentAction: 'keep' }],
  } satisfies CommandAction) as { facts: number; recordIds: string[] };

  assert.equal(result.facts, 2);
  assert.equal(tx.state.assignments[0].groupId, otherGroup.id);
  assert.equal(result.recordIds.length, 2);
  assert.equal(
    tx.state.audits.some(
      (audit: { entityType: string; action: string }) =>
        audit.entityType === 'lotacao' && audit.action === 'confirmacao',
    ),
    true,
  );
});

test('move cria Lotação assistida, fecha a aberta e devolve seu ID entre os fatos', async () => {
  const tx = createMemoryTx({
    proposal: milkControlProposal(), groups: [milkControlGroup, otherGroup], animals: [mimosa],
    assignments: [{ id: 'as1', animalId: mimosa.id, groupId: otherGroup.id, start: '2026-01-01', end: null }],
  });

  const result = await executeCommand(tx, auth, {
    type: 'ConfirmAssistantProposal', proposalId: tx.state.proposal.id, fields: tx.state.proposal.fields,
    bindings: [{ animalId: mimosa.id, liters: 8, assignmentAction: 'move' }],
  } satisfies CommandAction) as { facts: number; recordIds: string[] };

  const moved = tx.state.assignments.find((assignment: { groupId: string }) => assignment.groupId === milkControlGroup.id);
  assert.equal(tx.state.assignments[0].end, '2026-08-03');
  assert.equal(moved.start, '2026-08-04');
  assert.equal(moved.end, null);
  assert.equal(result.facts, 3);
  assert.ok(result.recordIds.includes(moved.id));
  assert.equal(tx.state.audits.some((audit: { entityType: string; origin: string }) => audit.entityType === 'lotacao' && audit.origin === 'assistente'), true);
});

test('move histórico encerra a Lotação inserida antes da próxima Lotação', async () => {
  const tx = createMemoryTx({
    proposal: milkControlProposal(), groups: [milkControlGroup, otherGroup], animals: [mimosa],
    assignments: [
      { id: 'as1', animalId: mimosa.id, groupId: otherGroup.id, start: '2026-01-01', end: null },
      { id: 'as2', animalId: mimosa.id, groupId: otherGroup.id, start: '2026-08-10', end: null },
    ],
  });

  await executeCommand(tx, auth, {
    type: 'ConfirmAssistantProposal', proposalId: tx.state.proposal.id, fields: tx.state.proposal.fields,
    bindings: [{ animalId: mimosa.id, liters: 8, assignmentAction: 'move' }],
  } satisfies CommandAction);

  const imported = tx.state.assignments.find((assignment: { groupId: string; start: string }) => assignment.groupId === milkControlGroup.id && assignment.start === '2026-08-04');
  assert.equal(imported.end, '2026-08-09');
});

test('move histórico não estende uma Lotação que já tinha fim', async () => {
  const tx = createMemoryTx({
    proposal: milkControlProposal(), groups: [milkControlGroup, otherGroup], animals: [mimosa],
    assignments: [
      { id: 'as1', animalId: mimosa.id, groupId: otherGroup.id, start: '2026-01-01', end: '2026-08-06' },
      { id: 'as2', animalId: mimosa.id, groupId: otherGroup.id, start: '2026-09-01', end: null },
    ],
  });

  await executeCommand(tx, auth, {
    type: 'ConfirmAssistantProposal', proposalId: tx.state.proposal.id, fields: tx.state.proposal.fields,
    bindings: [{ animalId: mimosa.id, liters: 8, assignmentAction: 'move' }],
  } satisfies CommandAction);

  const imported = tx.state.assignments.find(
    (assignment: { groupId: string; start: string }) =>
      assignment.groupId === milkControlGroup.id && assignment.start === '2026-08-04',
  );
  assert.equal(imported.end, '2026-08-06');
});

test('movimentação manual encerra a Lotação anterior no dia anterior', async () => {
  const tx = createMemoryTx({
    proposal: milkControlProposal(), groups: [milkControlGroup, otherGroup], animals: [mimosa],
    assignments: [{ id: 'as1', animalId: mimosa.id, groupId: otherGroup.id, start: '2026-01-01', end: null }],
  });

  const result = await executeCommand(tx, auth, {
    type: 'AssignAnimalToGroup',
    animalId: mimosa.id,
    groupId: milkControlGroup.id,
    date: '2026-08-04',
  } satisfies CommandAction) as { assignment: { start: string }; closedAssignmentId: string | null };

  assert.equal(tx.state.assignments[0].end, '2026-08-03');
  assert.equal(result.assignment.start, '2026-08-04');
  assert.equal(result.closedAssignmentId, 'as1');
});

test('movimentação manual no dia inicial corrige a Lotação sem criar sobreposição', async () => {
  const tx = createMemoryTx({
    proposal: milkControlProposal(), groups: [milkControlGroup, otherGroup], animals: [mimosa],
    assignments: [{ id: 'as1', animalId: mimosa.id, groupId: otherGroup.id, start: '2026-08-04', end: null }],
  });

  const result = await executeCommand(tx, auth, {
    type: 'AssignAnimalToGroup',
    animalId: mimosa.id,
    groupId: milkControlGroup.id,
    date: '2026-08-04',
  } satisfies CommandAction) as { assignment: { id: string; groupId: string }; closedAssignmentId: string | null };

  assert.equal(tx.state.assignments.length, 1);
  assert.equal(result.assignment.id, 'as1');
  assert.equal(result.assignment.groupId, milkControlGroup.id);
  assert.equal(result.closedAssignmentId, null);
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

test('RegisterAnimal rejeita nome ou brinco duplicados, ignorando caixa e acentos', async () => {
  for (const input of [
    { name: 'mimosa' },
    { name: 'Outra', tag: ' brinco-á ' },
  ]) {
    const tx = createMemoryTx({
      proposal: proposal('coleta', []),
      animals: [{ id: 'animal1', farmId: 'farm1', name: 'Mimósa', tag: 'Brinco-A', status: 'ativo' }],
    });
    await assert.rejects(
      executeCommand(tx, auth, { type: 'RegisterAnimal', ...input, date: '2026-08-04' } satisfies CommandAction),
      (error: unknown) => error instanceof ApiError && error.code === 'DUPLICATE_ANIMAL',
    );
    assert.equal(tx.state.animals.length, 1);
  }
});

test('RegisterAnimal permite a mesma identidade existente em outra Fazenda', async () => {
  const tx = createMemoryTx({
    proposal: proposal('coleta', []),
    crossFarmAnimals: [{ id: 'animal-other', farmId: 'farm2', name: 'Mimósa', tag: 'Brinco-A', status: 'ativo' }],
  });

  const result = await executeCommand(tx, auth, {
    type: 'RegisterAnimal', name: 'Mimosa', tag: 'brinco-a', date: '2026-08-04',
  } satisfies CommandAction) as { animal: { id: string; name: string } };

  assert.equal(result.animal.name, 'Mimosa');
  assert.equal(tx.state.animals.length, 2);
});

test('RegisterAnimal permite mesmo nome quando os dois brincos são distintos', async () => {
  const tx = createMemoryTx({
    proposal: proposal('coleta', []),
    animals: [{ id: 'animal1', farmId: 'farm1', name: 'Mimosa', tag: '001', status: 'ativo' }],
  });

  await executeCommand(tx, auth, {
    type: 'RegisterAnimal', name: 'Mimósa', tag: '002', date: '2026-08-04',
  } satisfies CommandAction);

  assert.equal(tx.state.animals.length, 2);
});
