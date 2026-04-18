# skill-doc-generator

MCP server that turns any documentation URL into a Claude Code skill file — and bundles the full **skill-creator** workflow so any agent can create, test, and iterate on skills without installing anything extra. No API key required.

## Tools

The server exposes five tools. The AI agent (Claude Code, Cursor, Windsurf, or any MCP-compatible IDE) does all the reasoning:

| Tool | Description |
|---|---|
| `fetch_doc_page(url)` | Fetches a documentation page, strips navigation/scripts/styles, and returns clean text plus all same-domain links. |
| `fetch_github_repo(repo, paths?)` | Fetches key files from a GitHub repository (README, docs, examples) via the GitHub API. More reliable than HTML scraping for repos with good inline docs. Set `GITHUB_TOKEN` env var to avoid rate limits. |
| `save_skill(content, skill_name, output_dir?)` | Writes the generated skill markdown to disk under `<output_dir>/skills/<skill_name>/SKILL.md`. |
| `read_skill(skill_name, output_dir?)` | Reads an existing skill from disk. Use before updating a skill to retrieve its current content, then call `save_skill` with the merged result. |
| `get_skill_creator(section?)` | Returns the bundled skill-creator instructions. No arguments → main SKILL.md. Pass a `section` URI to load a subagent file (grader, comparator, analyzer) or the JSON schema reference. |

The agent decides which pages to crawl, synthesizes the content into a skill, and saves it. No external AI API calls happen inside the server itself.

## MCP Resources

The server also exposes the skill-creator files as MCP resources for clients that support native resource reading:

| URI | Contents |
|---|---|
| `skill-creator://SKILL.md` | Full skill-creator workflow instructions |
| `skill-creator://agents/grader.md` | Grader subagent — evaluates assertions against transcripts |
| `skill-creator://agents/comparator.md` | Blind comparator subagent — judges two outputs without knowing their source |
| `skill-creator://agents/analyzer.md` | Post-hoc analyzer — explains why the winning version outperformed the other |
| `skill-creator://references/schemas.md` | JSON schema reference for evals.json, grading.json, benchmark.json |

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

### Generate a skill from documentation

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

```
Generate a skill from https://github.com/expressjs/express
```

The agent will:
- Fetch the initial page (or GitHub repo) and inspect available content
- Decide which additional pages are worth crawling (quickstart, API reference, key concepts)
- Generate the skill `.md` with frontmatter, key concepts, common operations, patterns, and quick reference
- Save it to `~/.claude/skills/` by default (or ask you where to save it)

### Update an existing skill

```
Update my laravel-eloquent skill with the latest docs
```

The agent will read the existing skill, fetch updated documentation, and save a merged version.

### Create or improve a skill with skill-creator

The server bundles the full skill-creator workflow. Call `get_skill_creator` to get the instructions, then follow the loop: draft → test → review → improve → repeat.

```
Use the skill-creator to help me build a skill for X
```

```
I want to improve an existing skill — use skill-creator to run evals and iterate
```

The bundled skill-creator covers:
- Capturing intent and writing the SKILL.md draft
- Writing test cases and running them (with and without the skill) as parallel subagents
- Grading outputs against quantitative assertions
- Launching an eval viewer for human review
- Iterating based on feedback
- Optimizing the skill's description for better triggering accuracy

## Output format

Generated skill files follow the Claude Code skill format:

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
  index.ts                    — stdio MCP server entry point
  tools/
    generate-skill.ts         — fetch_doc_page, fetch_github_repo, save_skill, read_skill tools
  resources/
    skill-creator.ts          — get_skill_creator tool + MCP resources
bundled-skills/
  skill-creator/
    SKILL.md                  — main skill-creator instructions
    agents/                   — grader, comparator, analyzer subagent files
    references/               — JSON schema reference
```
