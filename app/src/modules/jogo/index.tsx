import { useMemo, useState } from 'react';
import type { Installation, Pasture, PastureOccupancy } from '../../domain/types';
import { useFarm } from '../../state/store';
import { useGameAudio } from './audio/useGameAudio';
import { GameMap } from './GameMap';
import { GameShell } from './GameShell';
import { InstallationSheet } from './InstallationSheet';
import { PastureSheet } from './PastureSheet';
import { currentSeason } from './tokens';

/**
 * /jogo — o tabuleiro da Fazenda: leitura viva do estado global (perímetro,
 * pastos, lotes, instalações) com câmera pan/zoom, descanso visível nos
 * pastos e paleta pela estação do ano. Tocar num pasto/instalação abre a
 * folha correspondente (som de clique no gesto).
 */
export default function JogoPage() {
  const { state } = useFarm();
  const { play } = useGameAudio();
  const season = useMemo(() => currentSeason(), []);

  const [selectedPasture, setSelectedPasture] = useState<{
    pasture: Pasture;
    occupancy: PastureOccupancy | null;
  } | null>(null);
  const [selectedInstallation, setSelectedInstallation] = useState<Installation | null>(null);

  const openPasture = (pasture: Pasture, occupancy: PastureOccupancy | null) => {
    play('click');
    setSelectedInstallation(null);
    setSelectedPasture({ pasture, occupancy });
  };

  const openInstallation = (installation: Installation) => {
    play('click');
    setSelectedPasture(null);
    setSelectedInstallation(installation);
  };

  if (!state.farmBoundary) {
    return <GameShell season={season}>
      <div className="grid h-full place-items-center px-8 text-center">
        <div className="max-w-xs">
          <p className="font-semibold mb-1">O tabuleiro precisa do perímetro</p>
          <p className="text-sm text-ink-soft">
            Trace o perímetro da Fazenda na aba Mapa para o jogo ganhar o terreno.
          </p>
        </div>
      </div>
    </GameShell>;
  }

  return <GameShell season={season}>
    <GameMap
      state={state}
      season={season}
      onSelectPasture={openPasture}
      onSelectInstallation={openInstallation}
    />
    {selectedPasture && (
      <PastureSheet
        pasture={selectedPasture.pasture}
        occupancy={selectedPasture.occupancy}
        onClose={() => setSelectedPasture(null)}
      />
    )}
    {selectedInstallation && (
      <InstallationSheet
        installation={selectedInstallation}
        onClose={() => setSelectedInstallation(null)}
      />
    )}
  </GameShell>;
}
