import { BrowserWindow, BrowserView, Updater } from "electrobun/bun";
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MyWebviewRPCType } from "../shared/types";
import type { DeviceRPCType, DeviceInfo } from "../shared/stb.types";
import { Ali, AliTv } from "./stb";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
const HLS_PORT = 18085;
const HLS_ROOT = path.join(os.tmpdir(), "gx-control-hls");
const HLS_PLAYLIST = path.join(HLS_ROOT, "live.m3u8");

let stbInfo: DeviceInfo[] = [{ ProductName: "STB Device", StbStatus: 0, SoftwareVersion: "Loading...", SerialNumber: "N/A", ChannelNum: 0, MaxNumOfPrograms: 0 }];
let hlsServerStarted = false;
let transcodeProcess: ReturnType<typeof spawn> | null = null;
let currentStreamUrl = "";

async function ensureHlsDirectory(): Promise<void> {
  await mkdir(HLS_ROOT, { recursive: true });
}

async function cleanHlsDirectory(): Promise<void> {
  await ensureHlsDirectory();
  const entries = await readdir(HLS_ROOT);
  await Promise.all(entries.map((entry) => rm(path.join(HLS_ROOT, entry), { force: true, recursive: true })));
}

async function waitForHlsPlaylist(timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      await readFile(HLS_PLAYLIST);
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  return false;
}

async function waitForHlsWarmup(timeoutMs: number, minimumSegments: number): Promise<boolean> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const entries = await readdir(HLS_ROOT);
      const segmentCount = entries.filter((entry) => entry.endsWith(".ts")).length;

      if (segmentCount >= minimumSegments) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        return true;
      }
    } catch {
      // Keep waiting until the encoder creates the first segments.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
}

function startHlsFileServer(): void {
  if (hlsServerStarted) {
    return;
  }

  Bun.serve({
    port: HLS_PORT,
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      const requested = url.pathname === "/" ? "/live.m3u8" : url.pathname;
      const safeRelative = requested.replace(/^\/+/, "");
      const filePath = path.join(HLS_ROOT, safeRelative);

      if (!filePath.startsWith(HLS_ROOT)) {
        return new Response("Forbidden", {
          status: 403,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      try {
        const content = await readFile(filePath);
        const contentType = filePath.endsWith(".m3u8")
          ? "application/vnd.apple.mpegurl"
          : "video/mp2t";

        return new Response(new Uint8Array(content), {
          status: 200,
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
            "Access-Control-Allow-Origin": "*",
          },
        });
      } catch {
        return new Response("Not ready", {
          status: 404,
          headers: {
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    },
  });

  hlsServerStarted = true;
  console.log(`HLS file server listening on http://127.0.0.1:${HLS_PORT}`);
}

async function startTranscode(sourceUrl: string): Promise<void> {
  await cleanHlsDirectory();

  if (transcodeProcess) {
    transcodeProcess.kill();
    transcodeProcess = null;
  }

  const args = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-fflags",
    "nobuffer",
    "-i",
    sourceUrl,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-fps_mode",
    "cfr",
    "-vf",
    "scale=1280:-2:flags=lanczos",
    "-r",
    "25",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-pix_fmt",
    "yuv420p",
    "-profile:v",
    "main",
    "-level",
    "4.0",
    "-force_key_frames",
    "expr:gte(t,n_forced*4)",
    "-sc_threshold",
    "0",
    "-muxdelay",
    "0",
    "-muxpreload",
    "0",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_list_size",
    "4",
    "-hls_flags",
    "delete_segments+append_list+omit_endlist+temp_file+independent_segments",
    "-hls_segment_filename",
    path.join(HLS_ROOT, "segment_%05d.ts"),
    HLS_PLAYLIST,
  ];

  transcodeProcess = spawn("ffmpeg", args, {
    windowsHide: true,
    stdio: ["ignore", "ignore", "pipe"],
  });

  transcodeProcess.stderr?.on("data", (chunk) => {
    const message = String(chunk).trim();
    if (message) {
      console.log("ffmpeg:", message);
    }
  });

  transcodeProcess.on("close", (code) => {
    console.log("ffmpeg exited with code", code ?? -1);
  });

  await waitForHlsPlaylist(10000);
  await waitForHlsWarmup(10000, 2);
}

async function initializeSTB() {
  try {
    console.log("Initializing STB connection...");
    await Ali.connect("192.168.1.152", 20000);
    console.log("Connected to STB");
    
    const deviceInfo = await AliTv.requestDeviceInfo();
    console.log("Device info fetched:", deviceInfo);
    
    if (deviceInfo && deviceInfo.length > 0) {
      stbInfo = deviceInfo;
      console.log(" STB initialized with device info:", stbInfo[0].ProductName);
    } else {
      console.warn("No device info returned, using default");
    }
  } catch (e) {
    console.error(" Failed to initialize STB:", e);
  }
}

async function getMainViewUrl(): Promise<string> {
  const channel = await Updater.localInfo.channel();

  if (channel === "dev") {
    try {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      return DEV_SERVER_URL;
    } catch {}
  }

  return "views://mainview/index.html";
}

async function main() {
  // Initialize STB first
  await initializeSTB();
  startHlsFileServer();
  await AliTv.getChannels();
  const currentChannel = await AliTv.getCurrentChannel();
  console.log("Current channel:", currentChannel);
  const streamInfo = await AliTv.startHttpStream(AliTv.getChannelByName(currentChannel).ServiceID);
  currentStreamUrl = streamInfo[0]?.url ?? "";
  console.log("Raw stream URL:", currentStreamUrl);
  console.log("HLS transcode will start when you click Watch Live.");

  const appRPC = BrowserView.defineRPC<MyWebviewRPCType & DeviceRPCType>({
    maxRequestTime: 30000,

    handlers: {
      requests: {
        someBunFunction: ({ a, b }) => {
          console.log("browser asked math:", a, b);
          return a + b;
        },
        getDeviceInfo: async () => {
          console.log("getDeviceInfo called, stbInfo:", JSON.stringify(stbInfo, null, 2));
          if (!stbInfo || stbInfo.length === 0) {
            console.error("stbInfo is empty, returning default");
            return { ProductName: "STB Device", StbStatus: 0, SoftwareVersion: "Unknown", SerialNumber: "N/A", ChannelNum: 0, MaxNumOfPrograms: 0 };
          }
          const response = stbInfo[0];
          console.log("Returning device info:", response);
          return response;
        },
        getChannelsByRange: async ({ start, end }) => {
          console.log("getChannelsByRange called with:", { start, end });
          const channels = await AliTv.requestChannelRange(start, end);
          console.log("Channels retrieved:", channels?.length || 0);
          return channels;
        },
        getPlaybackSource: async () => {
          try {
            if (!currentStreamUrl) {
              throw new Error("Current stream URL is not available");
            }

            await startTranscode(currentStreamUrl);
            return {
              mode: "hls-transcoded" as const,
              url: `http://127.0.0.1:${HLS_PORT}/live.m3u8`,
              message: "Transcoding stream for browser compatibility.",
            };
          } catch (error) {
            console.error("Failed to start transcoder:", error);
            throw error;
          }
        }
      },

      messages: {
        "*": (name, payload) => {
          console.log("Unknown message:", name, payload);
        },
      },
    },
  });

  const url = await getMainViewUrl();

  new BrowserWindow({
    title: "GX Control - By Majd Sassi",
    url,
    frame: {
      width: 900,
      height: 700,
      x: 200,
      y: 200,
    },
    rpc: appRPC,
  });

  console.log("GX Control app started!");
}

main().catch(e => {
  console.error("Fatal error in main:", e);
});
