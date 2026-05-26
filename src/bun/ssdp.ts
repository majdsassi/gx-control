// packages/upnp-discovery/src/index.ts

import dgram from "node:dgram";

export interface UPnPDevice {
  ip: string;
  location?: string;
  server?: string;
  usn?: string;
  st?: string;
}

export interface DiscoveryOptions {
  timeout?: number;
  mx?: number;
  searchTarget?: string;
  debug?: boolean;
}

const SSDP_ADDR = "239.255.255.250";
const SSDP_PORT = 1900;

/**
 * Discover UPnP devices on the local network.
 */
export async function discoverUPnPDevices(
  options: DiscoveryOptions = {}
): Promise<UPnPDevice[]> {
  const {
    timeout = 5,
    mx = 2,
    searchTarget = "upnp:rootdevice",
    debug = false,
  } = options;

  const devices: UPnPDevice[] = [];
  const seen = new Set<string>();

  const socket = dgram.createSocket("udp4");

  const message =
    "M-SEARCH * HTTP/1.1\r\n" +
    `HOST: ${SSDP_ADDR}:${SSDP_PORT}\r\n` +
    'MAN: "ssdp:discover"\r\n' +
    `MX: ${mx}\r\n` +
    `ST: ${searchTarget}\r\n` +
    "\r\n";

  return new Promise((resolve, reject) => {
    socket.on("message", (msg, rinfo) => {
      const response = msg.toString();

      if (!response.includes("200 OK")) {
        return;
      }

      const location =
        response.match(/^LOCATION:\s*(.+)$/im)?.[1]?.trim();

      const server =
        response.match(/^SERVER:\s*(.+)$/im)?.[1]?.trim();

      const usn =
        response.match(/^USN:\s*(.+)$/im)?.[1]?.trim();

      const st =
        response.match(/^ST:\s*(.+)$/im)?.[1]?.trim();

      // Strong dedupe
      const dedupeKey =
        usn ||
        location ||
        `${rinfo.address}`;

      if (seen.has(dedupeKey)) {
        return;
      }

      seen.add(dedupeKey);

      const device: UPnPDevice = {
        ip: rinfo.address,
        location,
        server,
        usn,
        st,
      };

      devices.push(device);

      if (debug) {
        console.log(`\n[UPnP] Found Device`);
        console.log(`  IP: ${device.ip}`);

        if (device.server) {
          console.log(`  Server: ${device.server}`);
        }

        if (device.location) {
          console.log(`  Location: ${device.location}`);
        }

        if (device.usn) {
          console.log(`  USN: ${device.usn}`);
        }
      }
    });

    socket.on("error", (err) => {
      socket.close();
      reject(err);
    });

    socket.bind(() => {
      socket.setBroadcast(true);
      socket.setMulticastTTL(2);

      socket.send(
        new TextEncoder().encode(message),
        SSDP_PORT,
        SSDP_ADDR,
        (err) => {
          if (err) {
            reject(err);
          }
        }
      );
    });

    setTimeout(() => {
      socket.close();
      resolve(devices);
    }, timeout * 1000);
  });
}