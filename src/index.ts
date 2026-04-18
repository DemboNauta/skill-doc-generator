#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/generate-skill.js";
import { registerSkillCreatorResources } from "./resources/skill-creator.js";

const server = new McpServer(
  { name: "skill-doc-generator", version: "0.3.0" },
  {
    instructions:
      "You are helping generate Claude Code skill files from documentation. " +
      "Workflow for web docs: (1) call fetch_doc_page on the initial URL, (2) analyze the content and decide " +
      "which linked pages are relevant (getting-started, API reference, key features — skip changelogs/blog/auth), " +
      "(3) fetch those pages too, (4) generate a skill .md with frontmatter (name, description, trigger conditions) " +
      "and actionable instructions covering key concepts, common operations, patterns, and quick reference, " +
      "(5) call save_skill with the generated content.\n\n" +
      "Workflow for GitHub repos: use fetch_github_repo instead of fetch_doc_page — it reads README, docs/, and examples/ " +
      "directly via the GitHub API, which is more reliable than HTML scraping.\n\n" +
      "Workflow for updating an existing skill: (1) call read_skill to get the current content, " +
      "(2) fetch updated docs with fetch_doc_page or fetch_github_repo, " +
      "(3) generate updated skill content that merges old structure with new information, " +
      "(4) call save_skill to overwrite.\n\n" +
      "This server also bundles the skill-creator skill so any agent can create, test, and iterate on skills " +
      "without installing anything extra. Call get_skill_creator (no arguments) to get the full instructions, " +
      "then use the section parameter to load subagent files (grader, comparator, analyzer) as needed.",
  }
);

registerTools(server);
registerSkillCreatorResources(server);

const transport = new StdioServerTransport();
await server.connect(transport);
