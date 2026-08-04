// Cliente HTTP da API do FazenDados. Todas as mutações passam por
// POST /api/commands com idempotencyKey; a sessão viaja em cookie httpOnly.
import type { FarmState } from "../domain/types";
import type { Action } from "./actions";
import type { ProposalInput } from "./actions";

/** Erro tipado devolvido pela API (4xx/5xx com corpo { error: { code, message } }). */
export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

/** Falha de transporte (offline, timeout, servidor inalcançável) — elegível a retry. */
export class NetworkError extends Error {
  constructor() {
    super("Sem conexão com o servidor.");
    this.name = "NetworkError";
  }
}

const TIMEOUT_MS = 15_000;

let unauthorizedHandler: () => void = () => {};
/** Registrado pelo FarmProvider: qualquer 401 derruba a sessão local e leva ao login. */
export function setUnauthorizedHandler(fn: () => void) {
  unauthorizedHandler = fn;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      ...init,
    });
  } catch {
    throw new NetworkError();
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) {
    unauthorizedHandler();
    throw new ApiRequestError(401, "UNAUTHORIZED", "Entre novamente para continuar.");
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiRequestError(
      res.status,
      err?.code ?? "INTERNAL_ERROR",
      err?.message ?? "Ocorreu um erro inesperado.",
    );
  }
  return body as T;
}

export async function fetchBootstrap(): Promise<FarmState> {
  const body = await request<{ state: FarmState }>("/api/bootstrap");
  return body.state;
}

/**
 * Envia um comando ao servidor. A MESMA idempotencyKey deve ser usada em
 * todos os retries — o servidor devolve a resposta anterior sem duplicar fatos.
 */
export async function sendCommand(idempotencyKey: string, action: Action): Promise<unknown> {
  const body = await request<{ ok: true; result: unknown }>("/api/commands", {
    method: "POST",
    body: JSON.stringify({ idempotencyKey, action }),
  });
  return body.result;
}

export async function interpretAssistantCapture(text: string): Promise<ProposalInput[]> {
  const body = await request<{ proposals: ProposalInput[] }>("/api/assistant/interpret", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  return body.proposals;
}

export async function apiLogin(password: string): Promise<void> {
  await request<{ ok: true }>("/api/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function apiLogout(): Promise<void> {
  try {
    await request<{ ok: true }>("/api/logout", { method: "POST" });
  } catch {
    // Mesmo com falha de rede o cookie expira no servidor; a UI segue para o login.
  }
}
