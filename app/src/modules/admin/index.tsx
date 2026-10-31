import { useEffect, useState, type FormEvent } from "react";
import { Button, Card, Field, InlineError, inputCls } from "../../components/ui";

type AdminUser = { id: string; name: string; username: string; farmName: string };

class AdminError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/admin${path}`, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: body ? { "content-type": "application/json", "x-admin-request": "1" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error("Sem conexão. Verifique sua internet e tente novamente."); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new AdminError(data?.error?.message ?? "Não foi possível concluir a solicitação.", response.status);
  return data as T;
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  function handleError(e: unknown) {
    if (e instanceof AdminError && e.status === 401) {
      setAuthenticated(false); setUsers([]); setSelected(null); setPassword(""); setConfirmation("");
    }
    setError(e instanceof Error ? e.message : "Não foi possível concluir a solicitação.");
  }

  async function loadUsers() {
    const data = await request<{ users: AdminUser[] }>("/users");
    setUsers(data.users);
  }

  async function checkSession() {
    setChecking(true); setError("");
    try {
      const data = await request<{ authenticated: boolean }>("/session");
      setAuthenticated(data.authenticated);
      if (data.authenticated) await loadUsers();
    } catch (e) { handleError(e); }
    finally { setChecking(false); }
  }

  useEffect(() => { void checkSession(); }, []);
  useEffect(() => {
    if (!password && !confirmation) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [password, confirmation]);

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await request("/login", { password: adminPassword });
      setAdminPassword(""); setAuthenticated(true); await loadUsers();
    } catch (e) { handleError(e); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setError("");
    try {
      await request("/logout", {});
      setAuthenticated(false); setUsers([]); setSelected(null);
      setPassword(""); setConfirmation(""); setNotice("");
    } catch (e) { handleError(e); }
    finally { setBusy(false); }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!selected) return;
    if (password !== confirmation) { setError("As senhas precisam ser iguais."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/users/${encodeURIComponent(selected.id)}/password`, { password });
      setNotice(`Senha de @${selected.username} redefinida. As sessões anteriores foram encerradas.`);
      setSelected(null); setPassword(""); setConfirmation("");
    } catch (e) { handleError(e); }
    finally { setBusy(false); }
  }

  const filtered = users.filter((user) => `${user.name} ${user.username} ${user.farmName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

  return <main className="min-h-dvh bg-paper px-4 py-8">
    <div className="mx-auto max-w-xl space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div><h1 className="text-xl font-semibold">Administração</h1><p className="text-sm text-ink-soft">FazenDados · Gerenciar acesso dos usuários</p></div>
        {authenticated && <Button variant="ghost" disabled={busy} onClick={() => void logout()}>Sair</Button>}
      </header>
      {error && <InlineError>{error}</InlineError>}
      {notice && <p role="status" className="rounded-xl bg-pasture-100 text-pasture-700 p-4 text-sm">{notice}</p>}
      {checking ? <p role="status">Verificando acesso…</p> : !authenticated ?
        <Card className="p-5"><form onSubmit={login} className="space-y-4">
          <Field label="Senha de administrador"><input type="password" required autoComplete="current-password" className={inputCls} value={adminPassword} maxLength={200} onChange={(e) => setAdminPassword(e.target.value)} /></Field>
          <Button type="submit" className="w-full" disabled={busy || !adminPassword}>{busy ? "Entrando…" : "Entrar na administração"}</Button>
          {error && <Button type="button" variant="ghost" onClick={() => void checkSession()}>Verificar acesso novamente</Button>}
        </form></Card> : selected ?
        <Card className="p-5"><form onSubmit={resetPassword} className="space-y-4">
          <h2 className="font-semibold">Redefinir senha de @{selected.username}</h2>
          <p className="text-sm text-ink-soft">{selected.name} · {selected.farmName}. Ao confirmar, as sessões anteriores desse usuário serão encerradas.</p>
          <Field label="Nova senha" hint="Entre 12 e 200 caracteres."><input type="password" required autoComplete="new-password" minLength={12} maxLength={200} className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <Field label="Confirmar nova senha"><input type="password" required autoComplete="new-password" minLength={12} maxLength={200} className={inputCls} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></Field>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "Redefinindo…" : "Confirmar redefinição"}</Button>
          <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={() => {
            if ((password || confirmation) && !window.confirm("Descartar a senha digitada?")) return;
            setSelected(null); setPassword(""); setConfirmation(""); setError("");
          }}>Cancelar</Button>
        </form></Card> : <>
          <Field label="Buscar usuário ou Fazenda"><input type="search" className={inputCls} value={query} onChange={(e) => setQuery(e.target.value)} /></Field>
          <Button variant="ghost" disabled={busy} onClick={async () => { setBusy(true); setError(""); try { await loadUsers(); } catch (e) { handleError(e); } finally { setBusy(false); } }}>{busy ? "Atualizando…" : "Atualizar usuários"}</Button>
          {!filtered.length && <p className="text-sm text-ink-soft">Nenhum usuário encontrado.</p>}
          <ul className="space-y-3">{filtered.map((user) => <li key={user.id}><Card className="p-4 space-y-3">
            <div className="break-words"><h2 className="font-semibold">{user.name}</h2><p className="text-sm text-ink-soft">@{user.username} · {user.farmName}</p></div>
            <Button variant="secondary" disabled={busy} onClick={() => { setSelected(user); setError(""); setNotice(""); }}>Redefinir senha</Button>
          </Card></li>)}</ul>
        </>}
      <a href="/" className="inline-flex items-center min-h-[44px] text-sm text-pasture-700">Voltar ao FazenDados</a>
    </div>
  </main>;
}
