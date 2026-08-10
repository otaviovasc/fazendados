import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  Gamepad2,
  Home,
  Sparkles,
  Milk,
  Beef,
  LineChart,
  Wheat,
  Wallet,
  Images,
  Menu as MenuIcon,
} from "lucide-react";
import { useFarm, pendingProposals } from "./state/store";
import { ThemeToggle } from "./components/ThemeToggle";
import InicioPage from "./modules/inicio";
import AssistentePage from "./modules/assistente";
import LeitePage from "./modules/leite";
import RebanhoPage from "./modules/rebanho";
import AnimalPage from "./modules/rebanho/AnimalPage";
import AnalisePage from "./modules/analise";
import MapaPage from "./modules/mapa";
import JogoPage from "./modules/jogo";
import EstoquePage from "./modules/estoque";
import FinanceiroPage from "./modules/financeiro";
import GaleriaPage from "./modules/galeria";
import { Sheet } from "./components/ui";

// Volta ao topo a cada troca de rota — comportamento de app nativo.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

const NAV = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/assistente", label: "Assistente", icon: Sparkles },
  { to: "/leite", label: "Leite", icon: Milk },
  { to: "/rebanho", label: "Rebanho", icon: Beef },
  { to: "/analise", label: "Análise", icon: LineChart },
  { to: "/jogo", label: "Jogo", icon: Gamepad2 },
  { to: "/estoque", label: "Estoque", icon: Wheat },
  { to: "/financeiro", label: "Caixa", icon: Wallet },
  { to: "/galeria", label: "Galeria", icon: Images },
];

// Mobile: 4 atalhos fixos na barra inferior; o restante fica no menu "Mais".
const MOBILE_NAV = NAV.slice(0, 4);
const MOBILE_MORE = NAV.slice(4);

export default function App() {
  const { state } = useFarm();
  const pending = pendingProposals(state).length;
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MOBILE_MORE.some((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to)
  );

  return (
    <div className="min-h-dvh md:flex">
      <ScrollToTop />
      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-ink/5 bg-paper-card px-3 py-5 sticky top-0 h-dvh">
        <div className="px-3 mb-6">
          <img src="/brand/logo-complete.webp" alt="FazenDados" className="h-9 w-auto" />
          <p className="text-xs text-ink-soft mt-1.5">{state.farm.name}</p>
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
        <div className="mt-auto">
          <ThemeToggle />
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="flex-1 min-w-0 pb-24 md:pb-8 safe-top">
        <div className="mx-auto max-w-content px-4 pt-5 md:px-8 md:pt-8">
          <Routes>
            <Route path="/" element={<InicioPage />} />
            <Route path="/assistente" element={<AssistentePage />} />
            <Route path="/leite/*" element={<LeitePage />} />
            <Route path="/rebanho" element={<RebanhoPage />} />
            <Route path="/rebanho/:animalId" element={<AnimalPage />} />
            <Route path="/analise" element={<AnalisePage />} />
            <Route path="/mapa" element={<MapaPage />} />
            <Route path="/jogo" element={<JogoPage />} />
            <Route path="/estoque" element={<EstoquePage />} />
            <Route path="/financeiro" element={<FinanceiroPage />} />
            <Route path="/galeria" element={<GaleriaPage />} />
          </Routes>
        </div>
      </main>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-paper-card/95 backdrop-blur border-t border-ink/5 safe-bottom select-none">
        <div className="grid grid-cols-5">
          {MOBILE_NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-transform active:scale-90 ${
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
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-label="Mais opções"
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-transform active:scale-90 ${
              moreActive ? "text-pasture-600" : "text-ink-faint"
            }`}
          >
            <MenuIcon size={20} />
            Mais
          </button>
        </div>
      </nav>

      {/* Menu "Mais" — destinos sem espaço na barra inferior */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais">
        <img src="/brand/logo-icon.webp" alt="" className="h-12 w-12 mx-auto mb-4 rounded-xl" />
        <div className="grid grid-cols-3 gap-2">
          {MOBILE_MORE.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setMoreOpen(false)}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1.5 rounded-2xl px-2 py-4 text-xs font-medium min-h-[44px] transition-transform active:scale-95 ${
                  isActive ? "bg-pasture-100 text-pasture-700" : "bg-ink/[0.03] text-ink-soft"
                }`
              }
            >
              <Icon size={22} />
              {label}
            </NavLink>
          ))}
        </div>
        <div className="mt-3">
          <ThemeToggle />
        </div>
      </Sheet>
    </div>
  );
}
