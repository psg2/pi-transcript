import { execSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * JavaScript injected into HTML files to fix relative links when served
 * via gisthost.github.io or gistpreview.github.io.
 *
 * These hosts serve gist content at URLs like:
 *   https://gisthost.github.io/?GIST_ID/filename.html
 *
 * So relative links like "page-002.html" need to be rewritten to
 * "?GIST_ID/page-002.html" for pagination to work.
 */
const GIST_PREVIEW_JS = `
(function() {
  var hostname = window.location.hostname;
  if (hostname !== 'gisthost.github.io' && hostname !== 'gistpreview.github.io') return;
  var match = window.location.search.match(/^\\?([^/]+)/);
  if (!match) return;
  var gistId = match[1];

  function rewriteLinks(root) {
    (root || document).querySelectorAll('a[href]').forEach(function(link) {
      var href = link.getAttribute('href');
      if (href.startsWith('?') || href.startsWith('http') || href.startsWith('#') || href.startsWith('//')) return;
      var parts = href.split('#');
      var filename = parts[0];
      var anchor = parts.length > 1 ? '#' + parts[1] : '';
      link.setAttribute('href', '?' + gistId + '/' + filename + anchor);
    });
  }

  rewriteLinks();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { rewriteLinks(); });
  }

  var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      mutation.addedNodes.forEach(function(node) {
        if (node.nodeType === 1) {
          rewriteLinks(node);
          if (node.tagName === 'A' && node.getAttribute('href')) {
            var href = node.getAttribute('href');
            if (!href.startsWith('?') && !href.startsWith('http') && !href.startsWith('#') && !href.startsWith('//')) {
              var parts = href.split('#');
              link.setAttribute('href', '?' + gistId + '/' + parts[0] + (parts.length > 1 ? '#' + parts[1] : ''));
            }
          }
        }
      });
    });
  });

  function startObserving() {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    else setTimeout(startObserving, 10);
  }
  startObserving();

  function scrollToFragment() {
    var hash = window.location.hash;
    if (!hash) return false;
    var el = document.getElementById(hash.substring(1));
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true; }
    return false;
  }
  if (!scrollToFragment()) {
    [100, 300, 500, 1000, 2000].forEach(function(d) { setTimeout(scrollToFragment, d); });
  }
})();
`;

/** Inject gist preview JS into all HTML files in the output directory */
export function injectGistPreviewJs(outputDir: string): void {
	const files = readdirSync(outputDir).filter((f) => f.endsWith(".html"));
	for (const file of files) {
		const filepath = join(outputDir, file);
		let content = readFileSync(filepath, "utf-8");
		if (content.includes("</body>")) {
			content = content.replace("</body>", `<script>${GIST_PREVIEW_JS}</script>\n</body>`);
			writeFileSync(filepath, content, "utf-8");
		}
	}
}

/** Upload HTML files to a GitHub Gist via `gh` CLI.
 *  Returns { gistId, gistUrl, previewUrl } on success.
 *  Throws on failure. */
export function createGist(outputDir: string): {
	gistId: string;
	gistUrl: string;
	previewUrl: string;
} {
	const files = readdirSync(outputDir)
		.filter((f) => f.endsWith(".html"))
		.sort()
		.map((f) => join(outputDir, f));

	if (files.length === 0) {
		throw new Error("No HTML files found to upload to gist.");
	}

	// Check gh is available
	try {
		execSync("gh --version", { stdio: "ignore" });
	} catch {
		throw new Error(
			"gh CLI not found. Install it from https://cli.github.com/ and run 'gh auth login'.",
		);
	}

	const cmd = ["gh", "gist", "create", ...files];
	let stdout: string;
	try {
		stdout = execSync(cmd.join(" "), { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
	} catch (err) {
		const msg =
			err instanceof Error ? (err as { stderr?: string }).stderr || err.message : String(err);
		throw new Error(`Failed to create gist: ${msg}`);
	}

	// stdout is the gist URL, e.g. https://gist.github.com/username/GIST_ID
	const gistUrl = stdout;
	const gistId = gistUrl.replace(/\/$/, "").split("/").pop() || "";
	const previewUrl = `https://gisthost.github.io/?${gistId}/index.html`;

	return { gistId, gistUrl, previewUrl };
}
