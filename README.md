# skill-doc-generator

MCP server that turns any documentation URL into a Claude Code skill file. Point it at API docs, a framework's docs, or any library reference — the AI agent crawls the relevant pages and generates a ready-to-use `.md` skill file. No API key required.

## How it works

The server exposes two primitive tools. The AI agent (Claude Code, Cursor, Windsurf, or any MCP-compatible IDE) does all the reasoning:

1. **`fetch_doc_page(url)`** — Fetches a documentation page, strips navigation/scripts/styles, and returns clean text content plus all same-domain links found on the page.
2. **`save_skill(content, skill_name, output_dir?)`** — Writes the generated skill markdown file to disk.

The agent decides which pages to crawl, synthesizes the content into a skill, and saves it. No external AI API calls happen inside the server itself.

## Installation

Requires Node.js 18+. No cloning needed — install directly from npm.

**Claude Code (global — works across all projects):**

```bash
claude mcp add --transport stdio --scope user skill-doc-generator npx skill-doc-generator
```

**Other agentic IDEs** — add to your MCP config:

```json
{
  "mcpServers": {
    "skill-doc-generator": {
      "command": "npx",
      "args": ["skill-doc-generator"]
    }
  }
}
```

> Cursor: `.cursor/mcp.json` · Windsurf: `~/.codeium/windsurf/mcp_config.json` · VS Code (Copilot): `.vscode/mcp.json`

If you prefer a permanent global install:

```bash
npm install -g skill-doc-generator
claude mcp add --transport stdio --scope user skill-doc-generator skill-doc-generator
```

## Usage

Once the server is registered, just ask your agent:

```
Generate a skill from https://laravel.com/docs/13.x/eloquent
```

```
Create a Claude Code skill from the Stripe API docs: https://stripe.com/docs/api
```

```
Build a skill from https://docs.python.org/3/library/asyncio.html and save it to ./skills
```

The agent will:
- Fetch the initial page and inspect available links
- Decide which additional pages are worth crawling (quickstart, API reference, key concepts)
- Generate the skill `.md` with frontmatter, key concepts, common operations, patterns, and quick reference
- Save it to `~/.claude/skills/` by default (or ask you where to save it)

## Output format

The generated file follows the Claude Code skill format:

```markdown
---
name: laravel-eloquent
description: Use when working with Laravel Eloquent ORM — models, relationships, queries, scopes
---

# Laravel Eloquent

...actionable instructions for the agent...
```

Saved files are immediately usable as Claude Code skills.

## Requirements

- Node.js 18+
- An MCP-compatible agentic IDE (Claude Code, Cursor, Windsurf, etc.)
- No API keys needed

## Project structure

```
src/
  index.ts              — stdio MCP server entry point
  tools/
    generate-skill.ts   — fetch_doc_page and save_skill tools + HTML helpers
```
