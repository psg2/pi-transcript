import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { basename } from "node:path";

export interface S3Config {
	bucket: string;
	cloudfrontUrl: string;
}

export function getS3Config(bucketOverride?: string, urlOverride?: string): S3Config {
	const bucket = bucketOverride || process.env.PI_TRANSCRIPT_S3_BUCKET;
	const cloudfrontUrl = urlOverride || process.env.PI_TRANSCRIPT_CLOUDFRONT_URL;

	if (!bucket) {
		throw new Error(
			"PI_TRANSCRIPT_S3_BUCKET is not set.\n" +
				"Set it to your S3 bucket name, e.g.:\n" +
				"  export PI_TRANSCRIPT_S3_BUCKET=my-pi-transcripts",
		);
	}

	if (!cloudfrontUrl) {
		throw new Error(
			"PI_TRANSCRIPT_CLOUDFRONT_URL is not set.\n" +
				"Set it to your CloudFront distribution URL, e.g.:\n" +
				"  export PI_TRANSCRIPT_CLOUDFRONT_URL=https://d1234abcd.cloudfront.net",
		);
	}

	// Ensure URL has a scheme so it's always a clickable link
	let url = cloudfrontUrl.replace(/\/$/, "");
	if (!/^https?:\/\//.test(url)) {
		url = `https://${url}`;
	}

	return {
		bucket,
		cloudfrontUrl: url,
	};
}

/**
 * Build a short, readable S3 prefix from the session path.
 * e.g. "psg2-pi-transcript/2026-02-24-a1b2c3" instead of the full UUID filename.
 */
function buildS3Prefix(outputDir: string, projectName?: string | null): string {
	const dirName = basename(outputDir);

	// Extract date from session filename: pi-transcript-2026-02-24T20-12-53-...
	const dateMatch = dirName.match(/(\d{4}-\d{2}-\d{2})/);
	const date = dateMatch?.[1] ?? new Date().toISOString().slice(0, 10);

	// Short hash from the full dirname for uniqueness
	const hash = createHash("sha256").update(dirName).digest("hex").slice(0, 6);

	// Clean project name for use as path segment
	const project = projectName
		? projectName
				.replace(/[^a-zA-Z0-9_-]/g, "-")
				.replace(/-+/g, "-")
				.toLowerCase()
		: "transcript";

	return `${project}/${date}-${hash}`;
}

/**
 * Upload HTML files from outputDir to S3.
 * Files are placed under a short, readable prefix.
 * Returns the CloudFront URL to the index page.
 */
export function uploadToS3(
	outputDir: string,
	config: S3Config,
	projectName?: string | null,
): { url: string; s3Path: string } {
	// Check aws CLI is available
	try {
		execSync("aws --version", { stdio: "ignore" });
	} catch {
		throw new Error(
			"aws CLI not found. Install it from https://aws.amazon.com/cli/\n" +
				"Then configure with: aws configure",
		);
	}

	const prefix = buildS3Prefix(outputDir, projectName);

	// Verify there are HTML files to upload
	const htmlFiles = readdirSync(outputDir).filter((f) => f.endsWith(".html"));
	if (htmlFiles.length === 0) {
		throw new Error("No HTML files found to upload.");
	}

	const s3Path = `s3://${config.bucket}/${prefix}/`;

	try {
		execSync(
			`aws s3 sync "${outputDir}" "${s3Path}" --content-type "text/html" --exclude "*" --include "*.html"`,
			{ encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
		);
	} catch (err) {
		const stderr =
			err instanceof Error ? (err as { stderr?: string }).stderr || err.message : String(err);
		throw new Error(`Failed to upload to S3: ${stderr}`);
	}

	const url = `${config.cloudfrontUrl}/${prefix}/index.html`;
	return { url, s3Path };
}
