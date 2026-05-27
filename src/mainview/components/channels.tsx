import { useCallback, useEffect, useMemo, useState } from "react";
import type { Channel, ChannelPage, DeviceInfo } from "../../shared/stb.types";
import { electroview } from "../rpc";
import { Link } from "react-router-dom";

const PAGE_SIZE = 100;

function Channels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [pageStart, setPageStart] = useState(0);
  const [pageMeta, setPageMeta] = useState<ChannelPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");

  const loadChannelsPage = useCallback(async (requestedStart: number) => {
    if (!electroview.rpc) {
      setError("Electroview RPC is not ready.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [info, response] = await Promise.all([
        electroview.rpc.request.getDeviceInfo({}),
        electroview.rpc.request.getChannelsPage({ startIndex: requestedStart, pageSize: PAGE_SIZE }),
      ]);

      setDeviceInfo(info);
      setChannels(response.channels);
      setPageMeta(response);
      setPageStart(response.startIndex);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch channels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChannelsPage(0);
  }, [loadChannelsPage]);

  const filteredChannels = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return channels;
    }

    return channels.filter((channel) => {
      const name = channel.ServiceName || "";
      const id = channel.ServiceID || "";
      return name.toLowerCase().includes(query) || id.toLowerCase().includes(query);
    });
  }, [channels, searchText]);

  const tvChannels = channels.filter((channel) => channel.Radio === 0).length;
  const radioChannels = channels.filter((channel) => channel.Radio === 1).length;
  const hdChannels = channels.filter((channel) => channel.HD === 1).length;
  const totalPages = pageMeta ? Math.max(1, Math.ceil(pageMeta.totalCount / pageMeta.pageSize)) : 1;
  const currentPage = Math.floor(pageStart / PAGE_SIZE) + 1;
  const isFirstPage = pageStart <= 0;
  const isLastPage = pageMeta ? pageStart + pageMeta.pageSize >= pageMeta.totalCount : false;
  const currentChannelId = pageMeta?.currentChannelId ?? null;

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
            void loadChannelsPage(pageStart);
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

  if (filteredChannels.length === 0) {
    return (
      <div className="space-y-4">
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
              setSearchText("");
            }}
          >
            Clear search
          </button>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-700 shadow-sm">
          No channels match “{searchText}”.
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell text-[var(--app-text)]">
      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.36em] text-sky-200/70">Channel browser</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Browse cached pages of channels</h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--app-text-soft)] sm:text-base">
              Channels load in pages of 100, starting around the current channel, so browsing stays responsive.
            </p>
          </div>
          <div className="rounded-full border border-sky-400/20 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100 backdrop-blur">
            {deviceInfo ? `${deviceInfo.ChannelNum} reported` : "Cached browsing"}
          </div>
        </div>

        <div className="space-y-4 rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur-xl sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/app"
          className="soft-button inline-flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          Back to Home
        </Link>
        <div className="flex gap-2">
          <button
            className="soft-button rounded-xl bg-sky-400 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-300"
            onClick={() => {
              void loadChannelsPage(pageStart);
            }}
          >
            Refresh cache
          </button>
        </div>
      </div>

      <div className="glass-panel-strong rounded-[1.75rem] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-sky-200/70">Channel library</p>
            <h3 className="text-2xl font-semibold text-white">Cached channels</h3>
            <p className="mt-1 text-sm text-[var(--app-text-soft)]">
              Loaded from Bun page cache. {deviceInfo ? `${deviceInfo.ChannelNum} reported by the STB.` : "Device info unavailable."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
            <div className="glass-panel rounded-2xl px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-sky-200/70">Loaded</p>
              <p className="text-lg font-semibold text-white">{channels.length}</p>
            </div>
            <div className="glass-panel rounded-2xl px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-sky-200/70">TV</p>
              <p className="text-lg font-semibold text-white">{tvChannels}</p>
            </div>
            <div className="glass-panel rounded-2xl px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-sky-200/70">Radio</p>
              <p className="text-lg font-semibold text-white">{radioChannels}</p>
            </div>
            <div className="glass-panel rounded-2xl px-3 py-2">
              <p className="text-xs uppercase tracking-wide text-sky-200/70">HD</p>
              <p className="text-lg font-semibold text-white">{hdChannels}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-[var(--app-text-soft)]">
            <p>
              Showing page {currentPage} of {totalPages}.
            </p>
            <p>
              Showing {filteredChannels.length} of {channels.length} channels on this page.
            </p>
          </div>
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Search by channel name or ID"
            className="w-full rounded-xl border border-white/10 bg-white/90 px-3 py-2 text-sm text-slate-950 shadow-sm outline-none ring-0 placeholder:text-slate-500 focus:border-sky-300 sm:max-w-sm"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <div className="text-sm text-[var(--app-text-soft)]">
            {currentChannelId ? `Current channel id: ${currentChannelId}` : "Current channel unavailable."}
          </div>
          <div className="flex gap-2">
            <button
              className="soft-button rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isFirstPage || loading}
              onClick={() => {
                void loadChannelsPage(Math.max(0, pageStart - PAGE_SIZE));
              }}
            >
              Previous
            </button>
            <button
              className="soft-button rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={isLastPage || loading}
              onClick={() => {
                void loadChannelsPage(pageStart + PAGE_SIZE);
              }}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <ul className="grid gap-3">
        {filteredChannels.map((channel) => {
          const channelType = channel.Radio === 1 ? "Radio" : "TV";
          const quality = channel.HD === 1 ? "HD" : "SD";
          const label = channel.ServiceName || `Service ${channel.ServiceID}`;
          const isCurrent = currentChannelId === channel.ServiceID;

          return (
            <li
              key={`${channel.ServiceID}-${channel.PMTPID}`}
              className={`glass-panel rounded-2xl px-4 py-3 transition hover:-translate-y-0.5 hover:border-sky-300/30 hover:shadow-lg ${
                isCurrent ? "ring-1 ring-sky-300/30" : "border-white/10"
              }`}
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-white">{label}</p>
                    {isCurrent && (
                      <span className="accent-chip rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--app-text-soft)]">
                    ID {channel.ServiceID} | {channelType} | {quality}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--app-text-soft)]">
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">PMT {channel.PMTPID}</span>
                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Video {channel.VideoPID}</span>
                </div>
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

export default Channels;