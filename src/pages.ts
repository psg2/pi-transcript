import { execSync } from "node:child_process";

/**
 * Deploy HTML files to Cloudflare Pages via wrangler CLI.
 * Returns the deployment URL on success.
 */
export function deployToPages(
	outputDir: string,
	projectName: string,
): { url: string; projectName: string } {
	// Check wrangler is available
	const wranglerCmd = findWrangler();
	if (!wranglerCmd) {
		throw new Error(
			"wrangler CLI not found. Install it with: npm install -g wrangler\nThen authenticate with: wrangler login",
		);
	}

	const cmd = `${wranglerCmd} pages deploy "${outputDir}" --project-name="${projectName}" --commit-dirty=true`;

	let stdout: string;
	try {
		stdout = execSync(cmd, {
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
	} catch (err) {
		const stderr =
			err instanceof Error ? (err as { stderr?: string }).stderr || err.message : String(err);

		// If project doesn't exist, wrangler creates it automatically on first deploy
		// But if auth fails, give a clear message
		if (stderr.includes("Authentication") || stderr.includes("not logged in")) {
			throw new Error("wrangler is not authenticated. Run: wrangler login");
		}
		throw new Error(`Failed to deploy to Cloudflare Pages: ${stderr}`);
	}

	// wrangler pages deploy outputs something like:
	// ✨ Deployment complete! Take a peek over at https://abc123.pi-transcripts.pages.dev
	const urlMatch = stdout.match(/https:\/\/[^\s]+\.pages\.dev/);
	const url = urlMatch ? urlMatch[0] : "";

	if (!url) {
		// Try to construct the URL from project name
		console.log("  (Could not parse deployment URL from wrangler output)");
		console.log(`  wrangler output: ${stdout}`);
	}

	return { url, projectName };
}

/** Find the wrangler command — check direct binary first, then npx/bunx */
function findWrangler(): string | null {
	const candidates = ["wrangler", "npx wrangler", "bunx wrangler"];
	for (const cmd of candidates) {
		try {
			execSync(`${cmd} --version`, {
				stdio: "ignore",
				timeout: 10000,
			});
			return cmd;
		} catch {
			// try next candidate
		}
	}
	return null;
}
