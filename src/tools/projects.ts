import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, CompanyCamApiError } from "../client.js";
import {
  textResult,
  errorResult,
  formatProjectSummary,
  unixToStr,
} from "../utils/format.js";

export function registerProjectTools(server: McpServer): void {
  // ────────────────────────────────────────────
  // cc_search_projects
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_search_projects",
    {
      title: "Search CompanyCam Projects",
      description:
        "Search CompanyCam projects by name or address. This is the primary lookup tool for finding projects. The query searches both project names and address line 1.",
      inputSchema: {
        query: z
          .string()
          .min(1)
          .max(200)
          .describe(
            "Search by project name or address (e.g., '123 Main St' or 'Smith Residence')",
          ),
        modified_after: z
          .string()
          .optional()
          .describe(
            "Only return projects modified after this date (ISO8601, e.g., '2025-01-15'). Converted to Unix timestamp.",
          ),
        page: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Page number (default: 1)."),
        per_page: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Results per page (default: 25, max: 100)."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const client = getClient();
        const page = args.page ?? 1;
        const perPage = args.per_page ?? 25;

        const params: Record<string, string> = {
          query: args.query,
          page: String(page),
          per_page: String(perPage),
        };
        if (args.modified_after) {
          params.modified_after = String(
            Math.floor(new Date(args.modified_after).getTime() / 1000),
          );
        }

        const data = await client.get<Record<string, unknown>[]>("projects", params);

        if (!data || data.length === 0) {
          return textResult(`No projects found matching '${args.query}'.`);
        }

        const lines = [
          `**Found ${data.length} project(s) matching '${args.query}'** (page ${page}):\n`,
        ];
        for (const project of data) {
          lines.push(formatProjectSummary(project));
          lines.push("");
        }

        if (data.length === perPage) {
          lines.push(
            `_More results may be available on page ${page + 1}._`,
          );
        }

        return textResult(lines.join("\n"));
      } catch (error) {
        return errorResult(
          `Error searching projects: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // ────────────────────────────────────────────
  // cc_list_all_projects
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_list_all_projects",
    {
      title: "List All CompanyCam Projects",
      description:
        "List all CompanyCam projects (no search query required). Supports pagination, date filtering, and status filtering. Use this to iterate all projects, sum photo counts, or find recently modified projects.",
      inputSchema: {
        page: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Page number (default: 1)."),
        per_page: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe("Results per page (default: 50, max: 50)."),
        modified_after: z
          .string()
          .optional()
          .describe(
            "Only return projects modified after this date (ISO8601, e.g., '2025-01-15'). Converted to Unix timestamp.",
          ),
        status: z
          .enum(["active", "archived"])
          .optional()
          .describe("Filter by project status: 'active' or 'archived'."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const client = getClient();
        const page = args.page ?? 1;
        const perPage = args.per_page ?? 50;

        const params: Record<string, string> = {
          page: String(page),
          per_page: String(perPage),
        };
        if (args.modified_after) {
          params.modified_after = String(
            Math.floor(new Date(args.modified_after).getTime() / 1000),
          );
        }
        if (args.status) {
          params.status = args.status;
        }

        const data = await client.get<Record<string, unknown>[]>("projects", params);

        if (!data || data.length === 0) {
          return textResult("No projects found with the given filters.");
        }

        const lines = [
          `**${data.length} project(s)** (page ${page}):\n`,
        ];
        for (const project of data) {
          lines.push(formatProjectSummary(project));
          lines.push("");
        }

        if (data.length === perPage) {
          lines.push(
            `_More results may be available on page ${page + 1}._`,
          );
        }

        return textResult(lines.join("\n"));
      } catch (error) {
        return errorResult(
          `Error listing projects: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // ────────────────────────────────────────────
  // cc_get_project
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_get_project",
    {
      title: "Get CompanyCam Project Details",
      description:
        "Get full details for a specific CompanyCam project by ID. Returns project name, address, status, notepad, contact info, integrations, and timestamps.",
      inputSchema: {
        project_id: z
          .string()
          .min(1)
          .describe("CompanyCam project ID"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const client = getClient();
        const project = await client.get<Record<string, unknown>>(
          `projects/${args.project_id}`,
        );
        return textResult(formatProjectSummary(project));
      } catch (error) {
        if (error instanceof CompanyCamApiError && error.statusCode === 404) {
          return errorResult("Error: Resource not found. Check the ID is correct.");
        }
        return errorResult(
          `Error fetching project: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // ────────────────────────────────────────────
  // cc_list_project_labels
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_list_project_labels",
    {
      title: "List Project Labels",
      description:
        "List all labels applied to a CompanyCam project. Labels are like tags on projects (different from photo tags).",
      inputSchema: {
        project_id: z
          .string()
          .min(1)
          .describe("CompanyCam project ID"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const client = getClient();
        const data = await client.get<Record<string, unknown>[]>(
          `projects/${args.project_id}/labels`,
        );

        if (!data || data.length === 0) {
          return textResult(`No labels on project ${args.project_id}.`);
        }

        const lines = [`**${data.length} label(s)** on project ${args.project_id}:`];
        for (const tag of data) {
          lines.push(
            `  • ${tag.display_value ?? "?"} (ID: ${tag.id ?? "?"})`,
          );
        }

        return textResult(lines.join("\n"));
      } catch (error) {
        return errorResult(
          `Error fetching labels: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // ────────────────────────────────────────────
  // cc_list_project_comments
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_list_project_comments",
    {
      title: "List Project Comments",
      description: "List comments on a CompanyCam project.",
      inputSchema: {
        project_id: z
          .string()
          .min(1)
          .describe("CompanyCam project ID"),
        page: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Page number (default: 1)."),
        per_page: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Results per page (default: 25, max: 100)."),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const client = getClient();
        const data = await client.get<Record<string, unknown>[]>(
          `projects/${args.project_id}/comments`,
          {
            page: String(args.page ?? 1),
            per_page: String(args.per_page ?? 25),
          },
        );

        if (!data || data.length === 0) {
          return textResult(`No comments on project ${args.project_id}.`);
        }

        const lines = [
          `**${data.length} comment(s)** on project ${args.project_id}:\n`,
        ];
        for (const comment of data) {
          const author = (comment.creator_name as string) || "Unknown";
          const content = (comment.content as string) || "";
          const created = unixToStr(comment.created_at as number | null);
          lines.push(`  [${created}] **${author}**: ${content}`);
        }

        return textResult(lines.join("\n"));
      } catch (error) {
        return errorResult(
          `Error fetching comments: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // ────────────────────────────────────────────
  // cc_add_project_comment
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_add_project_comment",
    {
      title: "Add Project Comment",
      description: "Add a comment to a CompanyCam project.",
      inputSchema: {
        project_id: z
          .string()
          .min(1)
          .describe("CompanyCam project ID"),
        content: z
          .string()
          .min(1)
          .max(5000)
          .describe("Comment text"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const client = getClient();
        const data = await client.post<Record<string, unknown>>(
          `projects/${args.project_id}/comments`,
          { comment: { content: args.content } },
        );
        const author = (data.creator_name as string) || "Unknown";
        const created = unixToStr(data.created_at as number | null);
        return textResult(
          `Comment added to project ${args.project_id} by ${author} at ${created}:\n"${data.content ?? ""}"`,
        );
      } catch (error) {
        if (error instanceof CompanyCamApiError) {
          return errorResult(
            `Failed to add comment (HTTP ${error.statusCode}):\n${error.responseBody}`,
          );
        }
        return errorResult(
          `Error adding comment: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // ────────────────────────────────────────────
  // cc_add_project_labels
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_add_project_labels",
    {
      title: "Add Labels to Project",
      description:
        "Add one or more labels to a CompanyCam project. Labels are like tags but applied to projects (not individual photos).",
      inputSchema: {
        project_id: z
          .string()
          .min(1)
          .describe("CompanyCam project ID"),
        labels: z
          .array(z.string())
          .min(1)
          .describe(
            "List of label names to add (e.g., ['Commercial', 'Priority'])",
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const client = getClient();
        await client.post(
          `projects/${args.project_id}/labels`,
          { project: { labels: args.labels } },
        );
        return textResult(
          `Labels added to project ${args.project_id}: ${args.labels.join(", ")}`,
        );
      } catch (error) {
        if (error instanceof CompanyCamApiError) {
          return errorResult(
            `Failed to add labels (HTTP ${error.statusCode}):\n${error.responseBody}`,
          );
        }
        return errorResult(
          `Error adding labels: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // ────────────────────────────────────────────
  // cc_update_project_notepad
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_update_project_notepad",
    {
      title: "Update Project Notepad",
      description:
        "Update the notepad content on a CompanyCam project. WARNING: This replaces the entire notepad content. Read the current notepad first if you need to append.",
      inputSchema: {
        project_id: z
          .string()
          .min(1)
          .describe("CompanyCam project ID"),
        notepad: z
          .string()
          .max(10000)
          .describe("New notepad content (replaces existing)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const client = getClient();
        await client.put(
          `projects/${args.project_id}/notepad`,
          { notepad: args.notepad },
        );
        return textResult(
          `Notepad updated for project ${args.project_id}. New content (${args.notepad.length} chars).`,
        );
      } catch (error) {
        if (error instanceof CompanyCamApiError) {
          return errorResult(
            `Failed to update notepad (HTTP ${error.statusCode}):\n${error.responseBody}`,
          );
        }
        return errorResult(
          `Error updating notepad: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
