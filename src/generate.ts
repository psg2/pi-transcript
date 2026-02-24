import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { groupConversations, parseSessionFile } from "./parser";
import { PROMPTS_PER_PAGE, generateIndexHtml, generatePageHtml } from "./renderer";
import { getProjectName } from "./sessions";
import type { GenerationResult } from "./types";

/** Generate HTML transcript from a pi session file */
export function generateTranscript(
	sessionPath: string,
	outputDir: string,
	options: { projectName?: string } = {},
): GenerationResult {
	mkdirSync(outputDir, { recursive: true });

	const { header, entries } = parseSessionFile(sessionPath);

	// Determine project name
	let projectName = options.projectName || null;
	if (!projectName) {
		const parentFolder = basename(dirname(sessionPath));
		if (parentFolder.startsWith("--")) {
			projectName = getProjectName(parentFolder);
		} else if (header?.cwd) {
			const parts = header.cwd.split("/").filter(Boolean);
			projectName = parts.slice(-2).join("/");
		}
	}

	const conversations = groupConversations(entries);
	const totalConvs = conversations.length;
	const totalPages = Math.max(1, Math.ceil(totalConvs / PROMPTS_PER_PAGE));

	// Generate paginated transcript pages
	for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
		const startIdx = (pageNum - 1) * PROMPTS_PER_PAGE;
		const endIdx = Math.min(startIdx + PROMPTS_PER_PAGE, totalConvs);
		const pageConvs = conversations.slice(startIdx, endIdx);

		const html = generatePageHtml(pageNum, totalPages, pageConvs, projectName);
		const filename = `page-${String(pageNum).padStart(3, "0")}.html`;
		writeFileSync(join(outputDir, filename), html, "utf-8");
	}

	// Generate index page
	const indexHtml = generateIndexHtml(conversations, totalPages, header, projectName);
	writeFileSync(join(outputDir, "index.html"), indexHtml, "utf-8");

	return {
		pages: totalPages,
		prompts: totalConvs,
		outputDir,
		projectName,
	};
}
