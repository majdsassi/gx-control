import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
// @ts-ignore - CSS side-effect import is handled by the bundler
import "./index.css";
import App from "./App";
import Devices from "./components/devices";
import Channels from "./components/channels";
import StreamingViewer from "./components/player";

// Allow a global flag that indicates the app mounted successfully
declare global {
	interface Window { __appMounted?: boolean }
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
	<HashRouter>
	<Routes>
		<Route path="/" element={<Devices />} />
		<Route path="/app" element={<App />} />
		<Route path="/channels" element={<Channels />} />
		<Route path="/player" element={<StreamingViewer />} />
		<Route path="/404" element={<div className="p-4 text-center">404 - Not Found</div>} />
	</Routes>
	</HashRouter>
	</StrictMode>,
);

// Mark app as mounted for the index fallback overlay
try {
	// set after a microtask so render has a chance to run
	Promise.resolve().then(() => { window.__appMounted = true; });
} catch {
	window.__appMounted = true;
}
// notify any fallback overlay that the app has mounted
try { window.dispatchEvent(new Event('app-mounted')); } catch {};
