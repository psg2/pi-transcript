/**
 * HTML renderer for pi session transcripts.
 * Generates clean, mobile-friendly HTML with a dark theme.
 */

import { marked } from "marked";
import type { Conversation, MessageEntry, SessionEntry, SessionHeader } from "./types";

// Configure marked
marked.setOptions({ breaks: true, gfm: true });

function esc(text: string | undefined | null): string {
	if (!text) return "";
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function md(text: string | undefined | null): string {
	if (!text) return "";
	return marked.parse(text) as string;
}

function formatCost(cost: number): string {
	if (!cost || cost === 0) return "";
	return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
}

function formatToolStats(toolCounts: Record<string, number>): string {
	const keys = Object.keys(toolCounts);
	if (keys.length === 0) return "";
	return Object.entries(toolCounts)
		.sort((a, b) => b[1] - a[1])
		.map(([name, count]) => `${count} ${name}`)
		.join(" · ");
}

function makeMsgId(timestamp: string): string {
	return `msg-${(timestamp || "").replace(/[:.]/g, "-")}`;
}

// ─── Content Block Renderers ─────────────────────────────────────

function renderThinking(block: { thinking?: string }): string {
	return `<div class="thinking"><div class="thinking-label">💭 Thinking</div>${md(block.thinking)}</div>`;
}

function renderText(block: { text?: string }, role: string): string {
	const html = md(block.text);
	return role === "user"
		? `<div class="user-content">${html}</div>`
		: `<div class="assistant-text">${html}</div>`;
}

function renderToolCall(block: {
	id?: string;
	name?: string;
	arguments?: Record<string, unknown>;
}): string {
	const name = block.name || "Unknown";
	const args = block.arguments || {};
	const toolId = esc(block.id || "");

	if (name === "bash" || name === "Bash") {
		const cmd = (args.command as string) || "";
		return `<div class="tool-use bash-tool" data-tool-id="${toolId}">
<div class="tool-header"><span class="tool-icon">$</span> Bash</div>
<div class="truncatable"><div class="truncatable-content"><pre class="bash-command">${esc(cmd)}</pre></div><button class="expand-btn">Show more</button></div></div>`;
	}

	if (name === "write" || name === "Write") {
		const path = (args.path as string) || (args.file_path as string) || "Unknown file";
		const content = (args.content as string) || "";
		const filename = path.split("/").pop() || path;
		return `<div class="file-tool write-tool" data-tool-id="${toolId}">
<div class="file-tool-header write-header"><span class="file-tool-icon">📝</span> Write <span class="file-tool-path">${esc(filename)}</span></div>
<div class="file-tool-fullpath">${esc(path)}</div>
<div class="truncatable"><div class="truncatable-content"><pre class="file-content">${esc(content)}</pre></div><button class="expand-btn">Show more</button></div></div>`;
	}

	if (name === "edit" || name === "Edit") {
		const path = (args.path as string) || (args.file_path as string) || "Unknown file";
		const oldText = (args.oldText as string) || (args.old_string as string) || "";
		const newText = (args.newText as string) || (args.new_string as string) || "";
		const filename = path.split("/").pop() || path;
		return `<div class="file-tool edit-tool" data-tool-id="${toolId}">
<div class="file-tool-header edit-header"><span class="file-tool-icon">✏️</span> Edit <span class="file-tool-path">${esc(filename)}</span></div>
<div class="file-tool-fullpath">${esc(path)}</div>
<div class="truncatable"><div class="truncatable-content">
<div class="edit-section edit-old"><div class="edit-label">−</div><pre class="edit-content">${esc(oldText)}</pre></div>
<div class="edit-section edit-new"><div class="edit-label">+</div><pre class="edit-content">${esc(newText)}</pre></div>
</div><button class="expand-btn">Show more</button></div></div>`;
	}

	if (name === "read" || name === "Read") {
		const path = (args.path as string) || (args.file_path as string) || "Unknown file";
		const filename = path.split("/").pop() || path;
		let extra = "";
		if (args.offset) extra += ` offset=${args.offset}`;
		if (args.limit) extra += ` limit=${args.limit}`;
		return `<div class="tool-use read-tool" data-tool-id="${toolId}">
<div class="tool-header"><span class="tool-icon">📖</span> Read <span class="file-tool-path">${esc(filename)}</span>${extra ? `<span class="tool-extra">${esc(extra)}</span>` : ""}</div>
<div class="file-tool-fullpath">${esc(path)}</div></div>`;
	}

	if (name === "ask") {
		const questions =
			(args.questions as Array<{
				prompt?: string;
				options?: Array<{ label?: string; value?: string }>;
			}>) || [];
		let html = `<div class="tool-use ask-tool" data-tool-id="${toolId}">
<div class="tool-header"><span class="tool-icon">❓</span> Ask</div>`;
		for (const q of questions) {
			html += `<div class="ask-question"><strong>${esc(q.prompt)}</strong>`;
			if (q.options) {
				html += '<ul class="ask-options">';
				for (const opt of q.options) {
					html += `<li>${esc(opt.label || opt.value)}</li>`;
				}
				html += "</ul>";
			}
			html += "</div>";
		}
		return `${html}</div>`;
	}

	// Generic tool
	const inputJson = JSON.stringify(args, null, 2);
	return `<div class="tool-use" data-tool-id="${toolId}">
<div class="tool-header"><span class="tool-icon">⚙</span> ${esc(name)}</div>
<div class="truncatable"><div class="truncatable-content"><pre class="json">${esc(inputJson)}</pre></div><button class="expand-btn">Show more</button></div></div>`;
}

function renderImage(block: { source?: { media_type?: string; data?: string } }): string {
	const src = block.source;
	if (!src?.data) return "";
	return `<div class="image-block"><img src="data:${src.media_type || "image/png"};base64,${src.data}" style="max-width:100%"></div>`;
}

function renderContentBlocks(content: Array<Record<string, unknown>>, role: string): string {
	if (!Array.isArray(content)) return "";
	return content
		.map((block) => {
			const type = block.type as string;
			switch (type) {
				case "thinking":
					return renderThinking(block as { thinking?: string });
				case "text":
					return renderText(block as { text?: string }, role);
				case "toolCall":
					return renderToolCall(
						block as { id?: string; name?: string; arguments?: Record<string, unknown> },
					);
				case "image":
					return renderImage(block as { source?: { media_type?: string; data?: string } });
				default:
					return `<pre class="json">${esc(JSON.stringify(block, null, 2))}</pre>`;
			}
		})
		.join("");
}

function renderToolResult(entry: MessageEntry): string {
	const msg = entry.message;
	if (msg.role !== "toolResult") return "";
	const isError = msg.isError || false;
	const content = msg.content;
	const errorClass = isError ? " tool-error" : "";

	let contentHtml = "";
	if (typeof content === "string") {
		contentHtml = `<pre>${esc(content)}</pre>`;
	} else if (Array.isArray(content)) {
		for (const block of content) {
			if (typeof block === "object" && block !== null && "type" in block) {
				const b = block as Record<string, unknown>;
				if (b.type === "text") {
					contentHtml += `<pre>${esc(b.text as string)}</pre>`;
				} else if (b.type === "image") {
					contentHtml += renderImage(b as { source?: { media_type?: string; data?: string } });
				}
			}
		}
	}

	if (!contentHtml) {
		contentHtml = `<pre>${esc(JSON.stringify(content, null, 2))}</pre>`;
	}

	return `<div class="tool-result${errorClass}"><div class="truncatable"><div class="truncatable-content">${contentHtml}</div><button class="expand-btn">Show more</button></div></div>`;
}

/** Render a single message entry to HTML */
export function renderMessage(entry: SessionEntry): string {
	if (entry.type !== "message") return "";
	const msgEntry = entry as MessageEntry;
	const msg = msgEntry.message;
	if (!msg) return "";

	const timestamp = msgEntry.timestamp || "";
	const msgId = makeMsgId(timestamp);

	if (msg.role === "user") {
		const contentHtml = renderContentBlocks(msg.content as Array<Record<string, unknown>>, "user");
		if (!contentHtml.trim()) return "";
		return `<div class="message user" id="${msgId}">
<div class="message-header"><span class="role-label">User</span><a href="#${msgId}" class="timestamp-link"><time datetime="${timestamp}" data-timestamp="${timestamp}">${timestamp}</time></a></div>
<div class="message-content">${contentHtml}</div></div>`;
	}

	if (msg.role === "assistant") {
		const contentHtml = renderContentBlocks(
			msg.content as Array<Record<string, unknown>>,
			"assistant",
		);
		if (!contentHtml.trim()) return "";
		const metaParts: string[] = [];
		if (msg.model) metaParts.push(msg.model);
		if (msg.usage?.cost?.total) metaParts.push(formatCost(msg.usage.cost.total));
		if (msg.stopReason && msg.stopReason !== "stop") metaParts.push(msg.stopReason);
		const metaLine = metaParts.length
			? `<span class="meta-info">${esc(metaParts.join(" · "))}</span>`
			: "";

		return `<div class="message assistant" id="${msgId}">
<div class="message-header"><span class="role-label">Assistant</span>${metaLine}<a href="#${msgId}" class="timestamp-link"><time datetime="${timestamp}" data-timestamp="${timestamp}">${timestamp}</time></a></div>
<div class="message-content">${contentHtml}</div></div>`;
	}

	if (msg.role === "toolResult") {
		const contentHtml = renderToolResult(msgEntry);
		if (!contentHtml.trim()) return "";
		return `<div class="message tool-reply" id="${msgId}">
<div class="message-header"><span class="role-label">Tool: ${esc(msg.toolName)}</span><a href="#${msgId}" class="timestamp-link"><time datetime="${timestamp}" data-timestamp="${timestamp}">${timestamp}</time></a></div>
<div class="message-content">${contentHtml}</div></div>`;
	}

	return "";
}

// ─── Page generators ─────────────────────────────────────────────

export const PROMPTS_PER_PAGE = 5;

function renderPagination(currentPage: number, totalPages: number, isIndex = false): string {
	if (totalPages <= 1 && !isIndex) {
		return '<div class="pagination"><a href="index.html" class="index-link">Index</a></div>';
	}

	let html = '<div class="pagination">';
	if (isIndex) {
		html += '<span class="current">Index</span>';
		html += '<span class="disabled">← Prev</span>';
	} else {
		html += '<a href="index.html" class="index-link">Index</a>';
		html +=
			currentPage > 1
				? `<a href="page-${String(currentPage - 1).padStart(3, "0")}.html">← Prev</a>`
				: '<span class="disabled">← Prev</span>';
	}

	for (let p = 1; p <= totalPages; p++) {
		if (!isIndex && p === currentPage) {
			html += `<span class="current">${p}</span>`;
		} else {
			html += `<a href="page-${String(p).padStart(3, "0")}.html">${p}</a>`;
		}
	}

	if (isIndex) {
		html +=
			totalPages >= 1
				? '<a href="page-001.html">Next →</a>'
				: '<span class="disabled">Next →</span>';
	} else {
		html +=
			currentPage < totalPages
				? `<a href="page-${String(currentPage + 1).padStart(3, "0")}.html">Next →</a>`
				: '<span class="disabled">Next →</span>';
	}
	html += "</div>";
	return html;
}

export function generatePageHtml(
	pageNum: number,
	totalPages: number,
	conversations: Conversation[],
	projectName: string | null,
): string {
	const messagesHtml = conversations
		.map((conv) => conv.messages.map((e) => renderMessage(e)).join(""))
		.join("");

	const pagination = renderPagination(pageNum, totalPages);
	const titleProject = projectName ? ` – ${esc(projectName)}` : "";

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>pi transcript${titleProject} – page ${pageNum}</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">
<h1><a href="index.html" style="color:inherit;text-decoration:none">pi transcript${titleProject}</a> – page ${pageNum}/${totalPages}</h1>
${pagination}
${messagesHtml}
${pagination}
</div>
<script>${JS}</script>
</body>
</html>`;
}

export function generateIndexHtml(
	conversations: Conversation[],
	totalPages: number,
	header: SessionHeader | null,
	projectName: string | null,
): string {
	const totalMessages = conversations.reduce((sum, c) => sum + c.messages.length, 0);
	const totalToolCalls = conversations.reduce(
		(sum, c) => sum + Object.values(c.toolCounts).reduce((s, v) => s + v, 0),
		0,
	);
	const totalCost = conversations.reduce((sum, c) => sum + c.totalCost, 0);

	let indexItemsHtml = "";
	for (let i = 0; i < conversations.length; i++) {
		const conv = conversations[i];
		const pageNum = Math.floor(i / PROMPTS_PER_PAGE) + 1;
		const msgId = makeMsgId(conv.timestamp);
		const link = `page-${String(pageNum).padStart(3, "0")}.html#${msgId}`;
		const renderedContent = md(conv.userText);
		const toolStatsStr = formatToolStats(conv.toolCounts);
		const costStr = conv.totalCost ? formatCost(conv.totalCost) : "";
		const modelStr = conv.model || "";

		const statParts: string[] = [];
		if (toolStatsStr) statParts.push(toolStatsStr);
		if (modelStr) statParts.push(modelStr);
		if (costStr) statParts.push(costStr);
		const statsHtml = statParts.length
			? `<div class="index-item-stats">${esc(statParts.join(" · "))}</div>`
			: "";

		indexItemsHtml += `<div class="index-item"><a href="${link}">
<div class="index-item-header"><span class="index-item-number">#${i + 1}</span><time datetime="${conv.timestamp}" data-timestamp="${conv.timestamp}">${conv.timestamp}</time></div>
<div class="index-item-content">${renderedContent}</div></a>${statsHtml}</div>`;
	}

	const pagination = renderPagination(0, totalPages, true);
	const titleProject = projectName ? ` – ${esc(projectName)}` : "";

	const metaParts: string[] = [];
	metaParts.push(`${conversations.length} prompts`);
	metaParts.push(`${totalMessages} messages`);
	metaParts.push(`${totalToolCalls} tool calls`);
	if (totalCost) metaParts.push(`total cost: ${formatCost(totalCost)}`);
	metaParts.push(`${totalPages} pages`);

	let headerInfo = "";
	if (header) {
		const parts: string[] = [];
		if (header.cwd) parts.push(`<strong>cwd:</strong> ${esc(header.cwd)}`);
		if (header.timestamp)
			parts.push(
				`<strong>started:</strong> <time datetime="${header.timestamp}" data-timestamp="${header.timestamp}">${header.timestamp}</time>`,
			);
		if (header.id) parts.push(`<strong>session:</strong> ${esc(header.id)}`);
		if (parts.length) {
			headerInfo = `<div class="session-info">${parts.join(" · ")}</div>`;
		}
	}

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>pi transcript${titleProject} – Index</title>
<style>${CSS}</style>
</head>
<body>
<div class="container">
<div class="header-row">
<h1>🥧 pi transcript${titleProject}</h1>
</div>
${headerInfo}
${pagination}
<p style="color:var(--text-muted);margin-bottom:24px">${metaParts.join(" · ")}</p>
${indexItemsHtml}
${pagination}
</div>
<script>${JS}</script>
</body>
</html>`;
}

// ─── CSS ─────────────────────────────────────────────────────────

const CSS = `
:root {
  --bg: #0d1117; --card-bg: #161b22; --border: #30363d;
  --user-bg: #1a2332; --user-border: #58a6ff;
  --assistant-bg: #161b22; --assistant-border: #8b949e;
  --thinking-bg: #1c1a0e; --thinking-border: #d29922; --thinking-text: #e3b341;
  --tool-bg: #1e1432; --tool-border: #bc8cff;
  --tool-result-bg: #0d2818; --tool-result-border: #3fb950;
  --tool-error-bg: #2d1014; --tool-error-border: #f85149;
  --text: #e6edf3; --text-muted: #8b949e;
  --code-bg: #0d1117; --code-text: #79c0ff;
  --link: #58a6ff;
}
* { box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 16px; line-height: 1.6; }
.container { max-width: 860px; margin: 0 auto; }
h1 { font-size: 1.4rem; margin-bottom: 16px; }
a { color: var(--link); }
.header-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; border-bottom: 1px solid var(--border); padding-bottom: 12px; margin-bottom: 16px; }
.header-row h1 { border-bottom: none; padding-bottom: 0; margin-bottom: 0; }
.session-info { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; padding: 10px 14px; background: var(--card-bg); border: 1px solid var(--border); border-radius: 8px; }
.message { margin-bottom: 12px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }
.message.user { background: var(--user-bg); border-left: 3px solid var(--user-border); }
.message.assistant { background: var(--assistant-bg); border-left: 3px solid var(--assistant-border); }
.message.tool-reply { background: var(--tool-result-bg); border-left: 3px solid var(--tool-result-border); }
.message-header { display: flex; justify-content: space-between; align-items: center; padding: 6px 14px; background: rgba(255,255,255,0.03); font-size: 0.8rem; gap: 8px; }
.role-label { font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; font-size: 0.75rem; }
.user .role-label { color: var(--user-border); }
.assistant .role-label { color: #8b949e; }
.tool-reply .role-label { color: var(--tool-result-border); }
.meta-info { color: var(--text-muted); font-size: 0.75rem; flex: 1; text-align: center; }
time { color: var(--text-muted); font-size: 0.75rem; }
.timestamp-link { color: inherit; text-decoration: none; }
.timestamp-link:hover { text-decoration: underline; }
.message:target { animation: highlight 2s ease-out; }
@keyframes highlight { 0% { box-shadow: 0 0 0 2px var(--user-border); } 100% { box-shadow: none; } }
.message-content { padding: 12px 14px; }
.message-content p { margin: 0 0 10px; }
.message-content p:last-child { margin-bottom: 0; }
.thinking { background: var(--thinking-bg); border: 1px solid var(--thinking-border); border-radius: 8px; padding: 10px 12px; margin: 8px 0; font-size: 0.88rem; color: var(--thinking-text); }
.thinking-label { font-size: 0.7rem; font-weight: 600; text-transform: uppercase; color: var(--thinking-border); margin-bottom: 6px; }
.thinking p { margin: 6px 0; }
.tool-use { background: var(--tool-bg); border: 1px solid var(--tool-border); border-radius: 8px; padding: 10px 12px; margin: 8px 0; }
.tool-header { font-weight: 600; color: var(--tool-border); margin-bottom: 6px; display: flex; align-items: center; gap: 6px; font-size: 0.9rem; }
.tool-icon { font-size: 1rem; }
.tool-extra { font-size: 0.75rem; color: var(--text-muted); font-weight: normal; }
.tool-result { background: var(--tool-result-bg); border: 1px solid var(--tool-result-border); border-radius: 8px; padding: 10px 12px; margin: 8px 0; }
.tool-result.tool-error { background: var(--tool-error-bg); border-color: var(--tool-error-border); }
.file-tool { border-radius: 8px; padding: 10px 12px; margin: 8px 0; }
.write-tool { background: rgba(63,185,80,0.08); border: 1px solid var(--tool-result-border); }
.edit-tool { background: rgba(210,153,34,0.08); border: 1px solid var(--thinking-border); }
.file-tool-header { font-weight: 600; margin-bottom: 4px; display: flex; align-items: center; gap: 6px; font-size: 0.9rem; }
.write-header { color: var(--tool-result-border); }
.edit-header { color: var(--thinking-border); }
.file-tool-path { font-family: monospace; background: rgba(255,255,255,0.08); padding: 2px 8px; border-radius: 4px; font-size: 0.85rem; }
.file-tool-fullpath { font-family: monospace; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 6px; word-break: break-all; }
.edit-section { display: flex; margin: 4px 0; border-radius: 4px; overflow: hidden; }
.edit-label { padding: 6px 10px; font-weight: bold; font-family: monospace; display: flex; align-items: flex-start; }
.edit-old { background: rgba(248,81,73,0.1); }
.edit-old .edit-label { color: #f85149; background: rgba(248,81,73,0.15); }
.edit-old .edit-content { color: #ffa198; }
.edit-new { background: rgba(63,185,80,0.1); }
.edit-new .edit-label { color: #3fb950; background: rgba(63,185,80,0.15); }
.edit-new .edit-content { color: #7ee787; }
.edit-content { margin: 0; flex: 1; background: transparent; font-size: 0.82rem; }
.ask-tool { background: rgba(88,166,255,0.08); border-color: var(--user-border); }
.ask-question { margin: 6px 0; }
.ask-options { margin: 4px 0 0 0; padding-left: 20px; }
.ask-options li { color: var(--text-muted); font-size: 0.88rem; }
pre { background: var(--code-bg); color: var(--code-text); padding: 10px; border-radius: 6px; overflow-x: auto; font-size: 0.82rem; line-height: 1.5; margin: 6px 0; white-space: pre-wrap; word-wrap: break-word; border: 1px solid var(--border); }
pre.json { color: #e0e0e0; }
code { background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 0.88em; }
pre code { background: none; padding: 0; }
.truncatable { position: relative; }
.truncatable.truncated .truncatable-content { max-height: 200px; overflow: hidden; }
.truncatable.truncated::after { content: ''; position: absolute; bottom: 32px; left: 0; right: 0; height: 60px; background: linear-gradient(to bottom, transparent, var(--card-bg)); pointer-events: none; }
.message.user .truncatable.truncated::after { background: linear-gradient(to bottom, transparent, var(--user-bg)); }
.tool-use .truncatable.truncated::after { background: linear-gradient(to bottom, transparent, var(--tool-bg)); }
.tool-result .truncatable.truncated::after { background: linear-gradient(to bottom, transparent, var(--tool-result-bg)); }
.write-tool .truncatable.truncated::after { background: linear-gradient(to bottom, transparent, rgba(63,185,80,0.08)); }
.edit-tool .truncatable.truncated::after { background: linear-gradient(to bottom, transparent, rgba(210,153,34,0.08)); }
.expand-btn { display: none; width: 100%; padding: 6px 14px; margin-top: 4px; background: rgba(255,255,255,0.04); border: 1px solid var(--border); border-radius: 6px; cursor: pointer; font-size: 0.82rem; color: var(--text-muted); }
.expand-btn:hover { background: rgba(255,255,255,0.08); }
.truncatable.truncated .expand-btn, .truncatable.expanded .expand-btn { display: block; }
.pagination { display: flex; justify-content: center; gap: 6px; margin: 16px 0; flex-wrap: wrap; }
.pagination a, .pagination span { padding: 4px 10px; border-radius: 6px; text-decoration: none; font-size: 0.82rem; }
.pagination a { background: var(--card-bg); color: var(--link); border: 1px solid var(--border); }
.pagination a:hover { background: rgba(88,166,255,0.1); }
.pagination .current { background: var(--user-border); color: #fff; }
.pagination .disabled { color: var(--text-muted); border: 1px solid var(--border); }
.pagination .index-link { background: var(--user-border); color: #fff; }
.index-item { margin-bottom: 12px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); background: var(--user-bg); border-left: 3px solid var(--user-border); }
.index-item a { display: block; text-decoration: none; color: inherit; }
.index-item a:hover { background: rgba(88,166,255,0.05); }
.index-item-header { display: flex; justify-content: space-between; align-items: center; padding: 6px 14px; background: rgba(255,255,255,0.03); font-size: 0.82rem; }
.index-item-number { font-weight: 600; color: var(--user-border); }
.index-item-content { padding: 10px 14px; }
.index-item-content p { margin: 0 0 6px; }
.index-item-content p:last-child { margin-bottom: 0; }
.index-item-stats { padding: 6px 14px 10px 30px; font-size: 0.8rem; color: var(--text-muted); border-top: 1px solid var(--border); }
.user-content { margin: 0; }
.assistant-text { margin: 6px 0; }
.image-block { margin: 8px 0; }
.image-block img { border-radius: 6px; }
@media (max-width: 600px) { body { padding: 8px; } .message { border-radius: 8px; } .message-content { padding: 10px; } pre { font-size: 0.78rem; padding: 8px; } }
`;

// ─── JS ──────────────────────────────────────────────────────────

const JS = `
document.querySelectorAll('time[data-timestamp]').forEach(function(el) {
  var ts = el.getAttribute('data-timestamp');
  var d = new Date(ts);
  if (isNaN(d)) return;
  var now = new Date();
  var time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) { el.textContent = time; }
  else { el.textContent = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + time; }
});
document.querySelectorAll('pre.json').forEach(function(el) {
  var t = el.textContent;
  t = t.replace(/"([^"]+)":/g, '<span style="color:#d2a8ff">"$1"</span>:');
  t = t.replace(/: "([^"]*)"/g, ': <span style="color:#79c0ff">"$1"</span>');
  t = t.replace(/: (\\\\d+)/g, ': <span style="color:#ffa657">$1</span>');
  t = t.replace(/: (true|false|null)/g, ': <span style="color:#ff7b72">$1</span>');
  el.innerHTML = t;
});
document.querySelectorAll('.truncatable').forEach(function(w) {
  var c = w.querySelector('.truncatable-content');
  var b = w.querySelector('.expand-btn');
  if (!c || !b) return;
  if (c.scrollHeight > 250) {
    w.classList.add('truncated');
    b.addEventListener('click', function() {
      if (w.classList.contains('truncated')) { w.classList.remove('truncated'); w.classList.add('expanded'); b.textContent = 'Show less'; }
      else { w.classList.remove('expanded'); w.classList.add('truncated'); b.textContent = 'Show more'; }
    });
  }
});
`;
