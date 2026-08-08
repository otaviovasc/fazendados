// Cliente HTTP da API do FazenDados. Todas as mutações passam por
// POST /api/commands com idempotencyKey; a sessão viaja em cookie httpOnly.
import type { AssistantCapture, AssistantProposal, FarmState } from "../domain/types";
import type { Action } from "./actions";

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
    const headers = new Headers(init?.headers);
    if (!(init?.body instanceof FormData) && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    res = await fetch(path, {
      credentials: "same-origin",
      headers,
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

export async function fetchBootstrap(): Promise<FarmState | null> {
  const body = await request<{ authenticated: false } | { authenticated: true; state: FarmState }>("/api/bootstrap");
  return body.authenticated ? body.state : null;
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

/** Persiste a Captura textual antes de pedir a interpretação. */
export async function createAssistantTextCapture(text: string): Promise<AssistantCapture> {
  const body = await request<{ capture: AssistantCapture }>("/api/assistant/captures", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
  return body.capture;
}

export type AssistantInterpretation = {
  capture: AssistantCapture;
  proposals: AssistantProposal[];
};

/**
 * Persiste uma foto da Captura antes da interpretação. O arquivo viaja em
 * multipart para não precisar virar base64 na memória do navegador.
 */
export async function uploadAssistantPhoto(
  photo: File,
  text?: string,
): Promise<AssistantCapture> {
  const form = new FormData();
  form.set("photo", photo);
  if (text?.trim()) form.set("text", text.trim());
  const body = await request<{ capture: AssistantCapture }>("/api/assistant/captures/photo", {
    method: "POST",
    body: form,
  });
  return body.capture;
}

export async function uploadAssistantFile(
  file: File,
  category: string,
  text?: string,
): Promise<AssistantCapture> {
  const form = new FormData();
  form.set("file", file);
  form.set("category", category);
  if (text?.trim()) form.set("text", text.trim());
  const body = await request<{ capture: AssistantCapture }>("/api/assistant/captures/file", {
    method: "POST",
    body: form,
  });
  return body.capture;
}

/** Interpreta uma Captura já persistida, mantendo a mídia privada no servidor. */
export async function interpretPersistedAssistantCapture(
  captureId: string,
): Promise<AssistantInterpretation> {
  return request<AssistantInterpretation>(`/api/assistant/captures/${captureId}/interpret`, {
    method: "POST",
  });
}

/** Lê o texto literal da foto antes da interpretação; OCR não confirma fatos. */
export async function readAssistantPhoto(captureId: string): Promise<AssistantCapture> {
  const body = await request<{ capture: AssistantCapture }>(
    `/api/assistant/captures/${captureId}/read`,
    { method: "POST" },
  );
  return body.capture;
}

export async function apiLogin(username: string, password: string): Promise<void> {
  await request<{ ok: true }>("/api/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function apiRegister(input: {
  farmName: string;
  displayName: string;
  username: string;
  password: string;
}): Promise<void> {
  await request<{ ok: true }>("/api/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function apiLogout(): Promise<void> {
  try {
    await request<{ ok: true }>("/api/logout", { method: "POST" });
  } catch {
    // Mesmo com falha de rede o cookie expira no servidor; a UI segue para o login.
  }
}
