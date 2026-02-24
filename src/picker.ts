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
	let summary = s.summary.replace(/\s+/g, " ").trim();
	if (summary.length > summaryWidth) {
		summary = `${summary.slice(0, summaryWidth - 3)}...`;
	}
	return `${date}  ${size}  ${summary}`;
}

/** Interactive arrow-key picker. Returns selected session or null if cancelled. */
export async function pickSession(sessions: SessionInfo[]): Promise<SessionInfo | null> {
	const width = process.stdout.columns || 100;
	// 4 chars for inquirer prefix ("» " or "  "), rest for content
	const summaryWidth = Math.max(20, width - 33);

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
