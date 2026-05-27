import net from 'net';
import zlib from 'zlib';
import type { ButtonRequest, Channel, DeviceInfo, TPModel } from './stb.types';

const CHANNEL_PAGE_SIZE = 100;


const appendBytes = (
  left: Uint8Array<ArrayBufferLike>,
  right: Uint8Array<ArrayBufferLike>
): Uint8Array<ArrayBufferLike> => {
  const combined = new Uint8Array(left.length + right.length);
  combined.set(left);
  combined.set(right, left.length);
  return combined;
};

const toUint8Array = (buffer: Buffer): Uint8Array<ArrayBufferLike> => {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};

const Ali = {
  _decompress: (buffer: Uint8Array<ArrayBufferLike>, handler: (result?: string) => void): void => {
    zlib.unzip(buffer, (err: Error | null, result: Buffer) => {
      if (err) {
        handler();
      } else {
        handler(result.toString());
      }
    });
  },

  _alibuffer: (buffer: string): string => {
    return "Start" + ("0000000" + buffer.length).slice(-7) + "End" + buffer;
  },

  _alijson: (json: any): string => {
    return Ali._alibuffer(JSON.stringify(json));
  },

  _requestBytes: 0,
  _responseBytes: 0,
  _debug: true,
  socket: null as net.Socket | null,
  ondata: null as ((data: Buffer) => void) | null,

  connect: (url: string, port: number): Promise<void> => new Promise((resolve, reject) => {
    Ali.socket = new net.Socket();
    Ali.socket.connect(port, url, () => {
      if (!Ali.socket) return;
      let handshakeBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
      
      Ali.socket.write(Ali._alibuffer("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><Command request=\"998\" />"));
      Ali.socket.on('data', (data: Buffer) => {
        if (Ali.ondata) Ali.ondata(data);
      });
      Ali.socket.on('close', () => console.log('Connection closed'));

      Ali.ondata = (data: Buffer) => {
        handshakeBuffer = appendBytes(handshakeBuffer, toUint8Array(data));
        if (handshakeBuffer.length < 108) {
          return;
        }

        Ali.ondata = null;
        if (handshakeBuffer[0] === 0x5b) {
          resolve();
        } else {
          reject("Invalid response packet");
        }
      };
    });
  }),

  disconnect: (): Promise<void> => new Promise((resolve) => {
    if (Ali.socket) {
      Ali.socket.end();
    }
    resolve();
  }),

  request: (id: number | string): Promise<string> => Ali.requestRaw(Ali._alijson({ request: "" + id })),
  
  requestJson: (json: any): Promise<string> => Ali.requestRaw(Ali._alijson(json)),
  
  requestRaw: (reqdata: string): Promise<string> => new Promise((resolve, reject) => {
    if (Ali._debug) {
      console.log(reqdata);
    }
    
    if (!Ali.socket) {
      reject("No socket connection");
      return;
    }
    
    Ali.socket.write(reqdata);
    
    let packetBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
    let expectedPayloadBytes: number | null = null;

    Ali.ondata = (data: Buffer) => {
      packetBuffer = appendBytes(packetBuffer, toUint8Array(data));

      if (expectedPayloadBytes === null) {
        if (packetBuffer.length < 16) {
          return;
        }

        if (
          packetBuffer[0] !== 0x47 ||
          packetBuffer[1] !== 0x43 ||
          packetBuffer[2] !== 0x44 ||
          packetBuffer[3] !== 0x48
        ) {
          Ali.ondata = null;
          reject('Invalid response packet');
          return;
        }

        expectedPayloadBytes = packetBuffer[4] + packetBuffer[5] * 256;
        Ali._requestBytes = expectedPayloadBytes;
        packetBuffer = packetBuffer.subarray(16);

        if (expectedPayloadBytes === 0) {
          Ali.ondata = null;
          resolve('');
          return;
        }

        Ali._responseBytes = 0;
      }

      if (expectedPayloadBytes === null) {
        return;
      }

      if (packetBuffer.length < expectedPayloadBytes) {
        return;
      }

      if (packetBuffer.length > expectedPayloadBytes) {
        Ali.ondata = null;
        reject('Too many bytes ' + packetBuffer.length + ' > ' + expectedPayloadBytes);
        return;
      }

      Ali._responseBytes = packetBuffer.length;
      Ali.ondata = null;

      const raw = packetBuffer;

      if (Ali._debug) {
        console.log('done');
      }

      Ali._decompress(raw, (result?: string) => {
        if (result !== undefined) {
          resolve(result);
        } else {
          reject('Decompression failed');
        }
      });
    };
  })
};

const AliTv = {
  _channels: null as Channel[] | null,
  _deviceInfo: null as DeviceInfo[] | null,
  _channelCount: 0,
  _currentChannelId: null as string | null,
  _channelPages: new Map<string, Channel[]>(),
  _channelPageRequests: new Map<string, Promise<Channel[]>>(),

  _pageKey: (startIndex: number, pageSize: number): string => `${startIndex}:${pageSize}`,

  _normalizePageStart: (startIndex: number, pageSize: number): number => {
    if (pageSize <= 0) {
      return 0;
    }

    return Math.max(0, Math.floor(startIndex / pageSize) * pageSize);
  },

  resetChannelCache: (): void => {
    AliTv._channels = null;
    AliTv._currentChannelId = null;
    AliTv._channelPages.clear();
    AliTv._channelPageRequests.clear();
  },

  getTpByServiceId: (ServiceId: string): Promise<TPModel> => {
    const RequestTpModels = 24;
    const TPIndex = parseInt(ServiceId.substring(4, 9), 10);

    return Ali.request(RequestTpModels)
      .then((json: string) => new Promise<TPModel>((resolve, reject) => {
        const parsedJson = JSON.parse(json) as TPModel[];
        for (const item of parsedJson) {
          if (item.TPIndex === TPIndex) {
            resolve(item);
            return;
          }
        }
        reject("Cannot find tp " + ServiceId + " index=" + TPIndex);
      }));
  },

  buildStreamUrl: (channelModel: Channel, tpModel: TPModel): string => {
    return "?alisatid=" + tpModel.SatIndex + "&" +
      "freq=" + tpModel.Freq + "&" +
      "pol=" + (tpModel.POL ? "v" : "h") + "&" +
      "msys=" + (channelModel.ModulationSystem === 0 ? "dvbs" : "dvbs2") + "&" +
      "mtype=" + (channelModel.ModulationType === 0 ? "qpsk" : "8psk") + "&" +
      "ro=" + (channelModel.RollOff / 100).toFixed(2) + "&" +
      "plts=" + (channelModel.PilotTones === 0 ? "off" : "on") + "&" +
      "sr=" + tpModel.SR + "&" +
      "fec=" + tpModel.FEC + "&" +
      "camode=" + channelModel.Scramble + "&" +
      "vpid=" + channelModel.VideoPID + "&" +
      "apid=" + channelModel.AudioArray[0].PID + "&" +
      "ttxpid=" + channelModel.TTXPID + "&" +
      "subtpid=" + "0" + "&" +
      "pmt=" + channelModel.PMTPID + "&" +
      "prognumber=" + channelModel.ServiceID.slice(-4) + "&" +
      "pids=" + [channelModel.VideoPID, channelModel.AudioArray[0].PID, channelModel.TTXPID, "0", channelModel.PMTPID].join(",") + "&" +
      "mask";
  },

  getStreamUrl: (ServiceName: string): Promise<string> => {
    let _channel: Channel | null = null;
    let _tp: TPModel | null = null;

    return Promise.resolve(AliTv.getChannelByName(ServiceName))
      .then((channel: Channel) => {
        _channel = channel;
        return AliTv.getTpByServiceId(channel.ServiceID);
      })
      .then((tp: TPModel) => {
        _tp = tp;
        return AliTv.buildStreamUrl(_channel!, _tp!);
      });
  },

  requestDeviceInfo: (): Promise<DeviceInfo[]> => 
    Ali.requestJson({ request: "15" }).then((json: string) => {
      const deviceInfo = JSON.parse(json) as DeviceInfo[];
      AliTv._deviceInfo = deviceInfo;
      AliTv._channelCount = deviceInfo[0]?.ChannelNum ?? 0;
      return deviceInfo;
    }),

  requestChannelRange: (fromIndex: number, toIndex: number): Promise<Channel[]> => 
    Ali.requestJson({ request: "0", FromIndex: "" + fromIndex, ToIndex: "" + toIndex })
      .then((json: string) => JSON.parse(json)),

  requestCurrentChannel: (): Promise<any> => 
    Ali.requestJson({ request: "3" }).then((json: string) => {
      const parsed = JSON.parse(json);
      const currentChannelId = parsed?.[0]?.Data;
      if (typeof currentChannelId === "string") {
        AliTv._currentChannelId = currentChannelId;
      }
      return parsed;
    }),

  requestButton: (id: number): Promise<any> => {
    const request: ButtonRequest = { request: "1040", array: [{ KeyValue: "" + id }] };
    return Ali.requestJson(request).then((json: string) => JSON.parse(json));
  },

  getChannelsPage: async (startIndex: number, pageSize = CHANNEL_PAGE_SIZE, forceRefresh = false): Promise<Channel[]> => {
    const normalizedStart = AliTv._normalizePageStart(startIndex, pageSize);
    const totalCount = AliTv._channelCount > 0 ? AliTv._channelCount : (await AliTv.requestDeviceInfo())[0]?.ChannelNum ?? 0;
    const normalizedPageSize = Math.max(1, pageSize);
    const normalizedEnd = Math.min(normalizedStart + normalizedPageSize - 1, totalCount > 0 ? totalCount - 1 : normalizedStart + normalizedPageSize - 1);
    const cacheKey = AliTv._pageKey(normalizedStart, normalizedPageSize);

    if (!forceRefresh && AliTv._channelPages.has(cacheKey)) {
      return AliTv._channelPages.get(cacheKey) || [];
    }

    if (!forceRefresh) {
      const pending = AliTv._channelPageRequests.get(cacheKey);
      if (pending) {
        return pending;
      }
    }

    const request = AliTv.requestChannelRange(normalizedStart, normalizedEnd)
      .then((channels: Channel[]) => {
        AliTv._channelPages.set(cacheKey, channels);
        if (normalizedStart === 0) {
          AliTv._channels = channels;
        }
        return channels;
      })
      .finally(() => {
        AliTv._channelPageRequests.delete(cacheKey);
      });

    AliTv._channelPageRequests.set(cacheKey, request);
    return request;
  },

  getChannelPageResponse: async (startIndex: number, pageSize = CHANNEL_PAGE_SIZE, forceRefresh = false): Promise<{
    channels: Channel[];
    startIndex: number;
    pageSize: number;
    totalCount: number;
    currentChannelId?: string;
  }> => {
    const channels = await AliTv.getChannelsPage(startIndex, pageSize, forceRefresh);
    const normalizedStart = AliTv._normalizePageStart(startIndex, pageSize);
    const normalizedPageSize = Math.max(1, pageSize);
    const totalCount = AliTv._channelCount > 0 ? AliTv._channelCount : (await AliTv.requestDeviceInfo())[0]?.ChannelNum ?? 0;

    return {
      channels,
      startIndex: normalizedStart,
      pageSize: normalizedPageSize,
      totalCount,
      currentChannelId: AliTv._currentChannelId ?? undefined,
    };
  },

  getAllCachedChannels: (): Channel[] => {
    const cachedPages = [...AliTv._channelPages.entries()]
      .sort(([left], [right]) => {
        const leftStart = parseInt(left.split(":")[0], 10);
        const rightStart = parseInt(right.split(":")[0], 10);
        return leftStart - rightStart;
      })
      .flatMap(([, channels]) => channels);

    if (cachedPages.length > 0) {
      return cachedPages;
    }

    return AliTv._channels || [];
  },

  getChannels: async (): Promise<Channel[]> => {
    return AliTv.getAllCachedChannels();
  },

  getCachedChannels: (): Channel[] => {
    return AliTv.getAllCachedChannels();
  },

  getCurrentChannel: async (): Promise<string> => {
    const json = await AliTv.requestCurrentChannel();
    return AliTv.getChannelById(json[0].Data).ServiceName;
  },

  getChannelById: (id: string): Channel => {
    const channels = AliTv.getAllCachedChannels();
    for (const channel of channels) {
      if (channel.ServiceID === id) {
        return channel;
      }
    }
    throw new Error("Channel not found");
  },

  getChannelByName: (name: string): Channel => {
    const channels = AliTv.getAllCachedChannels();
    for (const channel of channels) {
      if (channel.ServiceName === name) {
        return channel;
      }
    }
    throw new Error("Channel not found");
  },

  getFreeChannels: (): string[] => {
    const free: string[] = [];
    const channels = AliTv.getAllCachedChannels();

    for (const channel of channels) {
      if (channel.Scramble === 0 && channel.Radio === 0) {
        free.push(channel.ServiceName);
      }
    }
    return free;
  },

  getHdChannels: (): string[] => {
    const hd: string[] = [];
    const channels = AliTv.getAllCachedChannels();

    for (const channel of channels) {
      if (channel.HD === 1) {
        hd.push(channel.ServiceName);
      }
    }
    return hd;
  },

  startHttpStream: (channelId: string): Promise<{ success?: string; url?: string }[]> => {
    return Ali.requestJson({ request: "1009", TvState: "0", ProgramId: channelId })
      .then((json: string) => {
        console.log(json);
        return JSON.parse(json) as { success?: string; url?: string }[];
      });

  }
};

// Example usage
/*const root = "192.168.1.117";

// Connect and get channels example
Ali.connect(root, 20000)
  .then(() => AliTv.getChannels())
  .then((channels) => {
    console.log(`Loaded ${channels.length} channels`);
    return AliTv.getCurrentChannel();
  })
  .then((currentChannel) => {
    console.log("Current channel:", currentChannel);
    return Ali.disconnect();
  })
  .catch((e) => console.log("Error: " + e));
*/
export { Ali, AliTv };