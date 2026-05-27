import { useEffect, useState } from "react";
import { electroview } from "../rpc";
import { useNavigate } from "react-router-dom";

type RawDevice = {
  ip: string;
  location?: string;
  server?: string;
  usn?: string;
  st?: string;
};

type StoredDevice = {
  ip: string;
  name: string;
};

const RECENT_DEVICE_KEY = "gx-control:recent-device";

function readRecentDevice(): StoredDevice | null {
  try {
    const raw = localStorage.getItem(RECENT_DEVICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredDevice>;
    if (!parsed.ip || !parsed.name) return null;
    return { ip: parsed.ip, name: parsed.name };
  } catch {
    return null;
  }
}

function storeRecentDevice(device: StoredDevice) {
  try {
    localStorage.setItem(RECENT_DEVICE_KEY, JSON.stringify(device));
  } catch {
    // ignore storage failures
  }
}

export default function Devices() {
  const [devices, setDevices] = useState<RawDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [recentDevice, setRecentDevice] = useState<StoredDevice | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    setRecentDevice(readRecentDevice());

    let cancelled = false;

    const discover = async () => {
      setLoading(true);
      setError(null);
      setDevices([]);
      try {
        if (!electroview.rpc) throw new Error("RPC not ready");
        const found = await electroview.rpc.request.discoverDevices({ timeout: 4 });
        if (cancelled) return;
        setDevices(found || []);

        // Try to fetch friendly names in parallel
        const namePromises = (found || []).map(async (d: RawDevice) => {
          const key = d.ip || d.location || d.usn || JSON.stringify(d);
          if (d.location) {
            try {
              const res = await fetch(d.location);
              const text = await res.text();
              const m = text.match(/<friendlyName>([^<]+)<\/friendlyName>/i);
              if (m && m[1]) return [key, m[1]] as const;
            } catch {
              // ignore
            }
          }
          // fallback to server or ip
          return [key, d.server || d.ip || "Unknown"] as const;
        });

        const resolved = await Promise.allSettled(namePromises);
        if (cancelled) return;
        const newNames: Record<string, string> = {};
        resolved.forEach((r) => {
          if (r.status === "fulfilled") {
            const [k, v] = r.value as [string, string];
            newNames[k] = v;
          }
        });
        setNames(newNames);
      } catch (err: any) {
        setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void discover();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleConnect = async (d: RawDevice) => {
    try {
      if (!electroview.rpc) throw new Error("RPC not ready");
      const key = d.ip || d.location || d.usn || "";
      const displayName = names[key] || d.server || d.ip || "Unknown";
      const res = await electroview.rpc.request.connectToDevice({ ip: d.ip });
      if (!res || !res.success) throw new Error(res?.error || "connect failed");
      storeRecentDevice({ ip: d.ip, name: displayName });
      setRecentDevice({ ip: d.ip, name: displayName });
      // navigate to main app view
      navigate("/app");
    } catch (err) {
      alert(String(err));
    }
  };

  const useRecentDevice = async () => {
    if (!recentDevice) return;
    try {
      if (!electroview.rpc) throw new Error("RPC not ready");
      const res = await electroview.rpc.request.connectToDevice({ ip: recentDevice.ip });
      if (!res || !res.success) throw new Error(res?.error || "connect failed");
      navigate("/app");
    } catch (err) {
      alert(String(err));
    }
  };

  return (
    <div className="app-shell text-[var(--app-text)]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.36em] text-sky-200/70">Device discovery</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Pick the receiver to connect</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--app-text-soft)] sm:text-base">The app scans your network and caches the last device you used.</p>
          </div>
          <div className="rounded-full border border-sky-400/20 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100 backdrop-blur">
            SSDP scan active
          </div>
        </div>

        <div className="glass-panel-strong rounded-[2rem] p-5 sm:p-6 lg:p-8">
          <p className="mb-6 text-sm text-[var(--app-text-soft)]">Scanning your network for UPnP/SSDP devices...</p>

        {recentDevice && (
          <div className="mb-6 rounded-3xl border border-emerald-400/20 bg-emerald-400/10 p-4 shadow-lg shadow-emerald-950/20">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-emerald-200/80">Recent device</p>
                <p className="text-lg font-semibold text-white">{recentDevice.name}</p>
                <p className="text-sm text-emerald-100/80">{recentDevice.ip}</p>
              </div>
              <button
                onClick={() => void useRecentDevice()}
                className="soft-button rounded-xl bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-300"
              >
                Use recent device
              </button>
            </div>
          </div>
        )}

        {loading && <p className="text-[var(--app-text-soft)]">Discovering devices on the network...</p>}
        {error && <p className="text-rose-200">Error: {error}</p>}

        {!loading && devices.length === 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-[var(--app-text-soft)]">No devices found on the network.</div>
        )}

        <ul className="space-y-4">
          {devices.map((d, idx) => {
            const key = d.ip || d.location || d.usn || String(idx);
            const name = names[key] || d.server || d.ip;
            const isRecent = recentDevice?.ip === d.ip;
            return (
              <li
                key={idx}
                className={`glass-panel rounded-3xl p-4 transition hover:-translate-y-0.5 hover:border-sky-300/30 ${
                  isRecent ? "ring-1 ring-emerald-300/25" : "border-transparent"
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-sky-400/10 ring-1 ring-sky-300/15">
                    <img src="https://symbols.getvecta.com/stencil_240/223_set-top-box.530df49e9e.svg" alt={name} className="h-10 w-10 object-contain opacity-90" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold text-white">{name}</div>
                    {isRecent && (
                      <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-100 ring-1 ring-emerald-300/20">
                        Recent
                      </span>
                    )}
                  </div>
                    <div className="mt-1 text-xs text-[var(--app-text-soft)]">{d.location ?? d.ip}</div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end sm:mt-0">
                  <button
                    onClick={() => void handleConnect(d)}
                    className="soft-button rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-300"
                  >
                    Connect
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      </div>
    </div>
  );
}
