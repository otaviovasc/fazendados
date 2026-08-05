/**
 * Logger estruturado da aplicação. A saída é JSON em stdout/stderr para que
 * Railway (ou outro runtime) consiga indexar campos sem depender de parsing de
 * texto. O chamador só passa metadados técnicos permitidos — nunca payloads.
 */
type LogValue = string | number | boolean | null | undefined;
type LogFields = Record<string, LogValue>;
type LogLevel = 'info' | 'warn' | 'error';

const blockedField = /(?:authorization|cookie|password|secret|token|api[_-]?key|payload|body|capture[_-]?text|extracted[_-]?text|image|media)/i;

function safeFields(fields: LogFields) {
  return Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== undefined && !blockedField.test(key)));
}

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    service: 'fazendados-api',
    environment: process.env.NODE_ENV ?? 'development',
    event,
    ...safeFields(fields),
  };
  const line = JSON.stringify(record);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (event: string, fields?: LogFields) => write('info', event, fields),
  warn: (event: string, fields?: LogFields) => write('warn', event, fields),
  error: (event: string, fields?: LogFields) => write('error', event, fields),
};

/** Não registra a mensagem/stack do erro: elas podem conter dados sensíveis. */
export function errorType(error: unknown) {
  return error instanceof Error ? error.name : typeof error;
}
