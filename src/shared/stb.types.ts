import { RPCSchema } from "electrobun";

export interface Channel {
  ServiceID: string;
  ServiceName: string;
  Scramble: number;
  Radio: number;
  HD: number;
  VideoPID: number;
  PMTPID: number;
  TTXPID: number;
  AudioArray: Array<{ PID: number }>;
  ModulationSystem: number;
  ModulationType: number;
  RollOff: number;
  PilotTones: number;
}

export interface TPModel {
  TPIndex: number;
  SatIndex: number;
  Freq: number;
  POL: number;
  SR: number;
  FEC: number;
}

export interface DeviceInfo {
  StbStatus: number;
  ProductName: string;
  SoftwareVersion: string;
  SerialNumber: string;
  ChannelNum: number;
  MaxNumOfPrograms: number;
}

export interface ButtonRequest {
  request: string;
  array: Array<{ KeyValue: string }>;
}


export type DeviceRPCType = {
  bun: RPCSchema<{
    requests: {
      getDeviceInfo: {
        params: {
        };
        response: DeviceInfo;
      } , 
      getChannelsByRange: {
        params: {
          start: number;
          end: number;
        };
        response: Array<Channel>;
      }
    };
    messages: {
      logToBun: {
        msg: string;
      };
    };
  }>;

  webview: RPCSchema<{
    requests: {};
    messages: {
      logToWebview: {
        msg: string;
      };
    };
  }>;
}