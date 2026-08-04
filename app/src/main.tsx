import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { FarmProvider } from "./state/store";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <FarmProvider>
        <App />
      </FarmProvider>
    </BrowserRouter>
  </StrictMode>
);
