import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import AdminPage from "./modules/admin";
import App from "./App";
import { FarmProvider } from "./state/store";
import { setupPwa } from "./pwa";
import "./index.css";

setupPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/admin/*" element={<AdminPage />} />
        <Route path="/*" element={<FarmProvider><App /></FarmProvider>} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
