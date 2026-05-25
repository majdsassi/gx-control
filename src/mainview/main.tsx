import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
// @ts-ignore - CSS side-effect import is handled by the bundler
import "./index.css";
import App from "./App";
import Channels from "./components/channels";
import StreamingViewer from "./components/player";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
	<BrowserRouter>
	<Routes>
		<Route path="*" element={<App />} />
		<Route path="/channels" element={<Channels />} />
		<Route path="/player" element={<StreamingViewer />} />
		<Route path="/404" element={<div className="p-4 text-center">404 - Not Found</div>} />
	</Routes>
  </BrowserRouter>
	</StrictMode>,
);
