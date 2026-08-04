import process from 'node:process';
import { z } from 'zod';

try {
  if (process.env.NODE_ENV !== 'production') process.loadEnvFile?.('.env');
} catch {
  // O Docker injeta as variáveis; .env é opcional fora dele.
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // A API local usa 3001; o Vite encaminha /api para esta porta.
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL não foi configurada.'),
  // Senha única da fazenda (V1 = 1 usuário). Default só para desenvolvimento.
  APP_PASSWORD: z.string().min(1, 'APP_PASSWORD não foi configurada.').default('fazendados'),
  OPENROUTER_API_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
  OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),
  OPENROUTER_INTENT_MODEL: z.string().min(1).default('google/gemini-3.1-flash-lite'),
  OPENROUTER_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  PUBLIC_APP_URL: z.string().url().default('http://localhost:5180'),
});

let cached: z.infer<typeof envSchema> | undefined;

export function env() {
  if (!cached) {
    const parsed = envSchema.safeParse(process.env);
    if (!parsed.success) {
      const messages = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
      throw new Error(`Configuração inválida: ${messages}`);
    }
    cached = parsed.data;
  }
  return cached;
}
