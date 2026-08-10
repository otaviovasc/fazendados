import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Button, Field, InlineError, inputCls, rowCls, Sheet } from "../../components/ui";
import type { FarmState, Pasture, PastureOccupancy } from "../../domain/types";
import { today } from "../../lib/dates";
import { animalsInGroup, pastureOfGroup, useFarm } from "../../state/store";
import { daysSinceLastOccupancy, openOccupancyOfPasture, restLabel, suggestedPasture } from "../../domain/game/pasture-rest";
import { useGameAudio } from "./audio/useGameAudio";

/** Dias de descanso do pasto no estado atual; null = nunca pastejado. */
const restDays = (s: FarmState, pastureId: string): number | null =>
  daysSinceLastOccupancy(pastureId, s.occupancies);

type View = "view" | "pick" | "confirm";

interface MoveDraft {
  groupId: string;
  pastureId: string;
}

/**
 * Folha do Pasto no jogo: mostra lote atual (ou descanso) e conduz a rotação.
 * Reusa o comando MoveHerdGroup do mapa utilitário — a regra 1:1 é enforced
 * no servidor via pasture_occupancies e o apply atualiza o estado.
 */
export function PastureSheet({
  pasture,
  occupancy,
  onClose,
}: {
  pasture: Pasture;
  occupancy: PastureOccupancy | null;
  onClose: () => void;
}) {
  const { state, dispatch } = useFarm();
  const { play } = useGameAudio();
  const [view, setView] = useState<View>("view");
  const [draft, setDraft] = useState<MoveDraft | null>(null);
  const [date, setDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupOfOccupancy = occupancy
    ? state.groups.find((g) => g.id === occupancy.groupId) ?? null
    : null;
  const animalCount = occupancy ? animalsInGroup(state, occupancy.groupId).length : 0;

  // Pasto livre → "Mover lote para cá": lotes que ainda não estão aqui.
  const bringCandidates = state.groups
    .filter((g) => g.id !== occupancy?.groupId)
    .map((g) => ({ group: g, current: pastureOfGroup(state, g.id) }));

  // Pasto ocupado → "Mover este lote para...": pastos livres, maior descanso primeiro.
  const suggested = occupancy ? suggestedPasture(state.pastures, state.occupancies) : null;
  const sendDestinations = state.pastures
    .filter((p) => p.id !== pasture.id && openOccupancyOfPasture(p.id, state.occupancies) === null)
    .map((p) => ({ pasture: p, rest: restDays(state, p.id) }))
    .sort((a, b) => (b.rest ?? Number.POSITIVE_INFINITY) - (a.rest ?? Number.POSITIVE_INFINITY));

  const draftGroup = draft ? state.groups.find((g) => g.id === draft.groupId) : null;
  const draftPasture = draft ? state.pastures.find((p) => p.id === draft.pastureId) : null;

  const startPick = () => {
    play("click");
    setError(null);
    setView("pick");
  };

  const confirmMove = async () => {
    if (!draft || busy || date === "") return;
    setBusy(true);
    setError(null);
    const outcome = await dispatch({
      type: "MoveHerdGroup",
      groupId: draft.groupId,
      pastureId: draft.pastureId,
      date,
    });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    play("click");
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={pasture.name}>
      <div className="space-y-5">
        {error && <InlineError>{error}</InlineError>}

        {view === "view" && (
          <>
            <div className="rounded-2xl border border-ink/5 bg-paper-sunken px-4 py-3">
              {occupancy && groupOfOccupancy ? (
                <p className="text-sm">
                  <span className="font-medium">{groupOfOccupancy.name}</span>{" "}
                  <span className="text-ink-soft">
                    · {animalCount} {animalCount === 1 ? "animal" : "animais"}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-ink-soft">
                  Pasto livre — {restLabel(restDays(state, pasture.id))}
                </p>
              )}
            </div>

            <div className="space-y-2">
              {occupancy && groupOfOccupancy && (
                <button
                  type="button"
                  onClick={startPick}
                  className="w-full flex items-center gap-3 rounded-xl border border-ink/10 bg-paper-card px-3.5 py-3 text-left min-h-[44px] transition hover:border-pasture-200"
                >
                  <ArrowRightLeft size={20} className="text-pasture-600 shrink-0" />
                  <span>
                    <span className="block font-medium">Mover este lote para…</span>
                    <span className="block text-sm text-ink-soft">
                      {groupOfOccupancy.name} vai para outro pasto, com confirmação.
                    </span>
                  </span>
                </button>
              )}
              {!occupancy && (
                <button
                  type="button"
                  onClick={startPick}
                  className="w-full flex items-center gap-3 rounded-xl border border-ink/10 bg-paper-card px-3.5 py-3 text-left min-h-[44px] transition hover:border-pasture-200"
                >
                  <ArrowRightLeft size={20} className="text-pasture-600 shrink-0" />
                  <span>
                    <span className="block font-medium">Mover lote para cá</span>
                    <span className="block text-sm text-ink-soft">
                      Escolha o lote que passa a ocupar este pasto.
                    </span>
                  </span>
                </button>
              )}
            </div>
          </>
        )}

        {view === "pick" && occupancy && (
          <Field label={`Para onde vai ${groupOfOccupancy?.name ?? "o lote"}?`}>
            <div className="space-y-2">
              {sendDestinations.map(({ pasture: dest, rest }) => (
                <button
                  key={dest.id}
                  type="button"
                  onClick={() => {
                    play("click");
                    setDraft({ groupId: occupancy.groupId, pastureId: dest.id });
                    setDate(today());
                    setView("confirm");
                  }}
                  className={rowCls(false, false)}
                >
                  <span className="font-medium">
                    {dest.name}
                    {suggested?.id === dest.id && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-pasture-100 text-pasture-700 px-2 py-0.5 text-xs font-medium">
                        sugerido
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-ink-soft text-right">{restLabel(rest)}</span>
                </button>
              ))}
              {sendDestinations.length === 0 && (
                <p className="text-sm text-ink-soft">Nenhum outro pasto livre no momento.</p>
              )}
            </div>
          </Field>
        )}

        {view === "pick" && !occupancy && (
          <Field label={`Qual lote vem para ${pasture.name}?`}>
            <div className="space-y-2">
              {bringCandidates.map(({ group, current }) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    play("click");
                    setDraft({ groupId: group.id, pastureId: pasture.id });
                    setDate(today());
                    setView("confirm");
                  }}
                  className={rowCls(false, false)}
                >
                  <span className="font-medium">{group.name}</span>
                  <span className="text-sm text-ink-soft">
                    {current ? `hoje em ${current.name}` : "sem pasto"}
                  </span>
                </button>
              ))}
              {bringCandidates.length === 0 && (
                <p className="text-sm text-ink-soft">Nenhum lote disponível.</p>
              )}
            </div>
          </Field>
        )}

        {view === "pick" && (
          <Button variant="ghost" className="w-full" onClick={() => setView("view")}>
            Voltar
          </Button>
        )}

        {view === "confirm" && draft && draftGroup && draftPasture && (
          <>
            <p className="text-sm bg-pasture-50 border border-pasture-100 rounded-xl px-3.5 py-3">
              <span className="font-medium">{draftGroup.name}</span> vai para{" "}
              <span className="font-medium">{draftPasture.name}</span>
              {date === today() ? " hoje" : ` em ${date}`}. A ocupação atual é
              encerrada e o descanso começa a contar.
            </p>
            <Field label="Data da movimentação">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </Field>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setView("pick")}>
                Voltar
              </Button>
              <Button
                className="flex-1"
                disabled={busy || date === ""}
                onClick={confirmMove}
              >
                {busy ? "Movendo…" : "Confirmar movimentação"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
