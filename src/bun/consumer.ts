import {discoverUPnPDevices} from "./ssdp" 

const devices = await discoverUPnPDevices( {timeout : 4 , debug : true} );
if (!devices || devices.length === 0) {
	console.error("No UPnP devices found");
	process.exit(1);
}

console.log(devices[0].location);
const loc = devices[0].location;
if (!loc) {
	console.error("Device has no location URL");
	process.exit(1);
}
const deviceInfo = await fetch(loc).then(res => res.text());
const match = deviceInfo.match(/<friendlyName>([^<]+)<\/friendlyName>/i);
const deviceName = match ? match[1] : "Unknown";
console.log(deviceName);
