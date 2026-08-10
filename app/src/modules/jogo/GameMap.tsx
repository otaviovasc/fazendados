import { useMemo } from 'react';
import { openOccupancyOfPasture } from '../../domain/game/pasture-rest';
import { createProjection } from '../../domain/game/projection';
import type { FarmState, Installation, Pasture, PastureOccupancy } from '../../domain/types';
import { GameDefs } from './GameDefs';
import { HerdLayer } from './layers/HerdLayer';
import { InstallationLayer } from './layers/InstallationLayer';
import { ZoneLayer } from './layers/ZoneLayer';
import { gameTokens, type Season } from './tokens';
import { useMapCamera } from './useMapCamera';

/**
 * O tabuleiro: SVG com viewBox derivado do perímetro real, câmera pan/zoom num
 * único <g> e camadas puras por cima (zonas, rebanho, instalações). Tudo vem
 * do estado global da Fazenda — o jogo é uma leitura do domínio, não um estado
 * paralelo.
 */
export function GameMap({ state, season, onSelectPasture, onSelectInstallation }: {
  state: FarmState;
  season: Season;
  onSelectPasture?: (pasture: Pasture, occupancy: PastureOccupancy | null) => void;
  onSelectInstallation?: (installation: Installation) => void;
}) {
  const boundary = state.farmBoundary;
  const projection = useMemo(
    () => (boundary ? createProjection(boundary.polygon, gameTokens.viewBoxWidth) : null),
    [boundary],
  );
  const camera = useMapCamera(projection?.width ?? gameTokens.viewBoxWidth, projection?.height ?? gameTokens.viewBoxWidth);
  // Um relógio por render: as faixas de descanso de todos os pastos usam o
  // mesmo "agora" e nunca divergem entre si; recalculado a cada render para
  // não congelar o descanso em sessões longas.
  const now = new Date();
  if (!projection || !boundary) return null;

  return <div className="relative h-full w-full">
    <svg
      className="game-map"
      viewBox={`0 0 ${projection.width} ${projection.height.toFixed(2)}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Tabuleiro da fazenda"
      {...camera.handlers}
    >
      <GameDefs season={season} />
      <g data-testid="game-camera" transform={camera.transform}>
        <ZoneLayer
          boundary={boundary}
          pastures={state.pastures}
          occupancies={state.occupancies}
          projection={projection}
          season={season}
          now={now}
          didDrag={camera.didDrag}
          onSelectPasture={(pasture) => {
            onSelectPasture?.(pasture, openOccupancyOfPasture(pasture.id, state.occupancies));
          }}
        />
        <HerdLayer state={state} projection={projection} didDrag={camera.didDrag} onSelect={(cluster) => {
          const pasture = state.pastures.find((p) => p.id === cluster.occupancy.pastureId);
          if (pasture) onSelectPasture?.(pasture, cluster.occupancy);
        }} />
        <InstallationLayer installations={state.installations} projection={projection} didDrag={camera.didDrag} onSelect={(installation) => onSelectInstallation?.(installation)} />
      </g>
    </svg>
    <div className="game-zoom-controls">
      <button type="button" className="game-zoom-button" aria-label="Aproximar" onClick={camera.zoomIn}>+</button>
      <button type="button" className="game-zoom-button" aria-label="Afastar" onClick={camera.zoomOut}>−</button>
      <button type="button" className="game-zoom-button" aria-label="Centralizar" onClick={camera.reset}>⌂</button>
    </div>
  </div>;
}
