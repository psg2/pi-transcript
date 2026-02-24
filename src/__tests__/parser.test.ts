import { describe, expect, test } from "bun:test";
import { extractTextFromContent, groupConversations } from "../parser";

describe("extractTextFromContent", () => {
	test("extracts text from string", () => {
		expect(extractTextFromContent("hello world")).toBe("hello world");
	});

	test("extracts text from content blocks", () => {
		const content = [
			{ type: "text", text: "hello" },
			{ type: "thinking", thinking: "hmm" },
			{ type: "text", text: "world" },
		];
		expect(extractTextFromContent(content)).toBe("hello world");
	});

	test("returns empty string for empty input", () => {
		expect(extractTextFromContent([])).toBe("");
		expect(extractTextFromContent("")).toBe("");
		expect(extractTextFromContent(null)).toBe("");
	});
});

describe("groupConversations", () => {
	test("groups messages into conversations starting at user messages", () => {
		const entries = [
			{
				type: "message" as const,
				id: "1",
				parentId: null,
				timestamp: "2026-01-01T00:00:00Z",
				message: { role: "user" as const, content: [{ type: "text" as const, text: "Hello" }] },
			},
			{
				type: "message" as const,
				id: "2",
				parentId: "1",
				timestamp: "2026-01-01T00:00:01Z",
				message: {
					role: "assistant" as const,
					content: [{ type: "text" as const, text: "Hi there" }],
					model: "claude-sonnet-4-6",
					usage: {
						input: 10,
						output: 5,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 15,
						cost: { input: 0.01, output: 0.005, cacheRead: 0, cacheWrite: 0, total: 0.015 },
					},
				},
			},
		];

		const convs = groupConversations(entries);
		expect(convs).toHaveLength(1);
		expect(convs[0].userText).toBe("Hello");
		expect(convs[0].model).toBe("claude-sonnet-4-6");
		expect(convs[0].totalCost).toBeCloseTo(0.015);
	});

	test("creates separate conversations for each user message", () => {
		const entries = [
			{
				type: "message" as const,
				id: "1",
				parentId: null,
				timestamp: "2026-01-01T00:00:00Z",
				message: { role: "user" as const, content: [{ type: "text" as const, text: "First" }] },
			},
			{
				type: "message" as const,
				id: "2",
				parentId: "1",
				timestamp: "2026-01-01T00:00:01Z",
				message: {
					role: "assistant" as const,
					content: [{ type: "text" as const, text: "Response 1" }],
				},
			},
			{
				type: "message" as const,
				id: "3",
				parentId: "2",
				timestamp: "2026-01-01T00:01:00Z",
				message: { role: "user" as const, content: [{ type: "text" as const, text: "Second" }] },
			},
		];

		const convs = groupConversations(entries);
		expect(convs).toHaveLength(2);
		expect(convs[0].userText).toBe("First");
		expect(convs[1].userText).toBe("Second");
	});
});
