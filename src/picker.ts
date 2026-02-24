/**
 * Interactive arrow-key session picker for the terminal.
 * Compact single-line per entry, ↑/↓ navigation, matching questionary style.
 */

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
	// Collapse whitespace/newlines in summary, truncate
	let summary = s.summary.replace(/\s+/g, " ").trim();
	if (summary.length > summaryWidth) {
		summary = `${summary.slice(0, summaryWidth - 3)}...`;
	}
	return `${date}  ${size}  ${summary}`;
}

/** Interactive arrow-key picker. Returns selected session or null if cancelled. */
export function pickSession(sessions: SessionInfo[]): Promise<SessionInfo | null> {
	return new Promise((resolve) => {
		if (!process.stdin.isTTY) {
			resolve(null);
			return;
		}

		const width = process.stdout.columns || 100;
		// 2 (prefix) + 16 (date) + 2 + 7 (size) + 2 = 29 fixed chars
		const summaryWidth = Math.max(20, width - 29);
		const lines = sessions.map((s) => formatSessionLine(s, summaryWidth));

		let selected = 0;

		const dim = "\x1b[2m";
		const reset = "\x1b[0m";
		const bold = "\x1b[1m";
		const cyan = "\x1b[36m";
		const green = "\x1b[32m";
		const hide = "\x1b[?25l";
		const show = "\x1b[?25h";

		function render() {
			if (rendered) {
				// Move cursor up to overwrite
				process.stdout.write(`\x1b[${lines.length + 1}A\x1b[0J`);
			}

			process.stdout.write(
				`${green}?${reset} ${bold}Select a session to convert:${reset} ${dim}(Use arrow keys)${reset}\n`,
			);

			for (let i = 0; i < lines.length; i++) {
				if (i === selected) {
					process.stdout.write(`${cyan} » ${lines[i]}${reset}\n`);
				} else {
					process.stdout.write(`${dim}   ${lines[i]}${reset}\n`);
				}
			}
		}

		let rendered = false;
		process.stdout.write(hide);
		render();
		rendered = true;

		process.stdin.setRawMode(true);
		process.stdin.resume();
		process.stdin.setEncoding("utf8");

		function cleanup() {
			process.stdin.setRawMode(false);
			process.stdin.pause();
			process.stdin.removeListener("data", onKey);
			process.stdout.write(show);
		}

		function onKey(key: string) {
			if (key === "\x03") {
				// Ctrl+C
				cleanup();
				process.stdout.write("\n");
				process.exit(0);
			}

			if (key === "q" || (key === "\x1b" && key.length === 1)) {
				cleanup();
				process.stdout.write("\n");
				resolve(null);
				return;
			}

			if (key === "\r" || key === "\n") {
				cleanup();
				// Clear the picker and show the selection
				process.stdout.write(`\x1b[${lines.length + 1}A\x1b[0J`);
				process.stdout.write(
					`${green}?${reset} ${bold}Select a session to convert:${reset} ${cyan}${lines[selected]}${reset}\n`,
				);
				resolve(sessions[selected]);
				return;
			}

			if (key === "\x1b[A" || key === "k") {
				if (selected > 0) {
					selected--;
					render();
				}
				return;
			}

			if (key === "\x1b[B" || key === "j") {
				if (selected < lines.length - 1) {
					selected++;
					render();
				}
				return;
			}
		}

		process.stdin.on("data", onKey);
	});
}
