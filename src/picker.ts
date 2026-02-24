/**
 * Interactive session picker using @inquirer/select.
 */

import select from "@inquirer/select";
import type { SessionInfo } from "./types";

function formatSize(bytes: number): string {
	const kb = bytes / 1024;
	if (kb >= 1024) return `${(kb / 1024).toFixed(0)} MB`;
	return `${kb.toFixed(0)} KB`;
}

function formatDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	const h = String(date.getHours()).padStart(2, "0");
	const min = String(date.getMinutes()).padStart(2, "0");
	return `${y}-${m}-${d} ${h}:${min}`;
}

/** Format a session as a compact single-line display string */
export function formatSessionLine(s: SessionInfo, summaryWidth: number): string {
	const date = formatDate(s.mtime);
	const size = formatSize(s.size).padStart(7);
	const project = s.project.length > 20 ? `${s.project.slice(0, 17)}...` : s.project;
	const projectPad = project.padEnd(20);
	let summary = s.summary.replace(/\s+/g, " ").trim();
	if (summary.length > summaryWidth) {
		summary = `${summary.slice(0, summaryWidth - 3)}...`;
	}
	return `${date}  ${size}  ${projectPad}  ${summary}`;
}

/** Interactive arrow-key picker. Returns selected session or null if cancelled. */
export async function pickSession(sessions: SessionInfo[]): Promise<SessionInfo | null> {
	const width = process.stdout.columns || 120;
	// 4 (inquirer prefix) + 16 (date) + 2 + 7 (size) + 2 + 20 (project) + 2 = 53 fixed
	const summaryWidth = Math.max(20, width - 55);

	const choices = sessions.map((s) => ({
		name: formatSessionLine(s, summaryWidth),
		value: s,
	}));

	try {
		const selected = await select({
			message: "Select a session to convert:",
			choices,
			loop: false,
		});
		return selected;
	} catch {
		// User pressed Ctrl+C or Escape
		return null;
	}
}
