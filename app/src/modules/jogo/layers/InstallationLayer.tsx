import type { KeyboardEvent, ReactElement } from 'react';
import type { GameProjection } from '../../../domain/game/projection';
import type { Installation, InstallationType } from '../../../domain/types';
import { CurralSprite } from '../sprites/CurralSprite';
import { DepositoSprite } from '../sprites/DepositoSprite';
import { OutroSprite } from '../sprites/OutroSprite';
import { TanqueSprite } from '../sprites/TanqueSprite';

type SpriteComponent = (props: { x: number; y: number; size?: number }) => ReactElement;

/** Registro por tipo: sprite e tamanho. Sem caminhão — coleta não anima. */
const REGISTRY: Record<InstallationType, { sprite: SpriteComponent; size: number }> = {
  curral: { sprite: CurralSprite, size: 64 },
  tanque: { sprite: TanqueSprite, size: 56 },
  deposito: { sprite: DepositoSprite, size: 64 },
  outro: { sprite: OutroSprite, size: 64 },
};

/**
 * Instalações do tabuleiro, dirigidas pelo REGISTRY (sem switch por tipo).
 * Todas são acionáveis: botões SVG de verdade (Enter/Espaço funcionam) com
 * hit-area generosa e o `name` como rótulo. Tocar abre a folha da instalação.
 */
export function InstallationLayer({ installations, projection, onSelect, didDrag }: {
  installations: Installation[];
  projection: GameProjection;
  onSelect: (installation: Installation) => void;
  /** true quando o último gesto foi arrasto (pan) — o click é suprimido. */
  didDrag?: () => boolean;
}) {
  function activate(event: KeyboardEvent, installation: Installation) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect(installation);
    }
  }

  return <g>
    {installations.map((installation) => {
      const entry = REGISTRY[installation.type];
      if (!entry) return null;
      const point = projection.toLocal(installation.point);
      const Sprite = entry.sprite;
      return <g
        key={installation.id}
        data-testid={`game-installation-${installation.id}`}
        role="button"
        tabIndex={0}
        aria-label={`${installation.name} — abrir a folha da instalação`}
        className="game-installation"
        onClick={() => { if (!didDrag?.()) onSelect(installation); }}
        onKeyDown={(event) => activate(event, installation)}
      >
        <circle cx={point.x} cy={point.y} r="52" fill="transparent" />
        <Sprite x={point.x} y={point.y} size={entry.size} />
        <text className="game-installation-label" x={point.x} y={point.y + entry.size / 2 + 12} pointerEvents="none">{installation.name}</text>
      </g>;
    })}
  </g>;
}
