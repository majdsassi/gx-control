import net from 'net';
import zlib from 'zlib';
import type { ButtonRequest, Channel, DeviceInfo, TPModel } from './stb.types';


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
    Ali.requestJson({ request: "15" }).then((json: string) => JSON.parse(json) as DeviceInfo[]),

  requestChannelRange: (fromIndex: number, toIndex: number): Promise<Channel[]> => 
    Ali.requestJson({ request: "0", FromIndex: "" + fromIndex, ToIndex: "" + toIndex })
      .then((json: string) => JSON.parse(json)),

  requestCurrentChannel: (): Promise<any> => 
    Ali.requestJson({ request: "3" }).then((json: string) => JSON.parse(json)),

  requestButton: (id: number): Promise<any> => {
    const request: ButtonRequest = { request: "1040", array: [{ KeyValue: "" + id }] };
    return Ali.requestJson(request).then((json: string) => JSON.parse(json));
  },

  getChannels: (): Promise<Channel[]> => {
    AliTv._channels = [];

    return AliTv.requestDeviceInfo()
      .then(() => {
        return AliTv.requestChannelRange(0, 99);
      })
      .then((subChannels: Channel[]) => {
        AliTv._channels = (AliTv._channels || []).concat(subChannels);
        return AliTv.requestChannelRange(100, 199);
      })
      .then((subChannels: Channel[]) => {
        AliTv._channels = (AliTv._channels || []).concat(subChannels);
        return AliTv.requestChannelRange(200, 280);
      })
      .then((subChannels: Channel[]) => {
        AliTv._channels = (AliTv._channels || []).concat(subChannels);
        return AliTv._channels;
      });
  },

  getCurrentChannel: (): Promise<string> => {
    return AliTv.requestCurrentChannel()
      .then((json: any) => AliTv.getChannelById(json[0].Data).ServiceName);
  },

  getChannelById: (id: string): Channel => {
    if (!AliTv._channels) throw new Error("Channels not loaded");
    for (const channel of AliTv._channels) {
      if (channel.ServiceID === id) {
        return channel;
      }
    }
    throw new Error("Channel not found");
  },

  getChannelByName: (name: string): Channel => {
    if (!AliTv._channels) throw new Error("Channels not loaded");
    for (const channel of AliTv._channels) {
      if (channel.ServiceName === name) {
        return channel;
      }
    }
    throw new Error("Channel not found");
  },

  getFreeChannels: (): string[] => {
    const free: string[] = [];
    const channels = AliTv._channels;
    if (!channels) return free;
    
    for (const channel of channels) {
      if (channel.Scramble === 0 && channel.Radio === 0) {
        free.push(channel.ServiceName);
      }
    }
    return free;
  },

  getHdChannels: (): string[] => {
    const hd: string[] = [];
    const channels = AliTv._channels;
    if (!channels) return hd;
    
    for (const channel of channels) {
      if (channel.HD === 1) {
        hd.push(channel.ServiceName);
      }
    }
    return hd;
  },

  startHttpStream: (channelId: string): Promise<void> => {
    Ali.requestJson({ request: "1009", TvState: "0", ProgramId: channelId })
      .then((json: string) => console.log(json));
    return Promise.resolve();
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