import { useState } from "react";
import { Pencil, Plus, Truck } from "lucide-react";
import { useFarm } from "../../state/store";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Sheet,
  SuccessNotice,
  UnsavedFooter,
  inputCls,
  useUnsavedGuard,
} from "../../components/ui";
import { formatLiters, parseDecimal } from "../../lib/format";
import { formatRelativeDay, formatWeekday, today } from "../../lib/dates";
import { CorrectSheet, type CorrectionTarget } from "./CorrectSheet";

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function CollectionSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { state, dispatch } = useFarm();
  const [date, setDate] = useState(today());
  const [time, setTime] = useState(nowTime());
  const [liters, setLiters] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseDecimal(liters);
  const duplicates = state.collections.filter((c) => c.date === date);
  const guard = useUnsavedGuard(liters.trim() !== "", onClose);

  async function submit() {
    if (parsed === null || !time || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "RecordMilkCollection",
      date,
      time,
      liters: parsed,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onSaved(`Coleta registrada — ${formatLiters(parsed)} às ${time}`);
    onClose();
  }

  return (
    <Sheet
      open
      onClose={guard.requestClose}
      title="Registrar coleta"
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
              disabled={parsed === null || !time || busy}
              className="flex-1"
            >
              {busy ? "Registrando…" : "Registrar coleta"}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
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
          <Field label="Horário">
            <input
              type="time"
              className={inputCls}
              value={time}
              onChange={(ev) => setTime(ev.target.value)}
            />
          </Field>
        </div>

        <Field label="Volume coletado (L)">
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

        {duplicates.length > 0 && (
          <div className="rounded-xl bg-review-100 text-review-700 text-sm px-3.5 py-3">
            <p className="font-medium mb-1">Possível duplicata</p>
            <p>
              Já existe Coleta nesta data (
              {duplicates
                .map((c) => `${formatLiters(c.liters)} às ${c.time}`)
                .join(" · ")}
              ). Os Registros não são mesclados automaticamente — confira antes
              de confirmar.
            </p>
          </div>
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

export default function ColetaTab() {
  const { state } = useFarm();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [target, setTarget] = useState<CorrectionTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const collections = [...state.collections].sort((a, b) =>
    `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`)
  );

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-sm text-ink-soft">Coletas do laticínio</p>
        <Button onClick={() => setSheetOpen(true)}>
          <Plus size={16} /> Registrar coleta
        </Button>
      </div>

      <SuccessNotice message={notice} onDismiss={() => setNotice(null)} />

      {collections.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Truck size={28} />}
            title="Nenhuma coleta registrada"
            hint="Registre cada passagem do laticínio: data, horário e volume."
          />
        </Card>
      ) : (
        <Card className="divide-y divide-black/5">
          {collections.map((c) => (
            <div key={c.id} className="px-4 py-3 md:px-5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium capitalize">
                  {formatWeekday(c.date)}{" "}
                  <span className="text-ink-soft font-normal">
                    · {formatRelativeDay(c.date)}
                  </span>
                </p>
                <p className="text-sm text-ink-soft tnum">às {c.time}</p>
              </div>
              <p className="tnum font-semibold">{formatLiters(c.liters)}</p>
              <button
                onClick={() => setTarget({ kind: "coleta", rec: c })}
                className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink min-h-[44px] px-2 -mr-2"
              >
                <Pencil size={13} /> Corrigir
              </button>
            </div>
          ))}
        </Card>
      )}

      {sheetOpen && (
        <CollectionSheet onClose={() => setSheetOpen(false)} onSaved={setNotice} />
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
