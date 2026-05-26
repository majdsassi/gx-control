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

export default function Devices() {
  const [devices, setDevices] = useState<RawDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  useEffect(() => {
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
      const res = await electroview.rpc.request.connectToDevice({ ip: d.ip });
      if (!res || !res.success) throw new Error(res?.error || "connect failed");
      // navigate to main app view
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

        {loading && <p>Discovering devices on the network...</p>}
        {error && <p className="text-red-400">Error: {error}</p>}

        {!loading && devices.length === 0 && (
          <div className="p-4 bg-white/5 rounded">No devices found on the network.</div>
        )}

        <ul className="space-y-3">
          {devices.map((d, idx) => {
            const key = d.ip || d.location || d.usn || String(idx);
            const name = names[key] || d.server || d.ip;
            return (
              <li key={idx} className="bg-white/5 p-4 rounded flex items-center justify-between">
                <div>
                  <div className="font-semibold">{name}</div>
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
