import { access } from "node:fs/promises";
import path from "node:path";

async function pathExists(candidate: string): Promise<boolean> {
	try {
		await access(candidate);
		return true;
	} catch {
		return false;
	}
}

export async function resolveFfmpegPath(): Promise<string> {
	const execDir = path.dirname(process.execPath);
	const execParentDir = path.dirname(execDir);
	const moduleDir = import.meta.dir;

	const candidates = [
		path.join(process.cwd(), "dependencies", "ffmpeg.exe"),
		path.join(process.cwd(), "ffmpeg.exe"),
		path.join(execDir, "ffmpeg.exe"),
		path.join(execParentDir, "Resources", "app", "bin", "ffmpeg.exe"),
		path.join(moduleDir, "ffmpeg.exe"),
		path.join(moduleDir, "..", "bin", "ffmpeg.exe"),
		path.join(moduleDir, "..", "..", "bin", "ffmpeg.exe"),
	];

	for (const candidate of candidates) {
		if (await pathExists(candidate)) {
			return path.resolve(candidate);
		}
	}

	throw new Error(`Unable to find ffmpeg.exe. Searched: ${candidates.join(", ")}`);
}
