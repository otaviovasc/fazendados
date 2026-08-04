import L from "leaflet";
import { useEffect, useRef } from "react";
import type { LatLng } from "../../domain/types";
import { useFarm } from "../../state/store";
import {
  INSTALLATION_TYPE_LABEL,
  openOccupancyOfPasture,
  restingLabel,
} from "./space";
import "./mapa.css";

export type MapMode = "idle" | "draw" | "place";

const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OSM_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

// Cores alinhadas aos tokens do projeto (tailwind.config.js).
const PASTURE_500 = "#3E6B42";
const PASTURE_700 = "#264229";
const INK = "#1C1917";
const INK_FAINT = "#A8A29E";
const PAPER = "#FAF7F1";
const REVIEW_500 = "#B45309";

interface MapViewProps {
  mode: MapMode;
  drawPoints: LatLng[];
  placePoint: LatLng | null;
  onMapClick: (p: LatLng) => void;
  onPastureClick: (pastureId: string) => void;
}

export function MapView({
  mode,
  drawPoints,
  placePoint,
  onMapClick,
  onPastureClick,
}: MapViewProps) {
  const { state } = useFarm();

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dataLayersRef = useRef<L.LayerGroup | null>(null);
  const drawLayersRef = useRef<L.LayerGroup | null>(null);
  const pastureCountRef = useRef(-1);

  // Callbacks sempre frescos para os handlers registrados uma única vez.
  const handlersRef = useRef({ onMapClick, onPastureClick });
  handlersRef.current = { onMapClick, onPastureClick };

  // ---------- Criação do mapa (uma vez, com cleanup) ----------
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: true });
    mapRef.current = map;

    const satellite = L.tileLayer(SATELLITE_URL, {
      attribution: "Esri",
      maxZoom: 19,
    });
    const osm = L.tileLayer(OSM_URL, {
      attribution: "© OpenStreetMap",
      maxZoom: 19,
    });
    satellite.addTo(map);

    // Se o satélite falhar, cai para o OSM sem quebrar a UI.
    let fellBack = false;
    satellite.on("tileerror", () => {
      if (fellBack || !mapRef.current) return;
      fellBack = true;
      if (map.hasLayer(satellite)) map.removeLayer(satellite);
      osm.addTo(map);
    });

    L.control
      .layers({ "Satélite (Esri)": satellite, "Mapa (OSM)": osm })
      .addTo(map);

    dataLayersRef.current = L.layerGroup().addTo(map);
    drawLayersRef.current = L.layerGroup().addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      handlersRef.current.onMapClick([e.latlng.lat, e.latlng.lng]);
    });

    // Enquadramento inicial nos pastos.
    const pts = state.pastures.flatMap((p) => p.polygon);
    if (pts.length > 0) {
      map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] });
    } else {
      map.setView([-23.0185, -47.3125], 16);
    }
    pastureCountRef.current = state.pastures.length;

    const t = setTimeout(() => map.invalidateSize(), 0);

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      dataLayersRef.current = null;
      drawLayersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Camadas de dados (pastos + instalações) ----------
  useEffect(() => {
    const map = mapRef.current;
    const layers = dataLayersRef.current;
    if (!map || !layers) return;

    layers.clearLayers();

    for (const p of state.pastures) {
      const occ = openOccupancyOfPasture(state, p.id);
      const group = occ
        ? state.groups.find((g) => g.id === occ.groupId) ?? null
        : null;
      const occupied = group !== null;

      const poly = L.polygon(p.polygon, {
        color: occupied ? PASTURE_700 : INK_FAINT,
        weight: occupied ? 2 : 1.5,
        dashArray: occupied ? undefined : "5 4",
        fillColor: occupied ? PASTURE_500 : INK_FAINT,
        fillOpacity: occupied ? 0.4 : 0.12,
      });

      const label = occupied
        ? `${p.name} · ${group.name}`
        : `${p.name} · ${restingLabel(state, p.id)}`;
      poly.bindTooltip(label, {
        permanent: true,
        direction: "center",
        interactive: false,
        className: occupied ? "mapa-label" : "mapa-label mapa-label-rest",
      });

      poly.on("click", () => handlersRef.current.onPastureClick(p.id));
      poly.addTo(layers);
    }

    for (const inst of state.installations) {
      const marker = L.circleMarker(inst.point, {
        radius: 7,
        color: INK,
        weight: 2,
        fillColor: PAPER,
        fillOpacity: 1,
      });
      marker.bindTooltip(
        `${inst.name} · ${INSTALLATION_TYPE_LABEL[inst.type]}`,
        { direction: "top", offset: [0, -10] }
      );
      marker.addTo(layers);
    }

    // Novo pasto desenhado pode sair do enquadramento atual.
    if (pastureCountRef.current !== state.pastures.length) {
      pastureCountRef.current = state.pastures.length;
      const pts = state.pastures.flatMap((p) => p.polygon);
      if (pts.length > 0) {
        map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] });
      }
    }
  }, [state, state.pastures, state.installations, state.occupancies, state.groups]);

  // ---------- Camadas de desenho/posicionamento ----------
  useEffect(() => {
    const layers = drawLayersRef.current;
    if (!layers) return;
    layers.clearLayers();

    if (mode === "draw") {
      for (const pt of drawPoints) {
        L.circleMarker(pt, {
          radius: 5,
          color: PASTURE_700,
          weight: 2,
          fillColor: PASTURE_500,
          fillOpacity: 1,
        }).addTo(layers);
      }
      if (drawPoints.length >= 2) {
        L.polyline(drawPoints, {
          color: PASTURE_500,
          weight: 2,
          dashArray: "6 4",
        }).addTo(layers);
      }
      if (drawPoints.length >= 3) {
        L.polygon(drawPoints, {
          color: PASTURE_700,
          weight: 1,
          fillColor: PASTURE_500,
          fillOpacity: 0.2,
        }).addTo(layers);
      }
    }

    if (mode === "place" && placePoint) {
      L.circleMarker(placePoint, {
        radius: 9,
        color: INK,
        weight: 2,
        fillColor: REVIEW_500,
        fillOpacity: 1,
      }).addTo(layers);
    }
  }, [mode, drawPoints, placePoint]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[60vh] min-h-[380px] md:h-[66vh] bg-paper-sunken"
    />
  );
}
