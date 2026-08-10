import { useMemo, type KeyboardEvent } from 'react';
import { centroid, pointInPolygon, spacedPointsAlongRing } from '../../../domain/game/geometry';
import { herdClusterLayout } from '../../../domain/game/herd-layout';
import { pastureBucket, type PastureVisual } from '../../../domain/game/pasture-rest';
import { toPathData, type GameProjection } from '../../../domain/game/projection';
import type { FarmBoundary, Pasture, PastureOccupancy } from '../../../domain/types';
import { TreeSprite } from '../sprites/TreeSprite';
import { gameTokens, useBoardColors, type Season } from '../tokens';

/**
 * Perímetro (diorama gramado com cerca de mourões) + pastos cercados. O chão
 * INTEIRO da fazenda é grama (gradiente `game-ground-grass` + tufos) — os
 * pastos são recortes tingidos pelo estado do pastejo (`pastureBucket` a
 * partir das ocupações): OCUPADO marronheia com os dias de pastejo, LIVRE
 * esverdeia com os dias de descanso. Perímetro e pastos seguem EXATAMENTE os
 * pontos traçados (sem arredondar). Tocar num pasto abre a folha do pasto; o
 * pointerdown propaga para o pan da câmera e o click é suprimido quando o
 * gesto foi arrasto (`didDrag`). Árvores decorativas nascem
 * deterministicamente no chão livre.
 */

/** Estado do pasto em texto, para o aria-label do botão. */
function pastureStateLabel(visual: PastureVisual): string {
  if (visual.state === 'occupied') {
    return `em pastejo há ${visual.days} ${visual.days === 1 ? 'dia' : 'dias'}`;
  }
  if (visual.state === 'resting') {
    if (visual.days === 0) return 'em descanso desde hoje';
    return `em descanso há ${visual.days} ${visual.days === 1 ? 'dia' : 'dias'}`;
  }
  return 'sem ocupação registrada';
}
export function ZoneLayer({ boundary, pastures, occupancies, projection, season, now, onSelectPasture, didDrag }: {
  boundary: FarmBoundary;
  pastures: Pasture[];
  occupancies: PastureOccupancy[];
  projection: GameProjection;
  season: Season;
  now: Date;
  onSelectPasture?: (pasture: Pasture) => void;
  /** true quando o último gesto foi arrasto (pan) — o click é suprimido. */
  didDrag?: () => boolean;
}) {
  const colors = useBoardColors();

  const perimeterProjected = useMemo(
    () => boundary.polygon.map(projection.toLocal),
    [boundary, projection],
  );
  const perimeterPath = useMemo(
    () => (perimeterProjected.length ? toPathData(perimeterProjected) : ''),
    [perimeterProjected],
  );
  const fencePosts = useMemo(
    () => spacedPointsAlongRing(perimeterProjected, gameTokens.fence.postSpacing),
    [perimeterProjected],
  );

  const pastureShapes = useMemo(() => pastures.map((pasture) => {
    const projected = pasture.polygon.map(projection.toLocal);
    const visual = pastureBucket(pasture.id, occupancies, now);
    return {
      pasture,
      projected,
      path: toPathData(projected),
      label: centroid(projected),
      posts: spacedPointsAlongRing(projected, gameTokens.fence.pasturePostSpacing),
      visual,
    };
  }), [pastures, occupancies, projection, now]);

  // Árvores decorativas: determinísticas, no chão da fazenda e fora dos pastos.
  const trees = useMemo(() => {
    if (!perimeterProjected.length) return [];
    return herdClusterLayout(perimeterProjected, 7, 'game-trees', 7)
      .filter((point) => !pastureShapes.some((shape) => pointInPolygon(point, shape.projected)));
  }, [perimeterProjected, pastureShapes]);

  function activatePasture(event: KeyboardEvent, pasture: Pasture) {
    if (!onSelectPasture) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelectPasture(pasture);
    }
  }

  return <g>
    <g filter="url(#game-diorama)">
      <path d={perimeterPath} fill="url(#game-ground-grass)" data-testid={`game-zone-${boundary.id}`} role="img" aria-label={`Perímetro: ${boundary.name}`} />
    </g>
    <path d={perimeterPath} fill="url(#game-grass)" pointerEvents="none" />
    {/* Cerca do perímetro: faixa de terra batida + dois trilhos + mourões. */}
    <g data-testid="game-fence" data-post-count={fencePosts.length} pointerEvents="none">
      <path d={perimeterPath} fill="none" stroke={colors.dirt} strokeWidth="7" strokeLinejoin="round" opacity="0.7" />
      <path d={perimeterPath} fill="none" stroke={colors.wood} strokeWidth="1.7" strokeLinejoin="round" opacity="0.9" />
      <path d={perimeterPath} fill="none" stroke={colors.wood} strokeWidth="1.2" strokeDasharray="9 7" strokeLinejoin="round" opacity="0.65" />
      {fencePosts.map((post, index) => <g key={index} transform={`translate(${post.x.toFixed(2)} ${post.y.toFixed(2)})`}>
        <circle r={gameTokens.fence.postRadius} fill={colors.wood} />
        <circle r={gameTokens.fence.postRadius * 0.45} fill={colors.woodDark} />
      </g>)}
    </g>
    {pastureShapes.map(({ pasture, path, label, posts, visual }) => <g
      key={pasture.id}
      role="button"
      tabIndex={0}
      aria-label={`Pasto: ${pasture.name} — ${pastureStateLabel(visual)} — abrir a folha do pasto`}
      className="game-installation"
      onClick={() => { if (!didDrag?.()) onSelectPasture?.(pasture); }}
      onKeyDown={(event) => activatePasture(event, pasture)}
    >
      <path
        d={path}
        fill={`url(#game-pasture-${visual.state === 'occupied' ? 'occupied' : 'resting'}-${visual.bucket})`}
        data-rest-days={visual.days ?? undefined}
        data-testid={`game-zone-${pasture.id}`}
      />
      <path d={path} fill="url(#game-grass)" pointerEvents="none" />
      {/* A mesma cerca da fazenda, em madeira mais clara, sobre o traçado exato. */}
      <g data-testid={`game-fence-pasture-${pasture.id}`} data-post-count={posts.length} pointerEvents="none">
        <path d={path} fill="none" stroke={colors.woodLight} strokeWidth="1.4" strokeLinejoin="round" opacity="0.95" />
        <path d={path} fill="none" stroke={colors.woodLight} strokeWidth="1" strokeDasharray="8 6" strokeLinejoin="round" opacity="0.6" />
        {posts.map((post, index) => <g key={index} transform={`translate(${post.x.toFixed(2)} ${post.y.toFixed(2)})`}>
          <circle r={gameTokens.fence.pasturePostRadius} fill={colors.woodLight} />
          <circle r={gameTokens.fence.pasturePostRadius * 0.45} fill={colors.woodLightDark} />
        </g>)}
      </g>
      <text className="game-zone-label" x={label.x} y={label.y} data-testid={`game-zone-label-${pasture.id}`} pointerEvents="none">{pasture.name}</text>
    </g>)}
    {trees.map((point, index) => <TreeSprite key={index} x={point.x} y={point.y} size={index % 2 === 0 ? 34 : 26} season={season} />)}
  </g>;
}
