import { BrowserWindow, BrowserView, Updater } from "electrobun/bun";
import type { MyWebviewRPCType } from "../shared/types";
import type { DeviceRPCType } from "../shared/stb.types";
import { Ali, AliTv } from "./stb";

const DEV_SERVER_PORT = 5173;
const DEV_SERVER_URL = `http://localhost:${DEV_SERVER_PORT}`;

Ali.connect("192.168.1.117", 20000)
  .then(() => {
    console.log("Connected to STB");
    return AliTv.requestDeviceInfo();
  })
  .then((deviceInfo) => {
    console.log("Device info:", deviceInfo);
  })
  .catch((e) => {
    console.error("Failed to connect to STB:", e);
  });


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

const appRPC = BrowserView.defineRPC<MyWebviewRPCType & DeviceRPCType>({
  maxRequestTime: 5000,

  handlers: {
    requests: {
      someBunFunction: ({ a, b }) => {
        console.log("browser asked math:", a, b);
        return a + b;
      },
      getDeviceInfo: async () => {
        const info = await AliTv.requestDeviceInfo();

        if (info.length === 0) {
          throw new Error("No device info returned from STB");
        }

        return info[0];
      },
      getChannelsByRange: async ({ start, end }) => {
        const channels = await AliTv.requestChannelRange(start, end);
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
