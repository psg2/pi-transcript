import { readFileSync } from "node:fs";
import type {
	AssistantMessage,
	ContentBlock,
	Conversation,
	MessageEntry,
	ParsedSession,
	SessionEntry,
	SessionHeader,
} from "./types";

/** Parse a pi session JSONL file */
export function parseSessionFile(filepath: string): ParsedSession {
	const content = readFileSync(filepath, "utf-8");
	const lines = content.split("\n").filter((l) => l.trim());

	let header: SessionHeader | null = null;
	const entries: SessionEntry[] = [];

	for (const line of lines) {
		try {
			const obj = JSON.parse(line) as SessionEntry;
			if (obj.type === "session") {
				header = obj as SessionHeader;
			} else {
				entries.push(obj);
			}
		} catch {
			// skip malformed lines
		}
	}

	return { header, entries };
}

/** Extract plain text from content blocks */
export function extractTextFromContent(content: ContentBlock[] | string | unknown): string {
	if (typeof content === "string") return content.trim();
	if (!Array.isArray(content)) return "";
	const texts: string[] = [];
	for (const block of content) {
		if (
			typeof block === "object" &&
			block !== null &&
			"type" in block &&
			block.type === "text" &&
			"text" in block &&
			typeof block.text === "string"
		) {
			texts.push(block.text);
		}
	}
	return texts.join(" ").trim();
}

/** Get a quick summary from entries (first user message text) */
export function getSessionSummary(entries: SessionEntry[], maxLength = 120): string {
	for (const entry of entries) {
		if (entry.type !== "message") continue;
		const msg = (entry as MessageEntry).message;
		if (!msg || msg.role !== "user") continue;
		const text = extractTextFromContent(msg.content);
		if (text) {
			return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
		}
	}
	return "(no summary)";
}

/** Group entries into conversations, each starting with a user message */
export function groupConversations(entries: SessionEntry[]): Conversation[] {
	const conversations: Conversation[] = [];
	let current: Conversation | null = null;

	for (const entry of entries) {
		if (entry.type === "model_change" || entry.type === "thinking_level_change") {
			if (current) current.messages.push(entry);
			continue;
		}

		if (entry.type !== "message") continue;
		const msgEntry = entry as MessageEntry;
		const msg = msgEntry.message;
		if (!msg) continue;

		if (msg.role === "user") {
			if (current) conversations.push(current);
			const text = extractTextFromContent(msg.content);
			current = {
				userText: text || "(empty prompt)",
				timestamp: msgEntry.timestamp,
				messages: [entry],
				model: null,
				totalCost: 0,
				toolCounts: {},
			};
		} else if (current) {
			current.messages.push(entry);

			if (msg.role === "assistant") {
				const assistantMsg = msg as AssistantMessage;
				if (assistantMsg.model) current.model = assistantMsg.model;
				if (assistantMsg.usage?.cost?.total) {
					current.totalCost += assistantMsg.usage.cost.total;
				}

				if (Array.isArray(assistantMsg.content)) {
					for (const block of assistantMsg.content) {
						if (
							typeof block === "object" &&
							block !== null &&
							"type" in block &&
							block.type === "toolCall" &&
							"name" in block
						) {
							const name = (block as { name: string }).name || "unknown";
							current.toolCounts[name] = (current.toolCounts[name] || 0) + 1;
						}
					}
				}
			}
		}
	}

	if (current) conversations.push(current);
	return conversations;
}
