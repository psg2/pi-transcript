#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { generateTranscript } from "./generate";
import { createGist, injectGistPreviewJs } from "./gist";
import { deployToPages } from "./pages";
import { formatSessionLine, pickSession } from "./picker";
import { getS3Config, uploadToS3 } from "./s3";
import { findAllSessions, findRecentSessions } from "./sessions";

const HELP = `pi-transcript — Convert pi sessions to clean HTML transcripts

Usage:
  pi-transcript                       Interactive picker for recent sessions
  pi-transcript <file.jsonl>          Convert a specific session file
  pi-transcript <number>              Convert session # from the list
  pi-transcript -l, --list            List recent sessions with numbers
  pi-transcript -a, --all             Convert all sessions to an archive

Options:
  -o, --output <dir>     Output directory (default: temp dir, auto-opens browser)
  --gist                 Upload to GitHub Gist and output a preview URL (requires gh CLI)
  --pages                Deploy to Cloudflare Pages (requires wrangler CLI)
  --pages-project <name> Cloudflare Pages project name (default: pi-transcripts)
  --s3                   Upload to S3 + CloudFront (requires aws CLI)
  --s3-bucket <name>     S3 bucket name (or PI_TRANSCRIPT_S3_BUCKET env var)
  --s3-url <url>         CloudFront URL (or PI_TRANSCRIPT_CLOUDFRONT_URL env var)
  --limit <n>            Number of sessions to show (default: 15)
  --open                 Open in browser after generating
  --no-open              Don't auto-open in browser
  -h, --help             Show this help
  -v, --version          Show version
`;

function parseArgs(argv: string[]) {
	const flags = {
		list: false,
		all: false,
		gist: false,
		pages: false,
		s3: false,
		s3Bucket: "",
		s3Url: "",
		pagesProject: process.env.PI_TRANSCRIPT_PAGES_PROJECT || "pi-transcripts",
		open: false,
		noOpen: false,
		help: false,
		version: false,
		output: "",
		limit: 15,
		positional: "",
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		switch (arg) {
			case "-l":
			case "--list":
				flags.list = true;
				break;
			case "-a":
			case "--all":
				flags.all = true;
				break;
			case "--gist":
				flags.gist = true;
				break;
			case "--pages":
				flags.pages = true;
				break;
			case "--pages-project":
				flags.pagesProject = argv[++i] ?? "pi-transcripts";
				break;
			case "--s3":
				flags.s3 = true;
				break;
			case "--s3-bucket":
				flags.s3Bucket = argv[++i] ?? "";
				break;
			case "--s3-url":
				flags.s3Url = argv[++i] ?? "";
				break;
			case "--open":
				flags.open = true;
				break;
			case "--no-open":
				flags.noOpen = true;
				break;
			case "-o":
			case "--output":
				flags.output = argv[++i] ?? "";
				break;
			case "--limit":
				flags.limit = Number.parseInt(argv[++i] ?? "15", 10);
				break;
			case "-h":
			case "--help":
				flags.help = true;
				break;
			case "-v":
			case "--version":
				flags.version = true;
				break;
			default:
				if (!arg.startsWith("-") && !flags.positional) {
					flags.positional = arg;
				}
				break;
		}
	}
	return flags;
}

function openInBrowser(filepath: string): void {
	const url = `file://${filepath}`;
	try {
		if (process.platform === "darwin") execSync(`open "${url}"`);
		else if (process.platform === "linux") execSync(`xdg-open "${url}"`);
		else if (process.platform === "win32") execSync(`start "${url}"`);
	} catch {
		console.log(`  Open: ${url}`);
	}
}

async function main(): Promise<void> {
	const flags = parseArgs(process.argv.slice(2));

	if (flags.help) {
		console.log(HELP);
		process.exit(0);
	}

	if (flags.version) {
		const pkgPath = resolve(import.meta.dirname ?? ".", "..", "package.json");
		const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
		console.log(`pi-transcript v${pkg.version}`);
		process.exit(0);
	}

	// ─── List mode ───────────────────────────────────────────────
	if (flags.list) {
		const sessions = findRecentSessions(flags.limit);
		if (sessions.length === 0) {
			console.log("No pi sessions found in ~/.pi/agent/sessions/");
			process.exit(0);
		}

		const width = process.stdout.columns || 120;
		const summaryWidth = Math.max(20, width - 57); // 4 (num) + 16 (date) + 7 (size) + 20 (project) + gaps
		console.log();
		for (let i = 0; i < sessions.length; i++) {
			const num = String(i + 1).padStart(2);
			const line = formatSessionLine(sessions[i], summaryWidth);
			console.log(`  ${num}. ${line}`);
		}
		console.log("\nConvert with: pi-transcript <number> or pi-transcript <file.jsonl>");
		process.exit(0);
	}

	// ─── All mode ────────────────────────────────────────────────
	if (flags.all) {
		const outputDir = resolve(flags.output || "./pi-archive");
		const projects = findAllSessions();
		if (projects.length === 0) {
			console.log("No pi sessions found.");
			process.exit(0);
		}

		let total = 0;
		let generated = 0;
		console.log(`Found ${projects.length} projects, generating archive in ${outputDir}/...\n`);

		for (const project of projects) {
			for (const session of project.sessions) {
				total++;
				const sessionName = basename(session.path, ".jsonl");
				const sessionOutputDir = join(outputDir, project.project, sessionName);
				try {
					generateTranscript(session.path, sessionOutputDir, {
						projectName: project.project,
					});
					generated++;
					if (generated % 10 === 0) {
						process.stdout.write(`  ${generated}/${total} sessions...\r`);
					}
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					console.error(`  ✗ Failed: ${project.project}/${sessionName}: ${msg}`);
				}
			}
		}

		console.log(`\n✓ Generated ${generated} session transcripts in ${outputDir}/`);
		if (flags.open) openInBrowser(join(outputDir, "index.html"));
		process.exit(0);
	}

	// ─── Single file or interactive ──────────────────────────────
	let sessionPath = flags.positional;

	// Number from list
	if (sessionPath && /^\d+$/.test(sessionPath)) {
		const idx = Number.parseInt(sessionPath, 10) - 1;
		const sessions = findRecentSessions(50);
		if (idx < 0 || idx >= sessions.length) {
			console.error(`Session #${idx + 1} not found. Use --list to see available sessions.`);
			process.exit(1);
		}
		sessionPath = sessions[idx].path;
	}

	// Interactive picker
	if (!sessionPath) {
		const sessions = findRecentSessions(flags.limit);
		if (sessions.length === 0) {
			console.log("No pi sessions found in ~/.pi/agent/sessions/");
			process.exit(0);
		}

		const selected = await pickSession(sessions);
		if (!selected) {
			console.log("No session selected.");
			process.exit(0);
		}
		sessionPath = selected.path;
	}

	if (!existsSync(sessionPath)) {
		console.error(`File not found: ${sessionPath}`);
		process.exit(1);
	}

	// Output dir
	const explicitOutput = !!flags.output;
	let outputDir = flags.output;
	if (!outputDir) {
		const sessionName = basename(sessionPath, ".jsonl");
		outputDir = join(tmpdir(), `pi-transcript-${sessionName}`);
	}
	outputDir = resolve(outputDir);

	console.log("\nGenerating transcript...");
	const result = generateTranscript(sessionPath, outputDir);

	console.log(`✓ Generated ${result.pages} pages (${result.prompts} prompts)`);
	console.log(`  Project: ${result.projectName || "(unknown)"}`);
	console.log(`  Output:  ${result.outputDir}/`);

	if (flags.gist) {
		console.log("\nUploading to GitHub Gist...");
		injectGistPreviewJs(outputDir);
		const gist = createGist(outputDir);
		console.log(`  Gist:    ${gist.gistUrl}`);
		console.log(`  Preview: ${gist.previewUrl}`);
		console.log(`  Files:   ${outputDir}`);
	}

	if (flags.pages) {
		console.log(`\nDeploying to Cloudflare Pages (${flags.pagesProject})...`);
		const deployment = deployToPages(outputDir, flags.pagesProject);
		if (deployment.url) {
			console.log(`  URL:     ${deployment.url}`);
			if (flags.open) openInBrowser(deployment.url.replace("file://", ""));
		}
	}

	if (flags.s3) {
		const config = getS3Config(flags.s3Bucket, flags.s3Url);
		console.log(`\nUploading to S3 (${config.bucket})...`);
		const s3Result = uploadToS3(outputDir, config, result.projectName);
		console.log(`  S3:      ${s3Result.s3Path}`);
		console.log(`  URL:     ${s3Result.url}`);
		if (flags.open) {
			try {
				if (process.platform === "darwin") execSync(`open "${s3Result.url}"`);
				else if (process.platform === "linux") execSync(`xdg-open "${s3Result.url}"`);
			} catch {
				// ignore
			}
		}
	}

	const shouldOpen =
		flags.open || (!explicitOutput && !flags.noOpen && !flags.gist && !flags.pages && !flags.s3);
	if (shouldOpen) openInBrowser(join(outputDir, "index.html"));
}

main().catch((err) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
