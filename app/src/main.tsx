import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { FarmProvider } from "./state/store";
import { setupPwa } from "./pwa";
import "./index.css";

setupPwa();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <FarmProvider>
        <App />
      </FarmProvider>
    </BrowserRouter>
  </StrictMode>
);
