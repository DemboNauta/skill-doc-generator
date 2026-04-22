import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
export function registerTools(server: McpServer): void {
  server.registerTool(
    "fetch_doc_page",
    {
      description:
        "Fetches a documentation page and returns its text content and all same-domain links. " +
        "Call this on the initial URL, then decide which linked pages to fetch next based on the returned links.",
      inputSchema: {
        url: z.string().url().describe("URL of the documentation page to fetch"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ url }) => {
      let rawHtml: string;
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "skill-doc-generator/0.1 (MCP documentation tool)" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          return {
            isError: true,
            content: [{ type: "text", text: `HTTP ${res.status} fetching ${url}` }],
          };
        }
        rawHtml = await res.text();
      } catch (err) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to fetch ${url}: ${String(err)}` }],
        };
      }

      const page = { url, title: extractTitle(rawHtml), content: extractText(rawHtml) };
      const links = extractLinks(rawHtml, url);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                url: page.url,
                title: page.title,
                content: page.content,
                available_links: links.slice(0, 80),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "save_skill",
    {
      description:
        "Saves a Claude Code skill markdown file to disk. " +
        "Call this once you have generated the skill content from the documentation.",
      inputSchema: {
        content: z.string().describe("Full markdown content of the skill file including frontmatter"),
        skill_name: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .describe("Kebab-case name for the skill file, e.g. 'laravel-eloquent'"),
        output_dir: z
          .string()
          .optional()
          .describe(
            "Base directory for saving the skill. Relative paths are resolved from the current project directory. " +
            "If omitted, auto-detects: uses the project's .claude/ folder if it exists, otherwise falls back to ~/.claude. " +
            "The skill will be saved to <output_dir>/skills/<skill_name>/SKILL.md."
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ content, skill_name, output_dir }, _extra) => {
      let targetDir = output_dir;

      if (!targetDir) {
        const caps = server.server.getClientCapabilities();
        if (caps?.elicitation) {
          const projectClaudeDir = path.join(process.cwd(), ".claude");
          const projectClaudeExists = await fs
            .access(projectClaudeDir)
            .then(() => true)
            .catch(() => false);
          const defaultDescription = projectClaudeExists
            ? `Leave empty to use the project directory: ${projectClaudeDir}`
            : `Leave empty to use the global default: ${path.join(os.homedir(), ".claude")}`;

          const result = await server.server.elicitInput({
            message: "Where should the skill file be saved?",
            requestedSchema: {
              type: "object" as const,
              properties: {
                output_dir: {
                  type: "string",
                  title: "Output directory",
                  description: defaultDescription,
                },
              },
            },
          });
          if (result.action === "accept" && result.content?.output_dir) {
            targetDir = result.content.output_dir as string;
          }
        }
        if (!targetDir) {
          const projectClaudeDir = path.join(process.cwd(), ".claude");
          const projectClaudeExists = await fs
            .access(projectClaudeDir)
            .then(() => true)
            .catch(() => false);
          targetDir = projectClaudeExists
            ? projectClaudeDir
            : path.join(os.homedir(), ".claude");
        }
      } else if (!path.isAbsolute(targetDir)) {
        targetDir = path.resolve(process.cwd(), targetDir);
      }

      const skillDir = path.join(targetDir, "skills", skill_name);
      const filePath = path.join(skillDir, "SKILL.md");

      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: `Skill saved to: ${filePath}\n\nTo activate in Claude Code, run:\n  claude skill add ${skillDir}`,
          },
        ],
      };
    }
  );
  server.registerTool(
    "fetch_github_repo",
    {
      description:
        "Fetches key files from a GitHub repository (README, docs, examples) using the GitHub API. " +
        "More reliable than web scraping for repos with good inline documentation. " +
        "Set GITHUB_TOKEN env var to avoid rate limits (60 req/h unauthenticated, 5000 with token). " +
        "Use this instead of fetch_doc_page when the user provides a GitHub URL.",
      inputSchema: {
        repo: z
          .string()
          .describe(
            "GitHub repository in 'owner/repo' format or full URL like https://github.com/owner/repo"
          ),
        paths: z
          .array(z.string())
          .optional()
          .describe(
            "Specific file paths to fetch (e.g. ['docs/guide.md', 'README.md']). If omitted, auto-selects relevant files."
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ repo, paths }) => {
      const match = repo.match(/(?:github\.com\/)?([^/\s?#]+)\/([^/\s?#]+)/);
      if (!match) {
        return {
          isError: true,
          content: [{ type: "text", text: `Invalid repo format: ${repo}` }],
        };
      }
      const [, owner, repoName] = match;

      const headers: Record<string, string> = {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "skill-doc-generator/0.2",
      };
      const token = process.env.GITHUB_TOKEN;
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const apiBase = `https://api.github.com/repos/${owner}/${repoName}`;

      const repoRes = await fetch(apiBase, { headers, signal: AbortSignal.timeout(15_000) });
      if (!repoRes.ok) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `GitHub API error ${repoRes.status} for ${owner}/${repoName}. ${repoRes.status === 403 ? "Rate limit hit — set GITHUB_TOKEN env var." : ""}`,
            },
          ],
        };
      }
      const repoData = (await repoRes.json()) as Record<string, unknown>;
      const defaultBranch = (repoData.default_branch as string) ?? "main";

      const treeRes = await fetch(`${apiBase}/git/trees/${defaultBranch}?recursive=1`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      });
      const treeData = treeRes.ok
        ? ((await treeRes.json()) as Record<string, unknown>)
        : { tree: [] };
      const allFiles = ((treeData.tree as Array<Record<string, unknown>>) ?? [])
        .filter((f) => f.type === "blob")
        .map((f) => f.path as string);

      const filesToFetch = paths ?? selectRelevantFiles(allFiles);

      const fetchedFiles: Array<{ path: string; content: string }> = [];
      for (const filePath of filesToFetch.slice(0, 15)) {
        const fileRes = await fetch(`${apiBase}/contents/${filePath}`, {
          headers,
          signal: AbortSignal.timeout(15_000),
        });
        if (!fileRes.ok) continue;
        const fileData = (await fileRes.json()) as Record<string, unknown>;
        if (fileData.encoding === "base64" && typeof fileData.content === "string") {
          const decoded = Buffer.from(fileData.content.replace(/\n/g, ""), "base64").toString(
            "utf-8"
          );
          fetchedFiles.push({ path: filePath, content: decoded.slice(0, 8_000) });
        }
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                repo: `${owner}/${repoName}`,
                description: repoData.description,
                topics: repoData.topics,
                default_branch: defaultBranch,
                all_files: allFiles.slice(0, 200),
                fetched_files: fetchedFiles,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.registerTool(
    "read_skill",
    {
      description:
        "Reads an existing skill file from disk. " +
        "Call this before updating a skill to retrieve its current content, " +
        "then fetch updated docs and call save_skill with the merged result.",
      inputSchema: {
        skill_name: z
          .string()
          .regex(/^[a-z0-9-]+$/)
          .describe("Kebab-case name of the skill to read, e.g. 'laravel-eloquent'"),
        output_dir: z
          .string()
          .optional()
          .describe(
            "Base directory where skills are stored. Relative paths are resolved from the current project directory. " +
            "If omitted, auto-detects: uses the project's .claude/ folder if it exists, otherwise falls back to ~/.claude."
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ skill_name, output_dir }) => {
      let baseDir: string;
      if (output_dir) {
        baseDir = path.isAbsolute(output_dir)
          ? output_dir
          : path.resolve(process.cwd(), output_dir);
      } else {
        const projectClaudeDir = path.join(process.cwd(), ".claude");
        const projectClaudeExists = await fs
          .access(projectClaudeDir)
          .then(() => true)
          .catch(() => false);
        baseDir = projectClaudeExists ? projectClaudeDir : path.join(os.homedir(), ".claude");
      }
      const filePath = path.join(baseDir, "skills", skill_name, "SKILL.md");

      try {
        const [content, stat] = await Promise.all([
          fs.readFile(filePath, "utf-8"),
          fs.stat(filePath),
        ]);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  skill_name,
                  file_path: filePath,
                  last_modified: stat.mtime.toISOString(),
                  content,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch {
        return {
          isError: true,
          content: [{ type: "text", text: `Skill '${skill_name}' not found at ${filePath}` }],
        };
      }
    }
  );
}

function selectRelevantFiles(files: string[]): string[] {
  const patterns = [
    /^readme\.md$/i,
    /^readme$/i,
    /^docs?\//i,
    /^documentation\//i,
    /^examples?\//i,
    /^getting[-_]started/i,
    /^guide/i,
    /^api[-_.]?reference/i,
    /^src\/index\.[tj]sx?$/i,
    /^index\.[tj]sx?$/i,
    /^package\.json$/i,
    /^pyproject\.toml$/i,
    /^setup\.py$/i,
    /^cargo\.toml$/i,
  ];

  const selected: string[] = [];
  for (const pattern of patterns) {
    for (const file of files) {
      if (pattern.test(file) && !selected.includes(file)) {
        selected.push(file);
        if (selected.length >= 15) return selected;
      }
    }
  }
  return selected;
}

function extractTitle(html: string): string {
  return html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? "Untitled";
}

function extractText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s{3,}/g, "\n\n")
    .trim()
    .slice(0, 25_000);
}

function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => m[1]);
  const links = new Set<string>();

  for (const href of hrefs) {
    try {
      const resolved = new URL(href, base);
      if (resolved.hostname === base.hostname && resolved.pathname !== base.pathname) {
        resolved.hash = "";
        links.add(resolved.toString());
      }
    } catch {
      // ignore malformed hrefs
    }
  }

  return [...links];
}
