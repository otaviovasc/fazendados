import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { PageHeader } from "../../components/ui";
import ProducaoTab from "./ProducaoTab";
import ControleTab from "./ControleTab";
import ColetaTab from "./ColetaTab";
import CompararTab from "./CompararTab";
import { LEITE_TABS, leiteTabPath } from "./routes";

export default function LeitePage() {
  return (
    <div>
      <PageHeader
        title="Leite"
        subtitle="Produção diária, Controle leiteiro e Coleta — fatos independentes."
      />

      <nav className="flex gap-2 overflow-x-auto mb-5 -mx-1 px-1">
        {LEITE_TABS.map((t) => (
          <NavLink
            key={t.to}
            to={leiteTabPath(t.to)}
            className={({ isActive }) =>
              `shrink-0 rounded-full px-4 min-h-[44px] inline-flex items-center text-sm font-medium transition ${
                isActive
                  ? "bg-pasture-600 text-white"
                  : "bg-paper-card border border-black/5 text-ink-soft hover:bg-pasture-100"
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route
          index
          element={<Navigate to={leiteTabPath("producao")} replace />}
        />
        <Route path="producao" element={<ProducaoTab />} />
        <Route path="controle" element={<ControleTab />} />
        <Route path="coleta" element={<ColetaTab />} />
        <Route path="comparar" element={<CompararTab />} />
        <Route
          path="*"
          element={<Navigate to={leiteTabPath("producao")} replace />}
        />
      </Routes>
    </div>
  );
}
