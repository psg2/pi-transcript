import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ProjectInfo, SessionInfo } from "./types";

const DEFAULT_SESSIONS_DIR = join(homedir(), ".pi", "agent", "sessions");

/** Decode the encoded folder name back to a readable project path */
export function decodeFolderName(name: string): string {
	return name.replace(/^--/, "/").replace(/--$/, "").replace(/-/g, "/");
}

/** Get a short project name from the folder */
export function getProjectName(folderName: string): string {
	const fullPath = decodeFolderName(folderName);
	const parts = fullPath.split("/").filter(Boolean);
	if (parts.length >= 2) return parts.slice(-2).join("/");
	return parts.pop() || folderName;
}

/** Quick peek at the first user message */
function quickSummary(filepath: string, maxLength = 100): string {
	try {
		const content = readFileSync(filepath, "utf-8");
		for (const line of content.split("\n")) {
			if (!line.trim()) continue;
			try {
				const obj = JSON.parse(line);
				if (obj.type !== "message" || obj.message?.role !== "user") continue;
				const blocks = obj.message.content;
				if (!Array.isArray(blocks)) continue;
				for (const block of blocks) {
					if (block?.type === "text" && block.text) {
						const text = block.text.trim();
						return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
					}
				}
			} catch {
				// skip malformed line
			}
		}
	} catch {
		// ignore
	}
	return "(no summary)";
}

/** Find all sessions grouped by project */
export function findAllSessions(sessionsDir = DEFAULT_SESSIONS_DIR): ProjectInfo[] {
	let projectFolders: string[];
	try {
		projectFolders = readdirSync(sessionsDir);
	} catch {
		return [];
	}

	const projects: ProjectInfo[] = [];

	for (const folder of projectFolders) {
		const folderPath = join(sessionsDir, folder);
		try {
			if (!statSync(folderPath).isDirectory()) continue;
		} catch {
			continue;
		}

		const sessions: SessionInfo[] = [];
		let files: string[];
		try {
			files = readdirSync(folderPath);
		} catch {
			continue;
		}

		for (const file of files) {
			if (!file.endsWith(".jsonl")) continue;
			const filePath = join(folderPath, file);
			try {
				const fstat = statSync(filePath);
				sessions.push({
					path: filePath,
					filename: file,
					mtime: fstat.mtime,
					size: fstat.size,
					project: getProjectName(folder),
					summary: quickSummary(filePath),
				});
			} catch {
				// skip unreadable file
			}
		}

		if (sessions.length === 0) continue;
		sessions.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

		projects.push({
			project: getProjectName(folder),
			projectFolder: folder,
			sessions,
		});
	}

	projects.sort((a, b) => b.sessions[0].mtime.getTime() - a.sessions[0].mtime.getTime());
	return projects;
}

/** Find recent sessions across all projects, flattened */
export function findRecentSessions(limit = 15, sessionsDir = DEFAULT_SESSIONS_DIR): SessionInfo[] {
	const projects = findAllSessions(sessionsDir);
	const all: SessionInfo[] = [];

	for (const p of projects) {
		for (const s of p.sessions) {
			all.push(s);
		}
	}

	all.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
	return all.slice(0, limit);
}
