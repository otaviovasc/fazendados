// Store API-backed do FazenDados.
//
// - Estado inicial vem de GET /api/bootstrap (nada de mocks: o dado de
//   demonstração é semeado no banco com `pnpm db:seed`).
// - Mutações vão para POST /api/commands numa FILA SERIALIZADA, cada uma com
//   idempotencyKey própria; retry de rede reutiliza a MESMA chave, então
//   repetir após falha nunca duplica fatos.
// - Sessão em cookie httpOnly: qualquer 401 derruba para a tela de login.
// - Medições/sessões de controle aplicam otimismo local (resultado
//   determinístico); tudo converge pelo merge do resultado do servidor e por
//   um refresh de bootstrap agendado (traz a auditoria gravada na transação).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Animal,
  AssistantCapture,
  AssistantProposal,
  DailyMilkProduction,
  FarmState,
  HerdGroup,
  IndividualMilkMeasurement,
  MilkControlSession,
  Pasture,
} from "../domain/types";
import { today } from "../lib/dates";
import { uid } from "../lib/prng";
import {
  ApiRequestError,
  NetworkError,
  apiLogin,
  apiLogout,
  fetchBootstrap,
  sendCommand,
  setUnauthorizedHandler,
} from "./api";
import type { Action } from "./actions";
import { applyCommandResult, applyOptimistic } from "./apply";
import { LoginPage } from "../modules/auth/LoginPage";

export type { Action } from "./actions";

export type CommandOutcome =
  | { ok: true; result: unknown }
  | { ok: false; code: string; message: string };

type QueueEntry = {
  key: string;
  action: Action;
  resolve: (outcome: CommandOutcome) => void;
};

type Status = "loading" | "ready" | "error" | "unauthorized";

interface FarmContextValue {
  state: FarmState;
  /** Enfileira o comando; resolve quando o servidor responde (nunca rejeita). */
  dispatch: (action: Action) => Promise<CommandOutcome>;
  logout: () => Promise<void>;
  /** Comandos aguardando confirmação do servidor. */
  pendingCount: number;
  /** Falha de rede: fila pausada, retry manual/automático com a mesma chave. */
  offline: boolean;
  retrySync: () => void;
  /** Último erro de domínio devolvido pelo servidor (toast auto-dismiss). */
  syncError: { code: string; message: string } | null;
  dismissSyncError: () => void;
}

const FarmContext = createContext<FarmContextValue | null>(null);

export function FarmProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [bootError, setBootError] = useState<string | null>(null);
  const [state, setState] = useState<FarmState | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [offline, setOffline] = useState(false);
  const [syncError, setSyncError] = useState<FarmContextValue["syncError"]>(null);

  const queueRef = useRef<QueueEntry[]>([]);
  const processingRef = useRef(false);
  const pausedRef = useRef(false);
  const refreshTimer = useRef<number | null>(null);

  /** Limpa fila e estado local (sessão expirada ou logout). */
  const resetSession = useCallback(() => {
    pausedRef.current = false;
    const pending = queueRef.current;
    queueRef.current = [];
    for (const entry of pending) {
      entry.resolve({ ok: false, code: "UNAUTHORIZED", message: "Entre novamente para continuar." });
    }
    setPendingCount(0);
    setOffline(false);
    setState(null);
    setStatus("unauthorized");
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(resetSession);
  }, [resetSession]);

  /** Refresh autoritativo agendado: converge auditoria e efeitos do servidor. */
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(async () => {
      // Fila ainda ativa: não sobrescrever otimismos pendentes — reagendar.
      if (queueRef.current.length > 0) {
        scheduleRefresh();
        return;
      }
      try {
        setState(await fetchBootstrap());
      } catch {
        // Falha silenciosa: o próximo comando/agendamento tenta de novo.
      }
    }, 1200);
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current || pausedRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length > 0 && !pausedRef.current) {
        const entry = queueRef.current[0];
        try {
          const result = await sendCommand(entry.key, entry.action);
          queueRef.current.shift();
          setPendingCount(queueRef.current.length);
          setState((s) => (s ? applyCommandResult(s, entry.action, result) : s));
          entry.resolve({ ok: true, result });
          scheduleRefresh();
        } catch (e) {
          if (e instanceof NetworkError) {
            // Mantém a entrada na cabeça da fila: o retry usa a MESMA chave.
            pausedRef.current = true;
            setOffline(true);
            continue;
          }
          queueRef.current.shift();
          setPendingCount(queueRef.current.length);
          const code = e instanceof ApiRequestError ? e.code : "INTERNAL_ERROR";
          const message = e instanceof Error ? e.message : "Ocorreu um erro inesperado.";
          entry.resolve({ ok: false, code, message });
          setSyncError({ code, message });
          scheduleRefresh(); // reconcilia qualquer otimismo não confirmado
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [scheduleRefresh]);

  const dispatch = useCallback(
    (action: Action): Promise<CommandOutcome> => {
      setState((s) => (s ? applyOptimistic(s, action) : s));
      return new Promise<CommandOutcome>((resolve) => {
        queueRef.current.push({ key: uid("cmd"), action, resolve });
        setPendingCount(queueRef.current.length);
        void processQueue();
      });
    },
    [processQueue],
  );

  const retrySync = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setOffline(false);
    void processQueue();
  }, [processQueue]);

  // Retomada automática quando a conexão volta.
  useEffect(() => {
    window.addEventListener("online", retrySync);
    return () => window.removeEventListener("online", retrySync);
  }, [retrySync]);

  // Toast de erro de domínio some sozinho.
  useEffect(() => {
    if (!syncError) return;
    const t = window.setTimeout(() => setSyncError(null), 6000);
    return () => window.clearTimeout(t);
  }, [syncError]);

  const boot = useCallback(async () => {
    setStatus("loading");
    setBootError(null);
    try {
      setState(await fetchBootstrap());
      setStatus("ready");
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) return; // handler já redirecionou
      setBootError(e instanceof NetworkError ? "Sem conexão com o servidor." : "Não foi possível carregar os dados.");
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void boot();
  }, [boot]);

  const login = useCallback(
    async (password: string) => {
      await apiLogin(password);
      await boot();
    },
    [boot],
  );

  const logout = useCallback(async () => {
    await apiLogout();
    resetSession();
  }, [resetSession]);

  const value = useMemo<FarmContextValue | null>(
    () =>
      state && status === "ready"
        ? {
            state,
            dispatch,
            logout,
            pendingCount,
            offline,
            retrySync,
            syncError,
            dismissSyncError: () => setSyncError(null),
          }
        : null,
    [state, status, dispatch, logout, pendingCount, offline, retrySync, syncError],
  );

  if (status === "loading") {
    return (
      <div className="min-h-dvh grid place-items-center">
        <div className="text-center">
          <div className="mx-auto mb-4 size-8 rounded-full border-[3px] border-pasture-200 border-t-pasture-600 animate-spin" />
          <p className="text-sm text-ink-soft">Carregando dados da fazenda…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-dvh grid place-items-center px-6">
        <div className="text-center max-w-xs">
          <p className="font-semibold mb-1">Não foi possível carregar</p>
          <p className="text-sm text-ink-soft mb-4">{bootError}</p>
          <button
            onClick={() => void boot()}
            className="rounded-xl bg-pasture-600 text-white px-5 py-2.5 text-sm font-semibold min-h-[44px]"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (status === "unauthorized" || !value) {
    return <LoginPage onLogin={login} />;
  }

  return (
    <FarmContext.Provider value={value}>
      {children}

      {/* Falha de rede: fila pausada, nada foi perdido. */}
      {offline && (
        <div className="fixed top-0 inset-x-0 z-[60] bg-ink text-white px-4 py-2.5 flex items-center justify-center gap-3 text-sm safe-top">
          <span>
            Sem conexão — {pendingCount}{" "}
            {pendingCount === 1 ? "alteração guardada" : "alterações guardadas"} para enviar.
          </span>
          <button onClick={retrySync} className="font-semibold underline underline-offset-2">
            Tentar agora
          </button>
        </div>
      )}

      {/* Erro de domínio devolvido pelo servidor. */}
      {syncError && !offline && (
        <div className="fixed bottom-20 md:bottom-6 inset-x-0 z-[60] flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto bg-ink text-white text-sm rounded-xl px-4 py-3 shadow-lg max-w-sm flex items-start gap-3">
            <span className="flex-1">{syncError.message}</span>
            <button
              onClick={() => setSyncError(null)}
              className="text-white/70 hover:text-white shrink-0"
              aria-label="Fechar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </FarmContext.Provider>
  );
}

export function useFarm(): FarmContextValue {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error("useFarm fora do FarmProvider ou estado ainda não carregado");
  return ctx;
}

// ---------- Seletores compartilhados ----------

export function openAssignment(s: FarmState, animalId: string) {
  return s.assignments.find((a) => a.animalId === animalId && a.end === null) ?? null;
}

export function groupOf(s: FarmState, animalId: string): HerdGroup | null {
  const asg = openAssignment(s, animalId);
  return asg ? s.groups.find((g) => g.id === asg.groupId) ?? null : null;
}

export function animalsInGroup(s: FarmState, groupId: string): Animal[] {
  const ids = new Set(
    s.assignments.filter((a) => a.groupId === groupId && a.end === null).map((a) => a.animalId)
  );
  return s.animals.filter((a) => ids.has(a.id));
}

export function openOccupancy(s: FarmState, groupId: string) {
  return s.occupancies.find((o) => o.groupId === groupId && o.end === null) ?? null;
}

export function pastureOfGroup(s: FarmState, groupId: string): Pasture | null {
  const occ = openOccupancy(s, groupId);
  return occ ? s.pastures.find((p) => p.id === occ.pastureId) ?? null : null;
}

export function productionFor(s: FarmState, date: string): DailyMilkProduction | undefined {
  return s.productions.find((p) => p.date === date);
}

/** Sessões de controle de uma data (qualquer Lote/turno). */
export function sessionsOnDate(s: FarmState, date: string): MilkControlSession[] {
  return s.sessions.filter((x) => x.date === date);
}

export function measurementsOf(s: FarmState, sessionId: string): IndividualMilkMeasurement[] {
  return s.measurements.filter((m) => m.sessionId === sessionId);
}

/**
 * Litros/dia de um Animal em uma data: soma das Medições das sessões daquele dia.
 * null quando não houve nenhuma medição (ausência ≠ zero).
 */
export function animalDailyLiters(s: FarmState, animalId: string, date: string): number | null {
  const sessionIds = new Set(sessionsOnDate(s, date).map((x) => x.id));
  const rows = s.measurements.filter((m) => m.animalId === animalId && sessionIds.has(m.sessionId));
  if (rows.length === 0) return null;
  return Math.round(rows.reduce((acc, m) => acc + m.liters, 0) * 10) / 10;
}

export const SHIFT_LABEL: Record<MilkControlSession["shift"], string> = {
  manha: "manhã",
  tarde: "tarde",
  unica: "ordenha única",
};

/** Saldo derivado: entradas − itens do trato confirmados. Nunca editável. */
export function feedBalance(s: FarmState, itemId: string): number {
  const entries = s.feedEntries
    .filter((e) => e.itemId === itemId)
    .reduce((acc, e) => acc + e.quantity, 0);
  const used = s.feedingEvents
    .flatMap((ev) => ev.items)
    .filter((i) => i.itemId === itemId)
    .reduce((acc, i) => acc + i.quantity, 0);
  return entries - used;
}

export function pendingProposals(s: FarmState): AssistantProposal[] {
  return s.proposals.filter((p) => p.status === "pendente");
}

export function captureOf(s: FarmState, captureId: string): AssistantCapture | undefined {
  return s.captures.find((c) => c.id === captureId);
}

export { today };
