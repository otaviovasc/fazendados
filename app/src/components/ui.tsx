import { useEffect, useState, type ReactNode } from "react";
import { Check, X } from "lucide-react";

// ---------- Layout ----------

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-ink-soft mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-paper-card rounded-2xl border border-black/5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint mb-2">
      {children}
    </h2>
  );
}

// ---------- Chips ----------

type ChipTone = "captura" | "proposta" | "registro" | "pendente" | "confirmada" | "neutro" | "perigo";

const chipStyles: Record<ChipTone, string> = {
  captura: "bg-ink/5 text-ink-soft",
  proposta: "bg-review-100 text-review-700",
  registro: "bg-pasture-100 text-pasture-700",
  pendente: "bg-review-100 text-review-700",
  confirmada: "bg-pasture-100 text-pasture-700",
  neutro: "bg-ink/5 text-ink-soft",
  perigo: "bg-danger-100 text-danger-600",
};

export function Chip({ tone = "neutro", children }: { tone?: ChipTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${chipStyles[tone]}`}>
      {children}
    </span>
  );
}

/** Selo inequívoco de natureza do dado: Captura, Proposta ou Registro. */
export function FactNatureChip({ nature }: { nature: "captura" | "proposta" | "registro" }) {
  const label = { captura: "Captura", proposta: "Proposta", registro: "Registro confirmado" }[nature];
  return <Chip tone={nature}>{label}</Chip>;
}

export function CoverageBadge({ ratio }: { ratio: number }) {
  const pct = Math.round(ratio * 100);
  const tone = pct >= 80 ? "confirmada" : pct >= 50 ? "pendente" : "perigo";
  return <Chip tone={tone as ChipTone}>cobertura {pct}%</Chip>;
}

// ---------- Estados ----------

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6">
      {icon && <div className="text-ink-faint mb-3">{icon}</div>}
      <p className="font-medium">{title}</p>
      {hint && <p className="text-sm text-ink-soft mt-1 max-w-xs">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Valor ausente: nunca renderizar como zero. */
export function AbsentValue({ label = "sem medição" }: { label?: string }) {
  return <span className="text-ink-faint text-sm italic">{label}</span>;
}

/** Erro de comando exibido dentro do formulário, em linguagem simples. */
export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-xl bg-danger-100 text-danger-600 text-sm px-3.5 py-3"
    >
      {children}
    </p>
  );
}

/** Confirmação visível de sucesso após salvar; some sozinha após alguns segundos. */
export function SuccessNotice({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDismiss, 6000);
    return () => window.clearTimeout(t);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div className="mb-4 rounded-xl bg-pasture-100 text-pasture-700 px-4 py-3 flex items-center gap-3">
      <Check size={16} className="shrink-0" />
      <p className="text-sm flex-1">{message}</p>
      <button
        onClick={onDismiss}
        aria-label="Fechar aviso"
        className="p-2 -m-1 text-pasture-700/70 hover:text-pasture-700"
      >
        <X size={16} />
      </button>
    </div>
  );
}

/**
 * Guarda de alterações não salvas (padrão único dos fluxos): com o formulário
 * sujo, fechar (backdrop, X ou Cancelar) troca o rodapé pela confirmação de
 * descarte em vez de perder os dados sem aviso.
 */
export function useUnsavedGuard(dirty: boolean, onDiscard: () => void) {
  const [asking, setAsking] = useState(false);
  return {
    /** true enquanto a pergunta "descartar?" está visível. */
    asking,
    /** Usar no lugar de onClose: pergunta antes quando há dados digitados. */
    requestClose: () => (dirty ? setAsking(true) : onDiscard()),
    keepEditing: () => setAsking(false),
    discard: onDiscard,
  };
}

/** Rodapé de confirmação de descarte — substitui o rodapé normal do Sheet. */
export function UnsavedFooter({
  onKeepEditing,
  onDiscard,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-sm text-ink-soft text-center">
        Há informações digitadas que ainda não foram salvas.
      </p>
      <div className="flex gap-2">
        <Button variant="ghost" className="flex-1" onClick={onKeepEditing}>
          Continuar editando
        </Button>
        <Button variant="danger" className="flex-1" onClick={onDiscard}>
          Descartar
        </Button>
      </div>
    </div>
  );
}

// ---------- Form ----------

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-medium mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-xs text-ink-soft mt-1">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-base tnum outline-none focus:border-pasture-500 focus:ring-2 focus:ring-pasture-100 transition";

export function Button({
  variant = "primary",
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const styles = {
    primary: "bg-pasture-600 text-white hover:bg-pasture-700 active:bg-pasture-900",
    secondary: "bg-pasture-100 text-pasture-700 hover:bg-pasture-200",
    ghost: "text-ink-soft hover:bg-ink/5",
    danger: "bg-danger-100 text-danger-600 hover:bg-danger-100/70",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 disabled:pointer-events-none min-h-[44px] ${styles} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------- Sheet (modal mobile-first) ----------

export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-ink/40 animate-overlay" onClick={onClose} />
      <div className="relative w-full sm:max-w-md bg-paper-card rounded-t-3xl sm:rounded-2xl max-h-[88vh] flex flex-col safe-bottom animate-sheet">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-black/5">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="p-2 -mr-2 text-ink-soft" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 flex-1">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-black/5">{footer}</div>}
      </div>
    </div>
  );
}
