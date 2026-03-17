import { BrowserWindow, BrowserView, Updater } from "electrobun/bun";
import type { MyWebviewRPCType } from "../shared/types";
import type { DeviceRPCType, DeviceInfo } from "../shared/stb.types";
import { Ali, AliTv } from "./stb";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;
let stbInfo: DeviceInfo[] = [{ ProductName: "STB Device", StbStatus: 0, SoftwareVersion: "Loading...", SerialNumber: "N/A", ChannelNum: 0, MaxNumOfPrograms: 0 }];

async function initializeSTB() {
  try {
    console.log("Initializing STB connection...");
    await Ali.connect("192.168.1.117", 20000);
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
        }
      },

      messages: {
        logToBun: ({ msg }) => {
          console.log("Browser says:", msg);
        },

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
