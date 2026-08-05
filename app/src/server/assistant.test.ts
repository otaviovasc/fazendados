import assert from 'node:assert/strict';
import test from 'node:test';

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
