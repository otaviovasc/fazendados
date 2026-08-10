import { useSyncExternalStore } from "react";

// Chave compartilhada com o script inline do index.html (que aplica a classe
// antes do primeiro paint, evitando o flash de tema errado).
export const THEME_STORAGE_KEY = "fazendados-theme";

export type Theme = "light" | "dark";

function currentTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// A classe `dark` no <html> é a fonte de verdade; observamos mutações nela
// para re-renderizar quem depende do tema (ex.: tabuleiro do jogo).
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/** Tema atual, reativo à classe `dark` do <html>. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, currentTheme);
}

/** Atalho para o caso comum: o tema escuro está ativo? */
export function useDarkMode(): boolean {
  return useTheme() === "dark";
}

/** Alterna o tema e persiste a escolha; sem preferência salva, vale o sistema. */
export function toggleTheme() {
  const next: Theme = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.classList.toggle("dark", next === "dark");
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Armazenamento indisponível (modo privado): o tema vale só nesta sessão.
  }
}

/** Cor do tema como `rgb(var(--token))`, para atributos SVG (gráficos, mapa). */
export function themeColor(token: string): string {
  return `rgb(var(--${token}))`;
}
