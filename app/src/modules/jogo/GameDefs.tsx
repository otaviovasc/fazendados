import type { Season } from './tokens';
import { seasonalColors, seasonalOccupiedStops, seasonalRestStops } from './tokens';

/**
 * <defs> compartilhados do mapa: gradientes dos pastos (ocupação: verde →
 * marrom; descanso: marrom → verde — 2 stops cada), textura de tufos de capim
 * e a sombra única do diorama. Ids são globais no SVG do jogo. A paleta vem
 * da estação do ano (hemisfério sul) via `season`.
 */
export function GameDefs({ season }: { season: Season }) {
  const colors = seasonalColors(season);
  const occupiedStops = seasonalOccupiedStops(season);
  const restStops = seasonalRestStops(season);
  const { meadowEdge, ink, grass, grassLight } = colors;
  return <defs>
    {occupiedStops.map((stop, index) => <linearGradient key={`occupied-${index}`} id={`game-pasture-occupied-${index}`} x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stopColor={stop.light} />
      <stop offset="1" stopColor={stop.base} />
    </linearGradient>)}
    {restStops.map((stop, index) => <linearGradient key={`resting-${index}`} id={`game-pasture-resting-${index}`} x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stopColor={stop.light} />
      <stop offset="1" stopColor={stop.base} />
    </linearGradient>)}
    <linearGradient id="game-ground-grass" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stopColor={grassLight} />
      <stop offset="1" stopColor={grass} />
    </linearGradient>
    <pattern id="game-grass" width="46" height="46" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
      <g stroke={meadowEdge} strokeWidth="1.6" strokeLinecap="round" opacity="0.5">
        <path d="M6 12 q1 -5 2 -7 M10 12 q0 -4 -1 -6" fill="none" />
        <path d="M30 34 q1 -5 2 -7 M34 34 q0 -4 -1 -6" fill="none" />
        <path d="M38 10 q1 -4 2 -6" fill="none" />
        <path d="M14 40 q1 -4 2 -6" fill="none" />
      </g>
    </pattern>
    <filter id="game-diorama" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="7" stdDeviation="9" floodColor={ink} floodOpacity="0.22" />
    </filter>
  </defs>;
}
