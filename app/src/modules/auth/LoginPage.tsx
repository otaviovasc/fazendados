// Tela de entrada: senha única da fazenda (APP_PASSWORD), sessão em cookie.
import { useState, type FormEvent } from "react";
import { Lock, Milk } from "lucide-react";
import { ApiRequestError, NetworkError } from "../../state/api";
import { Button, inputCls } from "../../components/ui";

export function LoginPage({ onLogin }: { onLogin: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onLogin(password);
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

        <label className="block mb-4">
          <span className="block text-sm font-medium mb-1.5">Senha da fazenda</span>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              type="password"
              autoFocus
              autoComplete="current-password"
              className={`${inputCls} pl-9`}
              placeholder="••••••••"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </div>
        </label>

        {error && (
          <p className="text-sm text-danger-600 mb-4" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={!password || busy} className="w-full">
          {busy ? "Entrando…" : "Entrar"}
        </Button>
      </form>
    </div>
  );
}
