#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools } from "./tools/generate-skill.js";

const server = new McpServer(
  { name: "skill-doc-generator", version: "0.2.0" },
  {
    instructions:
      "You are helping generate Claude Code skill files from documentation. " +
      "Workflow: (1) call fetch_doc_page on the initial URL, (2) analyze the content and decide " +
      "which linked pages are relevant (getting-started, API reference, key features — skip changelogs/blog/auth), " +
      "(3) fetch those pages too, (4) generate a skill .md with frontmatter (name, description, trigger conditions) " +
      "and actionable instructions covering key concepts, common operations, patterns, and quick reference, " +
      "(5) call save_skill with the generated content.",
  }
);

registerTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
