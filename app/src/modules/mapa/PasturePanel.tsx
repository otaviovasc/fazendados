import { X } from "lucide-react";
import { Card, Chip, SectionTitle } from "../../components/ui";
import { formatDay, formatLong } from "../../lib/dates";
import { animalsInGroup, useFarm } from "../../state/store";
import {
  occupanciesOfPasture,
  openOccupancyOfPasture,
  restingLabel,
} from "./space";

interface PasturePanelProps {
  pastureId: string;
  onClose: () => void;
}

/** Painel de detalhe do pasto: ocupação atual e histórico datado. */
export function PasturePanel({ pastureId, onClose }: PasturePanelProps) {
  const { state } = useFarm();
  const pasture = state.pastures.find((p) => p.id === pastureId);
  if (!pasture) return null;

  const occ = openOccupancyOfPasture(state, pastureId);
  const group = occ
    ? state.groups.find((g) => g.id === occ.groupId) ?? null
    : null;
  const animalCount = group ? animalsInGroup(state, group.id).length : 0;
  const history = occupanciesOfPasture(state, pastureId);

  const groupName = (groupId: string) =>
    state.groups.find((g) => g.id === groupId)?.name ?? "Lote";

  return (
    <Card className="absolute inset-x-2 bottom-2 md:inset-x-auto md:right-3 md:top-3 md:bottom-auto md:w-80 z-[600] max-h-[55%] md:max-h-[calc(100%-1.5rem)] overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="font-semibold leading-tight">{pasture.name}</h3>
          <div className="mt-1.5">
            {group ? (
              <Chip tone="registro">Ocupado</Chip>
            ) : (
              <Chip tone="neutro">Em descanso</Chip>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 -m-1 text-ink-soft"
          aria-label="Fechar detalhes do pasto"
        >
          <X size={18} />
        </button>
      </div>

      <SectionTitle>Ocupação atual</SectionTitle>
      {group && occ ? (
        <div className="text-sm">
          <p className="font-medium">
            {group.name}
            <span className="text-ink-soft font-normal">
              {" "}
              · {animalCount} {animalCount === 1 ? "animal" : "animais"}
            </span>
          </p>
          <p className="text-ink-soft mt-0.5">desde {formatLong(occ.start)}</p>
        </div>
      ) : (
        <p className="text-sm text-ink-soft">{restingLabel(state, pastureId)}</p>
      )}

      <div className="mt-4">
        <SectionTitle>Histórico de ocupação</SectionTitle>
        {history.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Nenhuma ocupação registrada neste pasto.
          </p>
        ) : (
          <ul className="divide-y divide-black/5">
            {history.map((o) => (
              <li
                key={o.id}
                className="py-2 flex items-center justify-between gap-2 text-sm"
              >
                <span className="font-medium">{groupName(o.groupId)}</span>
                <span className="text-ink-soft tnum shrink-0">
                  {formatDay(o.start)} – {o.end ? formatDay(o.end) : "atual"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
