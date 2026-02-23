import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient } from "../client.js";
import { textResult, errorResult } from "../utils/format.js";

export function registerReferenceTools(server: McpServer): void {
  // ────────────────────────────────────────────
  // cc_list_users
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_list_users",
    {
      title: "List CompanyCam Users",
      description:
        "List all CompanyCam users in the company. Useful for mapping technician names to user IDs for photo filtering.",
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
          .max(100)
          .optional()
          .describe("Results per page (default: 100, max: 100)."),
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
        const data = await client.get<Record<string, unknown>[]>("users", {
          page: String(args.page ?? 1),
          per_page: String(args.per_page ?? 100),
        });

        if (!data || data.length === 0) {
          return textResult("No users found.");
        }

        const lines = [`**${data.length} user(s):**\n`];
        for (const user of data) {
          const name =
            `${(user.first_name as string) ?? ""} ${(user.last_name as string) ?? ""}`.trim();
          const email = (user.email_address as string) || "";
          const uid = user.id ?? "?";
          const status = user.status ?? "?";
          lines.push(`  • ${name} — ID: ${uid} | ${email} | ${status}`);
        }

        return textResult(lines.join("\n"));
      } catch (error) {
        return errorResult(
          `Error fetching users: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // ────────────────────────────────────────────
  // cc_list_tags
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_list_tags",
    {
      title: "List All Photo Tags",
      description:
        "List all company-wide photo tags. Photo tags are different from project labels. Use tag IDs to filter photos in cc_list_project_photos.",
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
          .max(100)
          .optional()
          .describe("Results per page (default: 100, max: 100)."),
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
        const data = await client.get<Record<string, unknown>[]>("tags", {
          page: String(args.page ?? 1),
          per_page: String(args.per_page ?? 100),
        });

        if (!data || data.length === 0) {
          return textResult("No tags found.");
        }

        const lines = [`**${data.length} tag(s):**\n`];
        for (const tag of data) {
          lines.push(
            `  • ${tag.display_value ?? "?"} (ID: ${tag.id ?? "?"})`,
          );
        }

        return textResult(lines.join("\n"));
      } catch (error) {
        return errorResult(
          `Error fetching tags: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
