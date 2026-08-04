import process from 'node:process';
import { z } from 'zod';

try {
  if (process.env.NODE_ENV !== 'production') process.loadEnvFile?.('.env');
} catch {
  // O Docker injeta as variáveis; .env é opcional fora dele.
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // 3001 em dev (Vite proxy /api → :3001); o container define PORT=3000.
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL não foi configurada.'),
  // Senha única da fazenda (V1 = 1 usuário). Default só para desenvolvimento.
  APP_PASSWORD: z.string().min(1, 'APP_PASSWORD não foi configurada.').default('fazendados'),
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
