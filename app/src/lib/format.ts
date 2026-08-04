const fmtLiters = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const fmtBRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const fmtQty = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

/** "182,5 L" — ausência deve ser tratada antes de chamar isto (nunca 0). */
export function formatLiters(v: number): string {
  return `${fmtLiters.format(v)} L`;
}

export function formatCents(cents: number): string {
  return fmtBRL.format(cents / 100);
}

export function formatQty(v: number, unit: string): string {
  return `${fmtQty.format(v)} ${unit}`;
}

/** Percentual de cobertura, ex.: "72%" */
export function formatCoverage(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function parseDecimal(input: string): number | null {
  const normalized = input.replace(",", ".").trim();
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
