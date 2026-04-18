import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_CREATOR_DIR = path.join(__dirname, "..", "..", "bundled-skills", "skill-creator");

const SKILL_FILES = [
  {
    uri: "skill-creator://SKILL.md",
    file: "SKILL.md",
    description: "Main skill-creator instructions: full workflow for creating, testing, and iterating on skills",
  },
  {
    uri: "skill-creator://agents/grader.md",
    file: "agents/grader.md",
    description: "Grader subagent: evaluates assertions against execution transcripts and outputs",
  },
  {
    uri: "skill-creator://agents/comparator.md",
    file: "agents/comparator.md",
    description: "Blind comparator subagent: judges which of two outputs better accomplishes a task",
  },
  {
    uri: "skill-creator://agents/analyzer.md",
    file: "agents/analyzer.md",
    description: "Post-hoc analyzer subagent: explains why a winning skill version outperformed the other",
  },
  {
    uri: "skill-creator://references/schemas.md",
    file: "references/schemas.md",
    description: "JSON schema reference for evals.json, grading.json, benchmark.json, and other skill-creator data files",
  },
] as const;

type SkillSection = (typeof SKILL_FILES)[number]["uri"];

const SECTION_MAP: Record<string, string> = Object.fromEntries(
  SKILL_FILES.map(({ uri, file }) => [uri, file])
);

export function registerSkillCreatorResources(server: McpServer): void {
  for (const { uri, file, description } of SKILL_FILES) {
    const filePath = path.join(SKILL_CREATOR_DIR, file);
    server.resource(uri, uri, { description, mimeType: "text/markdown" }, async () => {
      const text = await fs.readFile(filePath, "utf-8");
      return { contents: [{ uri, mimeType: "text/markdown", text }] };
    });
  }

  server.registerTool(
    "get_skill_creator",
    {
      description:
        "Returns skill-creator instructions so you can create, improve, or evaluate Claude Code skills. " +
        "Call with no arguments to get the main SKILL.md. Use the 'section' parameter to retrieve subagent " +
        "instructions (grader, comparator, analyzer) or the JSON schema reference.",
      inputSchema: {
        section: z
          .enum([
            "skill-creator://SKILL.md",
            "skill-creator://agents/grader.md",
            "skill-creator://agents/comparator.md",
            "skill-creator://agents/analyzer.md",
            "skill-creator://references/schemas.md",
          ])
          .optional()
          .describe(
            "Which file to retrieve. Defaults to 'skill-creator://SKILL.md' (main instructions). " +
              "Use the agents/* URIs when spawning a grader/comparator/analyzer subagent."
          ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ section = "skill-creator://SKILL.md" }) => {
      const file = SECTION_MAP[section];
      const filePath = path.join(SKILL_CREATOR_DIR, file);
      const text = await fs.readFile(filePath, "utf-8");

      const resourceList = SKILL_FILES.map(({ uri, description }) => `- \`${uri}\` — ${description}`).join("\n");

      const suffix =
        section === "skill-creator://SKILL.md"
          ? `\n\n---\n\n**Available skill-creator resources** (call \`get_skill_creator\` with a \`section\` value, or read via MCP resources):\n${resourceList}`
          : "";

      return { content: [{ type: "text" as const, text: text + suffix }] };
    }
  );
}
