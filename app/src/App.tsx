import { NavLink, Route, Routes } from "react-router-dom";
import {
  Home,
  Sparkles,
  Milk,
  Beef,
  LineChart,
  Map as MapIcon,
  Wheat,
  Wallet,
  Images,
} from "lucide-react";
import { useFarm, pendingProposals } from "./state/store";
import InicioPage from "./modules/inicio";
import AssistentePage from "./modules/assistente";
import LeitePage from "./modules/leite";
import RebanhoPage from "./modules/rebanho";
import AnimalPage from "./modules/rebanho/AnimalPage";
import AnalisePage from "./modules/analise";
import MapaPage from "./modules/mapa";
import EstoquePage from "./modules/estoque";
import FinanceiroPage from "./modules/financeiro";
import GaleriaPage from "./modules/galeria";

const NAV = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/assistente", label: "Assistente", icon: Sparkles },
  { to: "/leite", label: "Leite", icon: Milk },
  { to: "/rebanho", label: "Rebanho", icon: Beef },
  { to: "/analise", label: "Análise", icon: LineChart },
  { to: "/mapa", label: "Mapa", icon: MapIcon },
  { to: "/estoque", label: "Estoque", icon: Wheat },
  { to: "/financeiro", label: "Caixa", icon: Wallet },
  { to: "/galeria", label: "Galeria", icon: Images },
];

// Mobile: 5 atalhos principais na barra inferior; restante no menu lateral (desktop) e "mais".
const MOBILE_NAV = NAV.slice(0, 5);

export default function App() {
  const { state } = useFarm();
  const pending = pendingProposals(state).length;

  return (
    <div className="min-h-dvh md:flex">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-black/5 bg-paper-card px-3 py-5 sticky top-0 h-dvh">
        <div className="px-3 mb-6">
          <p className="font-semibold tracking-tight">FazenDados</p>
          <p className="text-xs text-ink-soft mt-0.5">{state.farm.name}</p>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive ? "bg-pasture-100 text-pasture-700" : "text-ink-soft hover:bg-ink/5"
                }`
              }
            >
              <Icon size={18} />
              {label}
              {to === "/assistente" && pending > 0 && (
                <span className="ml-auto rounded-full bg-review-500 text-white text-[11px] font-bold px-1.5 py-0.5 min-w-5 text-center">
                  {pending}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 min-w-0 pb-24 md:pb-8">
        <div className="mx-auto max-w-content px-4 pt-5 md:px-8 md:pt-8">
          <Routes>
            <Route path="/" element={<InicioPage />} />
            <Route path="/assistente" element={<AssistentePage />} />
            <Route path="/leite/*" element={<LeitePage />} />
            <Route path="/rebanho" element={<RebanhoPage />} />
            <Route path="/rebanho/:animalId" element={<AnimalPage />} />
            <Route path="/analise" element={<AnalisePage />} />
            <Route path="/mapa" element={<MapaPage />} />
            <Route path="/estoque" element={<EstoquePage />} />
            <Route path="/financeiro" element={<FinanceiroPage />} />
            <Route path="/galeria" element={<GaleriaPage />} />
          </Routes>
        </div>
      </main>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-paper-card/95 backdrop-blur border-t border-black/5 safe-bottom">
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium ${
                  isActive ? "text-pasture-600" : "text-ink-faint"
                }`
              }
            >
              <Icon size={20} />
              {label}
              {to === "/assistente" && pending > 0 && (
                <span className="absolute top-1 right-1/2 translate-x-5 rounded-full bg-review-500 text-white text-[10px] font-bold px-1 min-w-4 text-center">
                  {pending}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
