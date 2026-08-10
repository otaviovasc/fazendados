import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Sheet } from "../../components/ui";
import type { Installation } from "../../domain/types";
import { INSTALLATION_TYPE_LABEL } from "../mapa/space";
import { useGameAudio } from "./audio/useGameAudio";

/**
 * Folha da Instalação no jogo: nome/tipo e, para tanque e curral, atalho para
 * o fluxo existente do assistente (rota /assistente) — sem duplicar lógica.
 */
export function InstallationSheet({
  installation,
  onClose,
}: {
  installation: Installation;
  onClose: () => void;
}) {
  const { play } = useGameAudio();
  const offersAssistant = installation.type === "tanque" || installation.type === "curral";

  return (
    <Sheet open onClose={onClose} title={installation.name}>
      <div className="space-y-5">
        <div className="rounded-2xl border border-ink/5 bg-paper-sunken px-4 py-3">
          <p className="text-sm text-ink-soft">
            {INSTALLATION_TYPE_LABEL[installation.type]}
          </p>
        </div>

        {offersAssistant && (
          <Link
            to="/assistente"
            onClick={() => play("click")}
            className="w-full flex items-center gap-3 rounded-xl border border-ink/10 bg-paper-card px-3.5 py-3 text-left min-h-[44px] transition hover:border-pasture-200"
          >
            <Sparkles size={20} className="text-pasture-600 shrink-0" />
            <span>
              <span className="block font-medium">Registrar pelo assistente</span>
              <span className="block text-sm text-ink-soft">
                {installation.type === "tanque"
                  ? "Produção diária, coleta e controle leiteiro."
                  : "Trato e rotinas do curral, por texto ou áudio."}
              </span>
            </span>
          </Link>
        )}
      </div>
    </Sheet>
  );
}
