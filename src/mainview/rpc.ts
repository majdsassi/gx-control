import { Electroview } from "electrobun/view";
import type { DeviceRPCType } from "../shared/stb.types";

const webviewRpc = Electroview.defineRPC<DeviceRPCType>({
  maxRequestTime: 30000,
  handlers: {
    requests: {},
    messages: {
      logToWebview: ({ msg }) => {
        console.log("Message from bun:", msg);
      },
    },
  },
});

export const electroview = new Electroview({ rpc: webviewRpc });
