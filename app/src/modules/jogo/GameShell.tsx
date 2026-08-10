import { ClipboardCheck, Milk, Pencil, Volume2, VolumeX } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { pendingProposals, productionFor, today, useFarm } from '../../state/store';
import { useGameAudio } from './audio/useGameAudio';
import { useDarkMode } from '../../theme';
import { seasonalOccupiedStops, seasonalRestStops, type Season } from './tokens';

/**
 * Moldura full-bleed do jogo + HUD flutuante: botão de mudo, chip "Resumo do
 * dia" (litros de leite do dia + pendências de revisão do Assistente, que
 * navega para o fluxo de revisão existente), botão "Editar mapa" (/mapa) e a
 * legenda do estado dos pastos (pastejo × descanso). Tudo dentro dela vive no
 */
export function GameShell({ children, season }: { children: ReactNode; season: Season }) {
  const { state } = useFarm();
  const { muted, toggleMuted } = useGameAudio();
  const navigate = useNavigate();
  const dark = useDarkMode();

  const production = productionFor(state, today());
  const pending = pendingProposals(state).length;

  return <div className="game-root" data-testid="game-root">
    {children}

    {/* HUD: topo — mudo + resumo do dia. */}
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-2 p-3 safe-top">
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={toggleMuted}
          aria-label={muted ? 'Ativar som' : 'Silenciar'}
          className="grid size-11 place-items-center rounded-full bg-paper-card/90 shadow-md border border-ink/5 text-ink-soft"
        >
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <button
          type="button"
          onClick={() => navigate('/mapa')}
          aria-label="Editar mapa"
          className="grid size-11 place-items-center rounded-full bg-paper-card/90 shadow-md border border-ink/5 text-ink-soft"
        >
          <Pencil size={20} />
        </button>
      </div>

      <button
        type="button"
        onClick={() => navigate('/assistente')}
        className="pointer-events-auto flex items-center gap-2.5 rounded-full bg-paper-card/90 shadow-md border border-ink/5 pl-3.5 pr-2.5 py-2 text-left"
        aria-label={`Resumo do dia — abrir revisão do Assistente${pending > 0 ? ` (${pending} pendências)` : ''}`}
      >
        <span className="flex items-center gap-1.5 text-sm font-semibold tnum">
          <Milk size={16} className="text-pasture-600" />
          {production ? `${production.liters.toLocaleString('pt-BR')} L` : '— L'}
          <span className="text-ink-faint font-normal text-xs">hoje</span>
        </span>
        <span className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-bold ${
          pending > 0 ? 'bg-review-500 text-white' : 'bg-pasture-100 text-pasture-700'
        }`}>
          <ClipboardCheck size={14} />
          {pending > 0 ? pending : 'em dia'}
        </span>
      </button>
    </div>

    {/* Legenda do estado dos pastos (canto inferior esquerdo): ocupado
        marronheia com os dias de pastejo; livre esverdeia com o descanso. */}
    <div className="pointer-events-none absolute left-3 bottom-3 z-10 rounded-2xl bg-paper-card/90 shadow-md border border-ink/5 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint mb-1.5">Estado do pasto</p>
      {([
        ['Em pastejo', seasonalOccupiedStops(season, dark)],
        ['Em descanso', seasonalRestStops(season, dark)],
      ] as const).map(([group, stops]) => (
        <div key={group} className="mb-1.5 last:mb-0">
          <p className="text-[9px] font-medium uppercase tracking-wide text-ink-faint mb-0.5">{group}</p>
          <ul className="flex flex-col gap-1">
            {stops.map((stop) => (
              <li key={stop.label} className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                <span
                  className="inline-block size-3 rounded-sm border border-ink/10"
                  style={{ background: `linear-gradient(135deg, ${stop.light}, ${stop.base})` }}
                />
                {stop.label}
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="mt-1.5 text-[10px] text-ink-faint capitalize">{season}</p>
    </div>
  </div>;
}
