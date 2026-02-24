/** Pi session header (first line of JSONL) */
export interface SessionHeader {
	type: "session";
	version: number;
	id: string;
	timestamp: string;
	cwd: string;
}

/** Model change entry */
export interface ModelChangeEntry {
	type: "model_change";
	id: string;
	parentId: string | null;
	timestamp: string;
	provider: string;
	modelId: string;
}

/** Thinking level change entry */
export interface ThinkingLevelChangeEntry {
	type: "thinking_level_change";
	id: string;
	parentId: string | null;
	timestamp: string;
	thinkingLevel: string;
}

/** Cost breakdown */
export interface CostBreakdown {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	total: number;
}

/** Token usage */
export interface Usage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	cost: CostBreakdown;
}

/** Content block types */
export interface TextBlock {
	type: "text";
	text: string;
}

export interface ThinkingBlock {
	type: "thinking";
	thinking: string;
	thinkingSignature?: string;
}

export interface ToolCallBlock {
	type: "toolCall";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
}

export interface ImageBlock {
	type: "image";
	source?: {
		media_type?: string;
		data?: string;
	};
}

export type ContentBlock = TextBlock | ThinkingBlock | ToolCallBlock | ImageBlock;

/** User message */
export interface UserMessage {
	role: "user";
	content: ContentBlock[];
	timestamp?: number;
}

/** Assistant message */
export interface AssistantMessage {
	role: "assistant";
	content: ContentBlock[];
	api?: string;
	provider?: string;
	model?: string;
	usage?: Usage;
	stopReason?: string;
	timestamp?: number;
}

/** Tool result message */
export interface ToolResultMessage {
	role: "toolResult";
	toolCallId: string;
	toolName: string;
	content: ContentBlock[] | string;
	isError?: boolean;
	timestamp?: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

/** A message entry in the session */
export interface MessageEntry {
	type: "message";
	id: string;
	parentId: string | null;
	timestamp: string;
	message: Message;
}

/** Any session entry */
export type SessionEntry =
	| SessionHeader
	| ModelChangeEntry
	| ThinkingLevelChangeEntry
	| MessageEntry
	| { type: string };

/** Parsed session data */
export interface ParsedSession {
	header: SessionHeader | null;
	entries: SessionEntry[];
}

/** A grouped conversation (user prompt + all responses) */
export interface Conversation {
	userText: string;
	timestamp: string;
	messages: SessionEntry[];
	model: string | null;
	totalCost: number;
	toolCounts: Record<string, number>;
}

/** Session discovery info */
export interface SessionInfo {
	path: string;
	filename: string;
	project: string;
	mtime: Date;
	size: number;
	summary: string;
}

/** Project with sessions */
export interface ProjectInfo {
	project: string;
	projectFolder: string;
	sessions: SessionInfo[];
}

/** Generation result */
export interface GenerationResult {
	pages: number;
	prompts: number;
	outputDir: string;
	projectName: string | null;
}
