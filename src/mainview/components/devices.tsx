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
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Select your device</h1>
        <p className="mb-6 text-gray-300">Scanning your network for UPnP/SSDP devices...</p>

        {recentDevice && (
          <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-300">Recent device</p>
                <p className="text-lg font-semibold text-white">{recentDevice.name}</p>
                <p className="text-sm text-emerald-100/80">{recentDevice.ip}</p>
              </div>
              <button
                onClick={() => void useRecentDevice()}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                Use recent device
              </button>
            </div>
          </div>
        )}

        {loading && <p>Discovering devices on the network...</p>}
        {error && <p className="text-red-400">Error: {error}</p>}

        {!loading && devices.length === 0 && (
          <div className="p-4 bg-white/5 rounded">No devices found on the network.</div>
        )}

        <ul className="space-y-3">
          {devices.map((d, idx) => {
            const key = d.ip || d.location || d.usn || String(idx);
            const name = names[key] || d.server || d.ip;
            const isRecent = recentDevice?.ip === d.ip;
            return (
              <li
                key={idx}
                className={`bg-white/5 p-4 rounded flex items-center justify-between border ${
                  isRecent ? "border-emerald-400/60" : "border-transparent"
                }`}
              >
                <div>
                     <img src="https://symbols.getvecta.com/stencil_240/223_set-top-box.530df49e9e.svg" alt={name} className="w-16 h-16 object-contain" />
                  <div className="flex items-center gap-2">
                    <div className="font-semibold">{name}</div>
                    {isRecent && (
                      <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
                        Recent
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">{d.location ?? d.ip}</div>
                </div>
                <div>
                  <button
                    onClick={() => void handleConnect(d)}
                    className="bg-green-600 px-3 py-1 rounded text-sm font-semibold"
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
  );
}
