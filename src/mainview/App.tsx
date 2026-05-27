import { useEffect, useState } from "react";
import type { DeviceInfo } from "../shared/stb.types";
import { electroview } from "./rpc";
import { Link } from "react-router-dom";

function App() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  

  const loadDeviceInfo = async () => {
    if (!electroview.rpc) {
      setError("Electroview RPC is not ready.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log("Requesting device info from Bun...");
      const info = await electroview.rpc.request.getDeviceInfo({});
      console.log("Received device info:", info);
      if (!info) {
        throw new Error("Device info is null or undefined");
      }
      setDeviceInfo(info);
    } catch (fetchError) {
      console.error("Error fetching device info:", fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch device info");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadAsync = async () => {
      if (!cancelled) {
        await loadDeviceInfo();
      }
    };

    void loadAsync();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRetry = () => {
    void loadDeviceInfo();
  };

  

  return (
    <div className="app-shell text-[var(--app-text)]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.36em] text-sky-200/70">GX Control</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Live receiver control with a cleaner surface</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--app-text-soft)] sm:text-base">
              Device status, cached channels, and live playback are all surfaced from one place.
            </p>
          </div>
          <div className="rounded-full border border-sky-400/20 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100 backdrop-blur">
            Connected control center
          </div>
        </div>

        <div className="glass-panel-strong relative overflow-hidden rounded-[2rem] p-5 sm:p-6 lg:p-8">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent" />

          {loading && <p className="text-[var(--app-text-soft)]">Loading device info... This may take up to 30 seconds.</p>}

          {!loading && error && (
            <div className="space-y-4 rounded-2xl border border-rose-400/25 bg-rose-500/10 p-5 text-rose-50">
              <p className="font-medium">Could not load device info: {error}</p>
              <button
                onClick={handleRetry}
                className="soft-button inline-flex items-center rounded-xl border border-rose-300/30 bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && deviceInfo && (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.28em] text-sky-200/70">Receiver status</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{deviceInfo.ProductName}</h2>
                  <p className="mt-2 text-sm text-[var(--app-text-soft)]">Serial {deviceInfo.SerialNumber} · Version {deviceInfo.SoftwareVersion}</p>
                </div>
                <span
                  className={`inline-flex items-center self-start rounded-full px-3 py-1 text-sm font-semibold ${
                    deviceInfo.StbStatus === 1
                      ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-300/25"
                      : "bg-amber-400/15 text-amber-100 ring-1 ring-amber-300/25"
                  }`}
                >
                  {deviceInfo.StbStatus === 1 ? "Online" : "Status " + deviceInfo.StbStatus}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="glass-panel rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-sky-200/70">Serial Number</p>
                  <p className="mt-2 text-base font-semibold text-white">{deviceInfo.SerialNumber}</p>
                </div>
                <div className="glass-panel rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-sky-200/70">Software Version</p>
                  <p className="mt-2 text-base font-semibold text-white">{deviceInfo.SoftwareVersion}</p>
                </div>
                <div className="glass-panel rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-sky-200/70">Channels Found</p>
                  <p className="mt-2 text-base font-semibold text-white">{deviceInfo.ChannelNum}</p>
                </div>
                <div className="glass-panel rounded-2xl p-4">
                  <p className="text-xs uppercase tracking-[0.24em] text-sky-200/70">Max Programs</p>
                  <p className="mt-2 text-base font-semibold text-white">{deviceInfo.MaxNumOfPrograms}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  to="/channels"
                  className="soft-button inline-flex items-center rounded-xl bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-sky-500/20 hover:bg-sky-300"
                >
                  View Channels
                </Link>
                <Link
                  to="/player"
                  className="soft-button inline-flex items-center rounded-xl border border-emerald-300/30 bg-emerald-400/10 px-5 py-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/15"
                >
                  Watch Live
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;