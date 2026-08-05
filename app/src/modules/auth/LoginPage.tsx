// Tela de entrada: credenciais do Usuário, sessão em cookie httpOnly.
import { useState, type FormEvent } from "react";
import { Lock, Milk, UserRound } from "lucide-react";
import { ApiRequestError, NetworkError } from "../../state/api";
import { Button, inputCls } from "../../components/ui";

export function LoginPage({
  onLogin,
  onRegister,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (input: { farmName: string; displayName: string; username: string; password: string }) => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [farmName, setFarmName] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!username.trim() || !password || busy) return;
    if (mode === "register" && password !== passwordConfirm) {
      setError("As senhas precisam ser iguais.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await onLogin(username.trim(), password);
      else await onRegister({ farmName: farmName.trim(), displayName: name.trim(), username: username.trim(), password });
    } catch (e) {
      if (e instanceof ApiRequestError || e instanceof NetworkError) setError(e.message);
      else setError("Não foi possível entrar. Tente novamente.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh grid place-items-center px-6 bg-paper">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="size-14 rounded-2xl bg-pasture-100 text-pasture-700 grid place-items-center mb-4">
            <Milk size={28} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">FazenDados</h1>
          <p className="text-sm text-ink-soft mt-1">O caderno da fazenda, sem papel.</p>
        </div>

        {mode === "register" && <>
          <label className="block mb-4">
            <span className="block text-sm font-medium mb-1.5">Nome da Fazenda</span>
            <input className={inputCls} placeholder="Ex.: Sítio Boa Vista" value={farmName} onChange={(ev) => setFarmName(ev.target.value)} />
          </label>
          <label className="block mb-4">
            <span className="block text-sm font-medium mb-1.5">Seu nome</span>
            <input className={inputCls} autoComplete="name" placeholder="Como quer ser chamado" value={name} onChange={(ev) => setName(ev.target.value)} />
          </label>
        </>}

        <label className="block mb-4">
          <span className="block text-sm font-medium mb-1.5">Usuário</span>
          <div className="relative">
            <UserRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="text"
              autoFocus
              autoComplete="username"
              className={`${inputCls} pl-9`}
              placeholder="Seu usuário"
              minLength={3}
              maxLength={32}
              pattern="[a-z0-9][a-z0-9_.-]{2,31}"
              title="Use de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado."
              value={username}
              onChange={(ev) => setUsername(ev.target.value)}
            />
          </div>
        </label>

        <label className="block mb-4">
          <span className="block text-sm font-medium mb-1.5">Senha</span>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="password"
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className={`${inputCls} pl-9`}
              placeholder={mode === "register" ? "Mínimo de 12 caracteres" : "••••••••"}
              minLength={mode === "register" ? 12 : undefined}
              maxLength={200}
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </div>
          {mode === "register" && <span className="block mt-1 text-xs text-ink-soft">Use pelo menos 12 caracteres.</span>}
        </label>

        {mode === "register" && (
          <label className="block mb-4">
            <span className="block text-sm font-medium mb-1.5">Confirmar senha</span>
            <input
              type="password"
              autoComplete="new-password"
              className={inputCls}
              placeholder="Repita a senha"
              minLength={12}
              maxLength={200}
              value={passwordConfirm}
              onChange={(ev) => setPasswordConfirm(ev.target.value)}
            />
          </label>
        )}

        {error && (
          <p className="text-sm text-danger-600 mb-4" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={!username.trim() || !password || (mode === "register" && (!farmName.trim() || !name.trim() || !passwordConfirm)) || busy} className="w-full">
          {busy ? (mode === "login" ? "Entrando…" : "Criando acesso…") : (mode === "login" ? "Entrar" : "Criar acesso")}
        </Button>
        <button
          type="button"
          className="w-full min-h-[44px] mt-2 text-sm font-medium text-pasture-700"
          onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(null); }}
        >
          {mode === "login" ? "Criar acesso para uma nova Fazenda" : "Já tenho acesso"}
        </button>
      </form>
    </div>
  );
}
