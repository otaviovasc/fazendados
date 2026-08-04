import type { ISODate } from "../domain/types.js";

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Hoje operacional (data real do dispositivo). */
export function today(): ISODate {
  return toISODate(new Date());
}

export function addDays(iso: ISODate, delta: number): ISODate {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return toISODate(d);
}

export function lastNDays(n: number): ISODate[] {
  const out: ISODate[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(addDays(today(), -i));
  return out;
}

const fmtDay = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const fmtLong = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const fmtWeekday = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });

export function formatDay(iso: ISODate): string {
  return fmtDay.format(new Date(iso + "T12:00:00"));
}

export function formatLong(iso: ISODate): string {
  return fmtLong.format(new Date(iso + "T12:00:00"));
}

export function formatWeekday(iso: ISODate): string {
  return fmtWeekday.format(new Date(iso + "T12:00:00")).replace(".", "");
}

/** "hoje", "ontem" ou data curta. */
export function formatRelativeDay(iso: ISODate): string {
  if (iso === today()) return "hoje";
  if (iso === addDays(today(), -1)) return "ontem";
  return formatDay(iso);
}

export function nowISODateTime(): string {
  return new Date().toISOString();
}
