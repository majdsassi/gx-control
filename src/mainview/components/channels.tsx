import { useCallback, useEffect, useState } from "react";
import type { Channel } from "../../shared/stb.types";
import { electroview } from "../rpc";
import { Link } from "react-router-dom";

function Channels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadChannels = useCallback(async () => {
    if (!electroview.rpc) {
      setError("Electroview RPC is not ready.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await electroview.rpc.request.getChannelsByRange({ start: 0, end: 500 });
      setChannels(response);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch channels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChannels();
  }, [loadChannels]);

  if (loading) {
    return <p className="text-gray-700">Loading channels...</p>;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4">
        <p className="font-medium text-red-700">Could not load channels: {error}</p>
        <button
          className="mt-3 inline-flex items-center rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
          onClick={() => {
            void loadChannels();
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (channels.length === 0) {
    return <p className="text-gray-600">No channels found in the selected range.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <Link
          to="/app"
          className="inline-flex items-center rounded-lg bg-gray-800 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-700"
        >
          Back to Home
        </Link>
        <button
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          onClick={() => {
            void loadChannels();
          }}
        >
          Refresh
        </button>
      </div>

      <h3 className="text-xl font-semibold text-gray-900">Channels</h3>

      <p className="text-sm text-gray-600">Showing {channels.length} channels.</p>

      <ul className="space-y-2">
        {channels.map((channel) => {
          const channelType = channel.Radio === 1 ? "Radio" : "TV";
          const quality = channel.HD === 1 ? "HD" : "SD";
          const label = channel.ServiceName || `Service ${channel.ServiceID}`;

          return (
            <li
              key={`${channel.ServiceID}-${channel.PMTPID}`}
              className="rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <p className="font-medium text-gray-900">{label}</p>
              <p className="text-sm text-gray-600">
                ID {channel.ServiceID} | {channelType} | {quality}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default Channels;