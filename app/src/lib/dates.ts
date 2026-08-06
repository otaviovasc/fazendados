import type { ISODate } from "../domain/types.js";

export const BRAZIL_TIME_ZONE = "America/Sao_Paulo";

type DateTimeInput = Date | string;

function asDate(value: DateTimeInput): Date {
  return value instanceof Date ? value : new Date(value);
}

function datePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

const saoPauloDateParts = new Intl.DateTimeFormat("en-US", {
  timeZone: BRAZIL_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const saoPauloTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRAZIL_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Converte um instante ISO (inclusive UTC à meia-noite) para a data civil brasileira. */
export function dateKeyInSaoPaulo(value: DateTimeInput = new Date()): ISODate {
  const parts = saoPauloDateParts.formatToParts(asDate(value));
  return `${datePart(parts, "year")}-${datePart(parts, "month")}-${datePart(parts, "day")}`;
}

/** Horário de um instante na Fazenda, sem depender do fuso do dispositivo. */
export function timeInSaoPaulo(value: DateTimeInput): string {
  return saoPauloTime.format(asDate(value));
}

function civilDateValue(iso: ISODate): Date {
  // Meio-dia UTC mantém a data civil ao formatar em São Paulo e em fusos próximos.
  return new Date(`${iso}T12:00:00.000Z`);
}

export function toISODate(d: Date): ISODate {
  return dateKeyInSaoPaulo(d);
}

/** Hoje operacional no fuso da Fazenda. */
export function today(): ISODate {
  return dateKeyInSaoPaulo(new Date());
}

export function addDays(iso: ISODate, delta: number): ISODate {
  const d = civilDateValue(iso);
  d.setUTCDate(d.getUTCDate() + delta);
  return toISODate(d);
}

export function lastNDays(n: number): ISODate[] {
  const out: ISODate[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(today(), -i));
  return out;
}

const fmtDay = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRAZIL_TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
});
const fmtLong = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRAZIL_TIME_ZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const fmtWeekday = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRAZIL_TIME_ZONE,
  weekday: "short",
});
const fmtMonth = new Intl.DateTimeFormat("pt-BR", {
  timeZone: BRAZIL_TIME_ZONE,
  month: "long",
  year: "numeric",
});

export function formatDay(iso: ISODate): string {
  return fmtDay.format(civilDateValue(iso));
}

export function formatLong(iso: ISODate): string {
  return fmtLong.format(civilDateValue(iso));
}

export function formatWeekday(iso: ISODate): string {
  return fmtWeekday.format(civilDateValue(iso)).replace(".", "");
}

export function formatMonth(iso: ISODate): string {
  return fmtMonth.format(civilDateValue(iso));
}

/** "hoje", "ontem" ou data curta. */
export function formatRelativeDay(iso: ISODate): string {
  if (iso === today()) return "hoje";
  if (iso === addDays(today(), -1)) return "ontem";
  return formatDay(iso);
}

/** Primeiro dia do mês civil da data informada. */
export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

export function addMonths(iso: ISODate, delta: number): ISODate {
  const d = civilDateValue(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + delta);
  return toISODate(d);
}

/**
 * Grade do calendário do mês (semanas começando no domingo).
 * `null` preenche as células fora do mês.
 */
export function calendarGrid(month: ISODate): (ISODate | null)[] {
  const first = civilDateValue(startOfMonth(month));
  const offset = first.getUTCDay();
  const days = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const cells: (ISODate | null)[] = Array.from({ length: offset }, () => null);
  for (let day = 1; day <= days; day++) {
    cells.push(addDays(startOfMonth(month), day - 1));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function nowISODateTime(): string {
  return new Date().toISOString();
}
