import { useEffect, useState } from "react";
import { Button, Field, InlineError, inputCls, Sheet } from "../../components/ui";
import { today } from "../../lib/dates";
import { pastureOfGroup, useFarm } from "../../state/store";
import { openOccupancyOfPasture, restingLabel } from "./space";

interface MoveSheetProps {
  open: boolean;
  onClose: () => void;
}

const rowCls = (selected: boolean, disabled: boolean) =>
  `w-full flex items-center justify-between gap-2 rounded-xl border px-3.5 py-3 text-left min-h-[44px] transition ${
    disabled
      ? "border-black/5 bg-paper-sunken opacity-60"
      : selected
        ? "border-pasture-500 bg-pasture-50 ring-1 ring-pasture-500"
        : "border-black/10 bg-white hover:border-pasture-200"
  }`;

/** Sheet "Mover Lote": escolhe Lote, Pasto de destino e data (regra 1:1). */
export function MoveSheet({ open, onClose }: MoveSheetProps) {
  const { state, dispatch } = useFarm();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [pastureId, setPastureId] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setGroupId(null);
      setPastureId(null);
      setDate(today());
      setError(null);
    }
  }, [open]);

  const groupName = (id: string) =>
    state.groups.find((g) => g.id === id)?.name ?? "Lote";

  const destOcc = pastureId ? openOccupancyOfPasture(state, pastureId) : null;
  const blockedByOther = destOcc !== null && destOcc.groupId !== groupId;
  const samePasture = destOcc !== null && destOcc.groupId === groupId;
  const canSubmit =
    groupId !== null && pastureId !== null && date !== "" && !blockedByOther && !samePasture;

  const submit = async () => {
    if (!canSubmit || !groupId || !pastureId || busy) return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({ type: "MoveHerdGroup", groupId, pastureId, date });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Mover Lote"
      footer={
        <Button className="w-full" disabled={!canSubmit || busy} onClick={submit}>
          {busy ? "Movendo…" : "Confirmar movimentação"}
        </Button>
      }
    >
      <div className="space-y-5">
        {error && <InlineError>{error}</InlineError>}
        <Field label="Lote">
          <div className="space-y-2">
            {state.groups.map((g) => {
              const current = pastureOfGroup(state, g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroupId(g.id)}
                  className={rowCls(groupId === g.id, false)}
                >
                  <span className="font-medium">{g.name}</span>
                  <span className="text-sm text-ink-soft">
                    {current ? current.name : "sem pasto"}
                  </span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field
          label="Pasto de destino"
          hint="Cada pasto recebe um lote por vez. Pastos ocupados ficam bloqueados até o lote atual sair."
        >
          <div className="space-y-2">
            {state.pastures.map((p) => {
              const occ = openOccupancyOfPasture(state, p.id);
              const isCurrentOfSelected = occ !== null && occ.groupId === groupId;
              const occupiedByOther = occ !== null && occ.groupId !== groupId;
              const disabled = isCurrentOfSelected || occupiedByOther;
              const status = isCurrentOfSelected
                ? "ocupação atual deste lote"
                : occupiedByOther
                  ? `ocupado pelo ${groupName(occ.groupId)}`
                  : restingLabel(state, p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPastureId(p.id)}
                  className={rowCls(pastureId === p.id, disabled)}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-sm text-ink-soft text-right">{status}</span>
                </button>
              );
            })}
          </div>
        </Field>

        {blockedByOther && pastureId && (
          <p className="text-sm text-danger-600 bg-danger-100 rounded-xl px-3.5 py-3">
            Este pasto está ocupado pelo {groupName(destOcc.groupId)}. Para usar
            este pasto, mova antes o lote que está nele.
          </p>
        )}

        <Field label="Data da movimentação">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
    </Sheet>
  );
}
