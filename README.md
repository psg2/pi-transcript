# pi-transcript

Convert [pi](https://github.com/mariozechner/pi-coding-agent) coding agent sessions to clean, mobile-friendly HTML transcripts with pagination.

Inspired by [claude-code-transcripts](https://github.com/simonw/claude-code-transcripts).

## Installation

```bash
# Run directly (no install needed)
npx @psg2/pi-transcript
bunx @psg2/pi-transcript

# Or install globally
npm install -g @psg2/pi-transcript
pi-transcript
```

## Usage

### Interactive picker (default)

```bash
pi-transcript
```

Shows a list of recent sessions and lets you pick one. Generates HTML and opens it in your browser.

### Convert a specific file

```bash
pi-transcript /path/to/session.jsonl
pi-transcript /path/to/session.jsonl -o ./output
```

### Pick by number from list 

```bash
pi-transcript --list        # Show numbered list of recent sessions
pi-transcript 3             # Convert session #3 from the list
```

### Convert all sessions

```bash
pi-transcript --all                     # Archive to ./pi-archive/
pi-transcript --all -o ./my-archive     # Custom output directory
```

### Publish to GitHub Gist

Use `--gist` to upload the transcript to a GitHub Gist and get a shareable preview URL:

```bash
pi-transcript 3 --gist
pi-transcript session.jsonl --gist
pi-transcript 1 --gist -o ./my-transcript   # keep local copy too
```

This outputs something like:
```
  Gist:    https://gist.github.com/username/abc123def456
  Preview: https://gisthost.github.io/?abc123def456/index.html
```

The preview URL uses [gisthost.github.io](https://gisthost.github.io/) to render your HTML gist. Pagination links are automatically rewritten to work on gisthost.

**Requires:** [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated (`gh auth login`).

### Upload to S3 + CloudFront

Use `--s3` to upload transcripts to a private S3 bucket fronted by CloudFront:

```bash
pi-transcript 3 --s3
pi-transcript 3 --s3 --s3-bucket my-bucket --s3-url https://d1234abcd.cloudfront.net
```

Or configure via environment variables:

```bash
export PI_TRANSCRIPT_S3_BUCKET=my-pi-transcripts
export PI_TRANSCRIPT_CLOUDFRONT_URL=https://d1234abcd.cloudfront.net
pi-transcript 3 --s3
```

**Requires:** [AWS CLI](https://aws.amazon.com/cli/) installed and configured (`aws configure`).

For full setup instructions including Google OAuth authentication via Lambda@Edge, see [docs/private-hosting.md](docs/private-hosting.md).

## Options

| Option | Description |
|--------|-------------|
| `-o, --output <dir>` | Output directory (default: temp dir, auto-opens browser) |
| `--gist` | Upload to GitHub Gist and output a shareable preview URL |
| `--s3` | Upload to S3 + CloudFront |
| `--s3-bucket <name>` | S3 bucket name (or `PI_TRANSCRIPT_S3_BUCKET` env var) |
| `--s3-url <url>` | CloudFront URL (or `PI_TRANSCRIPT_CLOUDFRONT_URL` env var) |
| `-l, --list` | List recent sessions with numbers |
| `-a, --all` | Convert all sessions to an archive |
| `--limit <n>` | Number of sessions to show (default: 15) |
| `--open` | Open in browser after generating |
| `--no-open` | Don't auto-open in browser |
| `-h, --help` | Show help |

## What it generates

- **`index.html`** — Overview page with session metadata, prompt timeline, tool stats, and cost tracking
- **`page-001.html`, `page-002.html`, ...** — Paginated transcript pages (5 prompts per page)

### Features

- 🌙 Dark theme optimized for readability
- 📱 Mobile-friendly responsive design
- 🔧 Special rendering for tool calls (Bash, Read, Write, Edit, Ask)
- 💭 Thinking blocks with collapsible sections
- 💰 Cost tracking per prompt and total
- 🤖 Model information displayed per response
- 📊 Tool usage statistics per prompt
- 🔗 Permalink anchors for every message
- 📋 Truncation with expand/collapse for long outputs
- ⏰ Localized timestamps

## Session format

Pi stores sessions as JSONL files in `~/.pi/agent/sessions/`. Each line is a JSON object with a `type` field:

- `session` — Header with session ID, timestamp, working directory
- `model_change` — Model switches
- `thinking_level_change` — Thinking mode changes
- `message` — User prompts, assistant responses, and tool results
- `compaction` — Context compaction events

## License

MIT
