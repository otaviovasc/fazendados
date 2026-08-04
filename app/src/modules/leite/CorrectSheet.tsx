import { useState } from "react";
import { Button, Field, Sheet, inputCls } from "../../components/ui";
import { useFarm } from "../../state/store";
import { formatLiters, parseDecimal } from "../../lib/format";
import { formatLong } from "../../lib/dates";
import type { DailyMilkProduction, MilkCollection } from "../../domain/types";

export type CorrectionTarget =
  | { kind: "producao"; rec: DailyMilkProduction }
  | { kind: "coleta"; rec: MilkCollection };

/**
 * Correção de fato confirmado: mostra o valor atual, exige motivo e registra
 * antes/depois na auditoria via CorrectOperationalFact.
 * Renderizar com `key={target.rec.id}` para reiniciar os campos por alvo.
 */
export function CorrectSheet({
  target,
  onClose,
}: {
  target: CorrectionTarget;
  onClose: () => void;
}) {
  const { dispatch } = useFarm();
  const prod = target.kind === "producao" ? target.rec : null;
  const col = target.kind === "coleta" ? target.rec : null;

  const toInput = (v: number) => String(v).replace(".", ",");
  const [liters, setLiters] = useState(toInput(prod ? prod.liters : col!.liters));
  const [reason, setReason] = useState("");

  const parsed = parseDecimal(liters);

  const before = prod
    ? formatLiters(prod.liters)
    : `${formatLiters(col!.liters)} às ${col!.time}`;
  const after =
    parsed !== null
      ? prod
        ? formatLiters(parsed)
        : `${formatLiters(parsed)} às ${col!.time}`
      : "—";

  const valid = parsed !== null && reason.trim().length > 0;

  function submit() {
    if (!valid || parsed === null) return;
    const newLiters = parsed;
    if (prod) {
      dispatch({
        type: "CorrectOperationalFact",
        entityType: "producao_diaria",
        entityId: prod.id,
        newLiters,
        description: `Correção na Produção diária de ${formatLong(prod.date)}`,
        before,
        after,
        reason: reason.trim(),
      });
    } else if (col) {
      dispatch({
        type: "CorrectOperationalFact",
        entityType: "coleta",
        entityId: col.id,
        newLiters,
        description: `Correção na Coleta de ${formatLong(col.date)}`,
        before,
        after,
        reason: reason.trim(),
      });
    }
    onClose();
  }

  const title = prod ? "Corrigir Produção diária" : "Corrigir Coleta";

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose} className="flex-1">
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!valid} className="flex-1">
            Confirmar correção
          </Button>
        </div>
      }
    >
      <div className="rounded-xl bg-paper-sunken px-3.5 py-3 mb-4">
        <p className="text-[11px] uppercase tracking-wide text-ink-faint mb-0.5">
          Valor atual
        </p>
        <p className="tnum font-medium">{before}</p>
      </div>

      <div className="space-y-4">
        <Field label={prod ? "Nova produção do dia (L)" : "Novo volume (L)"}>
          <input
            className={inputCls}
            inputMode="decimal"
            placeholder="0,0"
            value={liters}
            onChange={(ev) => setLiters(ev.target.value)}
          />
        </Field>

        {liters.trim() !== "" && parsed === null && (
          <p className="text-sm text-danger-600">
            Valor inválido — use números, ex.: 182,5.
          </p>
        )}

        <Field
          label="Motivo da correção"
          hint="Obrigatório — fica na auditoria junto com o antes e o depois."
        >
          <textarea
            className={`${inputCls} min-h-20 resize-y`}
            placeholder="Ex.: conferi a planilha do tanque e o valor certo era…"
            value={reason}
            onChange={(ev) => setReason(ev.target.value)}
          />
        </Field>

        <p className="text-xs text-ink-faint">
          A correção não apaga o Registro original: o antes e o depois ficam
          registrados na auditoria.
        </p>
      </div>
    </Sheet>
  );
}
