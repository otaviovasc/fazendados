export const LEITE_TABS = [
  { to: "producao", label: "Produção" },
  { to: "controle", label: "Controle" },
  { to: "coleta", label: "Coleta" },
  { to: "comparar", label: "Comparar" },
] as const;

export type LeiteTab = (typeof LEITE_TABS)[number]["to"];

export function leiteTabPath(tab: LeiteTab): string {
  return `/leite/${tab}`;
}
