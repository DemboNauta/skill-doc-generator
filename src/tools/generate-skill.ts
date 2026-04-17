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
            "Directory to save the skill file. Defaults to ~/.claude/skills if not provided."
          ),
      },
      annotations: { readOnlyHint: false },
    },
    async ({ content, skill_name, output_dir }, _extra) => {
      let targetDir = output_dir;

      if (!targetDir) {
        const caps = server.server.getClientCapabilities();
        if (caps?.elicitation) {
          const result = await server.server.elicitInput({
            message: "Where should the skill file be saved?",
            requestedSchema: {
              type: "object" as const,
              properties: {
                output_dir: {
                  type: "string",
                  title: "Output directory",
                  description: "Leave empty to use the default: ~/.claude/skills",
                },
              },
            },
          });
          if (result.action === "accept" && result.content?.output_dir) {
            targetDir = result.content.output_dir as string;
          }
        }
        targetDir ??= path.join(os.homedir(), ".claude", "skills");
      }

      const filePath = path.join(targetDir, `${skill_name}.md`);

      await fs.mkdir(targetDir, { recursive: true });
      await fs.writeFile(filePath, content, "utf-8");

      return {
        content: [
          {
            type: "text",
            text: `Skill saved to: ${filePath}\n\nTo activate in Claude Code, run:\n  claude skill add ${filePath}`,
          },
        ],
      };
    }
  );
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
