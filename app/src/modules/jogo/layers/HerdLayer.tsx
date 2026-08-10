import { useMemo, type CSSProperties, type KeyboardEvent } from 'react';
import { boundingBox, centroid } from '../../../domain/game/geometry';
import { herdClusterLayout, herdGrazeMotion } from '../../../domain/game/herd-layout';
import { openOccupancyOfPasture } from '../../../domain/game/pasture-rest';
import type { GameProjection } from '../../../domain/game/projection';
import type { FarmState, HerdGroup, Pasture, PastureOccupancy } from '../../../domain/types';
import { animalsInGroup } from '../../../state/store';
import { CowSprite } from '../sprites/CowSprite';
import { gameTokens } from '../tokens';

export type HerdCluster = {
  group: HerdGroup;
  occupancy: PastureOccupancy;
  animalCount: number;
};

/**
 * Rebanho por pasto: o Lote da ocupação aberta (regra 1:1) vira até
 * `herdClusterCap` vacas posicionadas deterministicamente (seed = id do Lote)
 * + badge com a contagem real (derivada das lotações abertas). Cada cluster é
 * um botão SVG de verdade (Enter/Espaço abrem a folha do pasto); o click é
 * suprimido quando o gesto foi arrasto (`didDrag`).
 */
export function HerdLayer({ state, projection, onSelect, didDrag }: {
  state: FarmState;
  projection: GameProjection;
  onSelect?: (cluster: HerdCluster) => void;
  /** true quando o último gesto foi arrasto (pan) — o click é suprimido. */
  didDrag?: () => boolean;
}) {
  const { colors, herdClusterCap, motion } = gameTokens;
  const clusters = useMemo(() => {
    const groupById = new Map(state.groups.map((group) => [group.id, group]));
    return state.pastures.flatMap((pasture: Pasture) => {
      const occupancy = openOccupancyOfPasture(pasture.id, state.occupancies);
      if (!occupancy) return [];
      const group = groupById.get(occupancy.groupId);
      if (!group) return [];
      const animalCount = animalsInGroup(state, group.id).length;
      if (animalCount <= 0) return [];
      const projected = pasture.polygon.map(projection.toLocal);
      const positions = herdClusterLayout(projected, animalCount, group.id, herdClusterCap);
      const graze = herdGrazeMotion(group.id, positions.length, 12, motion.grazeMinMs, motion.grazeMaxMs);
      const box = boundingBox(projected);
      const badgeAnchor = { x: centroid(projected).x, y: box.minY + 14 };
      // Hit-area só sobre o miolo do rebanho (não o pasto todo): o clique nos
      // vãos entre as vacas não pode vazar para o pasto, e o resto do pasto
      // continua livre para o pan da câmera.
      const herdBox = boundingBox(positions);
      const hitArea = {
        x: herdBox.minX - 18,
        y: herdBox.minY - 18,
        width: herdBox.maxX - herdBox.minX + 36,
        height: herdBox.maxY - herdBox.minY + 36,
      };
      const cluster: HerdCluster = { group, occupancy, animalCount };
      return [{ cluster, positions, graze, badgeAnchor, hitArea }];
    });
  }, [state, projection, herdClusterCap, motion]);

  function activate(event: KeyboardEvent, cluster: HerdCluster) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect?.(cluster);
    }
  }

  return <g>
    {clusters.map(({ cluster, positions, graze, badgeAnchor, hitArea }) => <g
      key={cluster.group.id}
      data-testid={`herd-cluster-${cluster.group.id}`}
      role="button"
      tabIndex={0}
      aria-label={`${cluster.group.name}: ${cluster.animalCount} animais — abrir folha do pasto`}
      className="game-installation"
      onClick={() => { if (!didDrag?.()) onSelect?.(cluster); }}
      onKeyDown={(event) => activate(event, cluster)}
    >
      <rect x={hitArea.x} y={hitArea.y} width={hitArea.width} height={hitArea.height} rx="18" fill="transparent" />
      {positions.map((point, index) => {
        const motionVars = graze[index];
        return <g
          key={index}
          className="game-cow"
          data-grazing
          style={{
            '--cow-dx': `${motionVars.dx}px`,
            '--cow-dy': `${motionVars.dy}px`,
            '--cow-dur': `${motionVars.durationMs}ms`,
            '--cow-delay': `${motionVars.delayMs}ms`,
          } as CSSProperties}
        >
          <CowSprite x={point.x} y={point.y} size={24} flip={index % 2 === 1} />
        </g>;
      })}
      <g data-testid={`herd-count-${cluster.group.id}`} transform={`translate(${badgeAnchor.x} ${badgeAnchor.y})`} pointerEvents="none">
        <rect x="-26" y="-12" width="52" height="24" rx="12" fill="#fffef9" stroke={colors.meadowEdge} strokeWidth="1" />
        <text className="game-badge-text" y="1">{cluster.animalCount} 🐄</text>
      </g>
    </g>)}
  </g>;
}
