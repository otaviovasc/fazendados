import { useState } from "react";
import { ArrowRightLeft, MapPin, Pencil, Undo2 } from "lucide-react";
import { Button, Field, inputCls, PageHeader, Sheet } from "../../components/ui";
import type { InstallationType, LatLng } from "../../domain/types";
import { useFarm } from "../../state/store";
import { MapView, type MapMode } from "./MapView";
import { MoveSheet } from "./MoveSheet";
import { PasturePanel } from "./PasturePanel";
import { INSTALLATION_TYPE_LABEL } from "./space";

export default function MapaPage() {
  const { state, dispatch } = useFarm();

  const [mode, setMode] = useState<MapMode>("idle");
  const [drawPoints, setDrawPoints] = useState<LatLng[]>([]);
  const [placePoint, setPlacePoint] = useState<LatLng | null>(null);
  const [selectedPastureId, setSelectedPastureId] = useState<string | null>(null);

  const [moveOpen, setMoveOpen] = useState(false);

  const [savePastureOpen, setSavePastureOpen] = useState(false);
  const [pastureName, setPastureName] = useState("");

  const [instSheetOpen, setInstSheetOpen] = useState(false);
  const [instName, setInstName] = useState("");
  const [instType, setInstType] = useState<InstallationType>("curral");

  const [saving, setSaving] = useState(false);

  // ---------- Interações do mapa ----------

  const handleMapClick = (p: LatLng) => {
    if (mode === "draw") {
      setDrawPoints((pts) => [...pts, p]);
    } else if (mode === "place") {
      setPlacePoint(p);
      setInstSheetOpen(true);
    }
  };

  const handlePastureClick = (pastureId: string) => {
    if (mode !== "idle") return; // desenho/posicionamento suprimem o painel
    setSelectedPastureId(pastureId);
  };

  // ---------- Modos ----------

  const startDraw = () => {
    setSelectedPastureId(null);
    setDrawPoints([]);
    setMode("draw");
  };

  const cancelDraw = () => {
    setDrawPoints([]);
    setMode("idle");
  };

  const openSavePasture = () => {
    setPastureName(`Pasto ${state.pastures.length + 1}`);
    setSavePastureOpen(true);
  };

  const savePasture = async () => {
    const name = pastureName.trim();
    if (!name || drawPoints.length < 3 || saving) return;
    setSaving(true);
    const outcome = await dispatch({ type: "RegisterPasture", name, polygon: drawPoints });
    setSaving(false);
    if (!outcome.ok) return; // erro visível no aviso global
    setSavePastureOpen(false);
    setPastureName("");
    cancelDraw();
  };

  const startPlace = () => {
    setSelectedPastureId(null);
    setPlacePoint(null);
    setInstName("");
    setInstType("curral");
    setMode("place");
  };

  const cancelPlace = () => {
    setPlacePoint(null);
    setInstSheetOpen(false);
    setMode("idle");
  };

  const saveInstallation = async () => {
    const name = instName.trim();
    if (!name || !placePoint || saving) return;
    setSaving(true);
    const outcome = await dispatch({
      type: "RegisterInstallation",
      name,
      instType,
      point: placePoint,
    });
    setSaving(false);
    if (!outcome.ok) return; // erro visível no aviso global
    setInstSheetOpen(false);
    cancelPlace();
  };

  // ---------- Render ----------

  return (
    <div>
      <PageHeader
        title="Mapa"
        subtitle="Pastos, lotes e instalações da fazenda"
      />

      <div className="flex flex-wrap justify-end gap-2 mb-3">
        <Button
          variant="secondary"
          onClick={() => setMoveOpen(true)}
          disabled={mode !== "idle"}
        >
          <ArrowRightLeft size={16} />
          Mover Lote
        </Button>
        <Button variant="secondary" onClick={startDraw} disabled={mode !== "idle"}>
          <Pencil size={16} />
          Desenhar Pasto
        </Button>
        <Button variant="secondary" onClick={startPlace} disabled={mode !== "idle"}>
          <MapPin size={16} />
          Nova Instalação
        </Button>
      </div>

      <div className="relative rounded-2xl overflow-hidden border border-black/5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <MapView
          mode={mode}
          drawPoints={drawPoints}
          placePoint={placePoint}
          onMapClick={handleMapClick}
          onPastureClick={handlePastureClick}
        />

        {mode !== "idle" && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[600] max-w-[calc(100%-1.5rem)]">
            <p className="bg-ink text-white text-sm font-medium rounded-full px-4 py-2 shadow-lg text-center">
              {mode === "draw"
                ? `Desenhando pasto — toque no mapa para adicionar pontos (${drawPoints.length})`
                : "Toque no mapa para posicionar a instalação"}
            </p>
          </div>
        )}

        {mode === "draw" && (
          <div className="absolute bottom-3 inset-x-3 z-[600] flex flex-wrap justify-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setDrawPoints((pts) => pts.slice(0, -1))}
              disabled={drawPoints.length === 0}
            >
              <Undo2 size={16} />
              Desfazer ponto
            </Button>
            <Button variant="ghost" className="bg-paper-card" onClick={cancelDraw}>
              Cancelar
            </Button>
            <Button onClick={openSavePasture} disabled={drawPoints.length < 3}>
              Salvar
            </Button>
          </div>
        )}

        {mode === "place" && (
          <div className="absolute bottom-3 inset-x-3 z-[600] flex justify-center">
            <Button variant="ghost" className="bg-paper-card" onClick={cancelPlace}>
              Cancelar
            </Button>
          </div>
        )}

        {mode === "idle" && selectedPastureId && (
          <PasturePanel
            pastureId={selectedPastureId}
            onClose={() => setSelectedPastureId(null)}
          />
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-pasture-500/60 border border-pasture-700" />
          Lote em pastejo
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm border border-dashed border-ink-faint bg-ink-faint/20" />
          Pasto em descanso
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full border-2 border-ink bg-paper" />
          Instalação
        </span>
      </div>

      <MoveSheet open={moveOpen} onClose={() => setMoveOpen(false)} />

      <Sheet
        open={savePastureOpen}
        onClose={() => setSavePastureOpen(false)}
        title="Novo pasto"
        footer={
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setSavePastureOpen(false)}
            >
              Voltar
            </Button>
            <Button
              className="flex-1"
              disabled={!pastureName.trim() || saving}
              onClick={savePasture}
            >
              {saving ? "Salvando…" : "Salvar pasto"}
            </Button>
          </div>
        }
      >
        <Field
          label="Nome do pasto"
          hint={`${drawPoints.length} pontos desenhados no mapa.`}
        >
          <input
            value={pastureName}
            onChange={(e) => setPastureName(e.target.value)}
            className={inputCls}
            placeholder="Ex.: Pasto do Mangueirão"
            autoFocus
          />
        </Field>
      </Sheet>

      <Sheet
        open={instSheetOpen}
        onClose={() => {
          setInstSheetOpen(false);
          setPlacePoint(null);
        }}
        title="Nova instalação"
        footer={
          <Button
            className="w-full"
            disabled={!instName.trim() || saving}
            onClick={saveInstallation}
          >
            {saving ? "Salvando…" : "Salvar instalação"}
          </Button>
        }
      >
        <div className="space-y-4">
          <Field label="Nome da instalação">
            <input
              value={instName}
              onChange={(e) => setInstName(e.target.value)}
              className={inputCls}
              placeholder="Ex.: Cocho do Fundão"
              autoFocus
            />
          </Field>
          <Field label="Tipo">
            <select
              value={instType}
              onChange={(e) => setInstType(e.target.value as InstallationType)}
              className={inputCls}
            >
              {(Object.keys(INSTALLATION_TYPE_LABEL) as InstallationType[]).map(
                (t) => (
                  <option key={t} value={t}>
                    {INSTALLATION_TYPE_LABEL[t]}
                  </option>
                )
              )}
            </select>
          </Field>
        </div>
      </Sheet>
    </div>
  );
}
