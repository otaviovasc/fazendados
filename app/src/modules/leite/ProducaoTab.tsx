import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { productionFor, useFarm } from "../../state/store";
import {
  AbsentValue,
  Button,
  Card,
  Field,
  Sheet,
  SuccessNotice,
  UnsavedFooter,
  inputCls,
  useUnsavedGuard,
} from "../../components/ui";
import { formatLiters, parseDecimal } from "../../lib/format";
import { formatRelativeDay, formatWeekday, lastNDays, today } from "../../lib/dates";
import { CorrectSheet, type CorrectionTarget } from "./CorrectSheet";

function ProductionSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { state, dispatch } = useFarm();
  const [date, setDate] = useState(today());
  const [liters, setLiters] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseDecimal(liters);
  const invalid = liters.trim() !== "" && parsed === null;
  const existing = productionFor(state, date);
  const guard = useUnsavedGuard(liters.trim() !== "" || date !== today(), onClose);

  async function submit() {
    if (parsed === null || busy || existing) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "RecordDailyMilkProduction",
      date,
      liters: parsed,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onSaved(
      `Produção de ${formatRelativeDay(date)} registrada — ${formatLiters(parsed)}`
    );
    onClose();
  }

  return (
    <Sheet
      open
      onClose={guard.requestClose}
      title="Registrar produção"
      footer={
        guard.asking ? (
          <UnsavedFooter onKeepEditing={guard.keepEditing} onDiscard={guard.discard} />
        ) : (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={guard.requestClose} className="flex-1">
              Cancelar
            </Button>
            <Button
              onClick={submit}
              disabled={parsed === null || busy || Boolean(existing)}
              className="flex-1"
            >
              {busy ? "Registrando…" : "Registrar produção"}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <Field label="Data">
          <input
            type="date"
            className={inputCls}
            value={date}
            max={today()}
            onChange={(ev) => {
              setDate(ev.target.value);
              setError(null);
            }}
          />
        </Field>

        <Field
          label="Produção do dia (L)"
          hint="Um valor por dia, para a Fazenda inteira — some as ordenhas, se houver mais de uma."
        >
          <input
            className={inputCls}
            inputMode="decimal"
            placeholder="0,0"
            value={liters}
            onChange={(ev) => {
              setLiters(ev.target.value);
              setError(null);
            }}
          />
        </Field>

        {existing && (
          <div className="rounded-xl bg-review-100 text-review-700 text-sm px-3.5 py-3">
            Já existe Produção diária nesta data ({formatLiters(existing.liters)}).
            Para ajustar o valor, use "Corrigir" na lista — a correção pede um
            motivo e guarda o antes e o depois na auditoria.
          </div>
        )}

        {invalid && (
          <p className="text-sm text-danger-600">
            Valor inválido — use números, ex.: 348,5.
          </p>
        )}

        {error && (
          <p className="text-sm text-danger-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

export default function ProducaoTab() {
  const { state } = useFarm();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<CorrectionTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const days = lastNDays(14).reverse();

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-ink-soft">Últimos 14 dias — um valor por dia</p>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus size={16} /> Registrar produção
        </Button>
      </div>

      <SuccessNotice message={notice} onDismiss={() => setNotice(null)} />

      <Card className="divide-y divide-black/5">
        {days.map((day) => {
          const rec = productionFor(state, day);
          return (
            <div key={day} className="px-4 py-3 md:px-5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium capitalize">
                  {formatWeekday(day)}{" "}
                  <span className="text-ink-soft font-normal">
                    · {formatRelativeDay(day)}
                  </span>
                </p>
              </div>
              {rec ? (
                <>
                  <p className="tnum font-semibold">{formatLiters(rec.liters)}</p>
                  <button
                    onClick={() => setTarget({ kind: "producao", rec })}
                    className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink min-h-[44px] px-2 -mr-2"
                  >
                    <Pencil size={13} /> Corrigir
                  </button>
                </>
              ) : (
                <AbsentValue />
              )}
            </div>
          );
        })}
      </Card>

      {sheetOpen && (
        <ProductionSheet
          onClose={() => setSheetOpen(false)}
          onSaved={setNotice}
        />
      )}
      {target && (
        <CorrectSheet
          key={target.rec.id}
          target={target}
          onClose={() => setTarget(null)}
        />
      )}
    </div>
  );
}
