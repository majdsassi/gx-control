import { Electroview } from "electrobun/view";
import { useEffect, useState } from "react";
import type { DeviceInfo, DeviceRPCType } from "../shared/stb.types";

const webviewRpc = Electroview.defineRPC<DeviceRPCType>({
  handlers: {
    requests: {},

    messages: {
      logToWebview: ({ msg }) => {
        console.log("Message from bun:", msg);
      },
    },
  },
});

const electroview = new Electroview({ rpc: webviewRpc });

function App() {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadDeviceInfo = async () => {
      if (!electroview.rpc) {
        if (!cancelled) {
          setError("Electroview RPC is not ready.");
          setLoading(false);
        }
        return;
      }

      try {
        const info = await electroview.rpc.request.getDeviceInfo({});
        if (!cancelled) {
          setDeviceInfo(info);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch device info");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadDeviceInfo();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-400 text-gray-900">
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-4xl font-bold mb-2 text-center text-white">GX Control Panel</h1>
        <p className="text-lg mb-8 text-center text-blue-100">
          Live receiver status from your connected STB.
        </p>

        <div className="rounded-2xl border border-white/30 bg-white/85 backdrop-blur p-6 shadow-2xl">
          {loading && <p className="text-gray-700">Loading device info...</p>}

          {!loading && error && (
            <p className="text-red-600 font-medium">Could not load device info: {error}</p>
          )}

          {!loading && !error && deviceInfo && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-gray-900">{deviceInfo.ProductName}</h2>
                <span
                  className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    deviceInfo.StbStatus === 1
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-amber-100 text-amber-700"
                  }`}
                >
                  {deviceInfo.StbStatus === 1 ? "Online" : "Status " + deviceInfo.StbStatus}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl bg-blue-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-blue-600">Serial Number</p>
                  <p className="text-base font-semibold text-gray-900">{deviceInfo.SerialNumber}</p>
                </div>
                <div className="rounded-xl bg-blue-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-blue-600">Software Version</p>
                  <p className="text-base font-semibold text-gray-900">{deviceInfo.SoftwareVersion}</p>
                </div>
                <div className="rounded-xl bg-cyan-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-cyan-700">Channels Found</p>
                  <p className="text-base font-semibold text-gray-900">{deviceInfo.ChannelNum}</p>
                </div>
                <div className="rounded-xl bg-cyan-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-cyan-700">Max Programs</p>
                  <p className="text-base font-semibold text-gray-900">{deviceInfo.MaxNumOfPrograms}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
