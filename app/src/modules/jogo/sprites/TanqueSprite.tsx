import { gameTokens, useBoardColors } from '../tokens';

/**
 * Tanque de leite visto de cima (grid 64): cilindro de metal sobre uma base de
 * concreto, tampa clara ao centro. Sem medidor — o tabuleiro não mostra nível.
 */
export function TanqueSprite({ x, y, size = 56 }: { x: number; y: number; size?: number }) {
  const { dirt, steel, milk, ink } = useBoardColors();
  const scale = size / gameTokens.sprite.grid;
  return <g transform={`translate(${x} ${y}) scale(${scale}) translate(-32 -32)`} aria-hidden>
    <ellipse cx="32" cy="36" rx="24" ry="18" fill={dirt} opacity="0.7" />
    <circle cx="32" cy="32" r="17" fill={steel} />
    <circle cx="32" cy="32" r="17" fill="none" stroke={ink} strokeWidth="1.2" opacity="0.2" />
    <circle cx="28" cy="28" r="10" fill={milk} opacity="0.55" />
    <circle cx="32" cy="32" r="4.5" fill={milk} stroke={ink} strokeWidth="1" opacity="0.9" />
  </g>;
}
