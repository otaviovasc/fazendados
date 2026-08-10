// Registro do service worker com auto-update.
// Se houver interação recente de formulário (rascunho possível), o reload é
// adiado para a próxima vez que a aba ficar visível / próxima checagem.
import { registerSW } from "virtual:pwa-register";

const INTERACTION_GUARD_MS = 60_000;
let lastFormInteraction = 0;

// Qualquer digitação/clique/foco em formulário marca possível rascunho aberto.
const markFormInteraction = (e: Event) => {
  if ((e.target as HTMLElement | null)?.closest?.("form, input, textarea, select")) {
    lastFormInteraction = Date.now();
  }
};
window.addEventListener("input", markFormInteraction, true);
window.addEventListener("change", markFormInteraction, true);
window.addEventListener("focusin", markFormInteraction, true);

function hasPossibleDraft() {
  return Date.now() - lastFormInteraction < INTERACTION_GUARD_MS;
}

let pendingUpdate: (() => void) | null = null;

function applyUpdateWhenSafe() {
  if (!pendingUpdate) return;
  if (hasPossibleDraft()) return; // tenta de novo no próximo trigger
  const update = pendingUpdate;
  pendingUpdate = null;
  update();
}

export function setupPwa() {
  const updateSW = registerSW({
    onNeedRefresh() {
      // Recarrega automaticamente, a menos que haja rascunho possível.
      pendingUpdate = () => updateSW(true);
      applyUpdateWhenSafe();
    },
    onOfflineReady() {
      console.log("[pwa] app pronto para uso offline");
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => {
        registration.update();
        // Um update "waiting" pode nunca ser re-aplicado se o usuário não
        // trocar de aba — re-tenta junto com a checagem periódica.
        applyUpdateWhenSafe();
      };
      // Checagem periódica (1h) e ao voltar para a aba.
      setInterval(check, 60 * 60 * 1000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") check();
      });
    },
  });
}
