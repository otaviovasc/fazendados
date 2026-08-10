import { Moon, Sun } from "lucide-react";
import { toggleTheme, useDarkMode } from "../theme";

/**
 * Alternância claro/escuro no padrão dos itens de navegação (ícone + rótulo).
 * Usada na sidebar do desktop e no menu "Mais" do mobile.
 */
export function ThemeToggle() {
  const dark = useDarkMode();
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={dark ? "Mudar para tema claro" : "Mudar para tema escuro"}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-soft hover:bg-ink/5 transition min-h-[44px]"
    >
      <Icon size={18} />
      {dark ? "Tema claro" : "Tema escuro"}
    </button>
  );
}
