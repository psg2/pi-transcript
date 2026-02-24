/**
 * Generates infra/template.yaml from template.base.yaml + auth-at-edge/index.mjs.
 *
 * Minifies the Lambda code, escapes JS ${} for CloudFormation !Sub,
 * replaces {{PLACEHOLDER}} tokens with CF parameter refs, and inlines
 * the result into the ZipFile block.
 *
 * Usage: bun infra/build.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

const infraDir = dirname(new URL(import.meta.url).pathname);
const lambdaSrc = join(infraDir, "auth-at-edge", "index.mjs");
const templateBase = join(infraDir, "template.base.yaml");
const templateOut = join(infraDir, "template.yaml");

// 1. Minify Lambda to CJS (ZipFile creates .js, needs CommonJS)
console.log("==> Minifying Lambda@Edge auth function...");

const result = await Bun.build({
	entrypoints: [lambdaSrc],
	target: "node",
	format: "cjs",
	minify: true,
});

if (!result.success) {
	console.error("Build failed:", result.logs);
	process.exit(1);
}

let code = await result.outputs[0].text();
console.log(`  Minified: ${code.length} bytes`);

if (code.length > 4096) {
	console.error(`Error: exceeds 4KB ZipFile limit (${code.length} bytes)`);
	process.exit(1);
}

// 2. Escape all JS ${...} as ${!...} so CloudFormation !Sub ignores them
code = code.replaceAll("${", "${!");

// 3. Replace {{PLACEHOLDER}} with ${CfParam} for CloudFormation substitution
const replacements: Record<string, string> = {
	"{{GOOGLE_CLIENT_ID}}": "${GoogleClientId}",
	"{{GOOGLE_CLIENT_SECRET}}": "${GoogleClientSecret}",
	"{{ALLOWED_EMAIL_DOMAINS}}": "${AllowedEmailDomains}",
	"{{COOKIE_SECRET}}": "${CookieSecret}",
};

for (const [placeholder, cfRef] of Object.entries(replacements)) {
	code = code.replaceAll(placeholder, cfRef);
}

// 4. Indent for YAML (10 spaces to align under ZipFile: !Sub |)
const indented = code
	.split("\n")
	.map((line) => `          ${line}`)
	.join("\n")
	.trimEnd();

// 5. Replace placeholder in base template
console.log("==> Generating template.yaml...");

const base = readFileSync(templateBase, "utf-8");
const output = base.replace(/^(\s*){{LAMBDA_CODE}}$/m, indented);

writeFileSync(templateOut, output);
console.log(`✓ Generated ${templateOut} (${output.length} bytes)`);
