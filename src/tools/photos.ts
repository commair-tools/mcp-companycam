import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getClient, CompanyCamApiError } from "../client.js";
import {
  textResult,
  errorResult,
  formatPhotoSummary,
  getPhotoUrl,
  unixToStr,
} from "../utils/format.js";

export function registerPhotoTools(server: McpServer): void {
  // ────────────────────────────────────────────
  // cc_list_project_photos
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_list_project_photos",
    {
      title: "List Project Photos",
      description:
        "List photos for a CompanyCam project with optional filtering. Can filter by date range, user (photographer), and tag. Returns photo IDs, image URLs, descriptions, and capture timestamps.",
      inputSchema: {
        project_id: z
          .string()
          .min(1)
          .describe("CompanyCam project ID"),
        start_date: z
          .string()
          .optional()
          .describe(
            "Filter photos from this date (ISO8601, e.g., '2025-01-15'). Converted to Unix timestamp.",
          ),
        end_date: z
          .string()
          .optional()
          .describe(
            "Filter photos until this date (ISO8601, e.g., '2025-02-20'). Converted to Unix timestamp.",
          ),
        user_id: z
          .string()
          .optional()
          .describe("Filter by CompanyCam user ID (photographer)"),
        tag_id: z
          .string()
          .optional()
          .describe("Filter by tag ID"),
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
          page: String(page),
          per_page: String(perPage),
        };

        // Convert ISO dates to Unix timestamps
        if (args.start_date) {
          params.start_date = String(
            Math.floor(new Date(args.start_date).getTime() / 1000),
          );
        }
        if (args.end_date) {
          params.end_date = String(
            Math.floor(new Date(args.end_date).getTime() / 1000),
          );
        }
        if (args.user_id) {
          params["user_ids[]"] = args.user_id;
        }
        if (args.tag_id) {
          params["tag_ids[]"] = args.tag_id;
        }

        const data = await client.get<Record<string, unknown>[]>(
          `projects/${args.project_id}/photos`,
          params,
        );

        if (!data || data.length === 0) {
          return textResult(
            `No photos found for project ${args.project_id} with the given filters.`,
          );
        }

        const lines = [
          `**${data.length} photo(s)** for project ${args.project_id} (page ${page}):\n`,
        ];
        for (const photo of data) {
          lines.push(formatPhotoSummary(photo));
          lines.push("");
        }

        if (data.length === perPage) {
          lines.push(
            `_More photos may be available on page ${page + 1}._`,
          );
        }

        return textResult(lines.join("\n"));
      } catch (error) {
        return errorResult(
          `Error fetching photos: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // ────────────────────────────────────────────
  // cc_get_photo
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_get_photo",
    {
      title: "Get Photo Details",
      description:
        "Get full details for a specific photo by ID. Returns all image URLs (original, web, thumbnail), description, creator info, coordinates, and timestamps.",
      inputSchema: {
        photo_id: z
          .string()
          .min(1)
          .describe("CompanyCam photo ID"),
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
        const photo = await client.get<Record<string, unknown>>(
          `photos/${args.photo_id}`,
        );

        const lines = [formatPhotoSummary(photo)];

        // Add extra detail not in summary
        const coords = photo.coordinates;
        if (coords) {
          const coordList = Array.isArray(coords) ? coords : [coords];
          for (const c of coordList as Array<Record<string, unknown>>) {
            lines.push(`  Location: ${c.lat ?? "?"}, ${c.lon ?? "?"}`);
          }
        }

        const uris = photo.uris as
          | Array<{ type?: string; url?: string; uri?: string }>
          | undefined;
        if (uris && uris.length > 1) {
          lines.push("  All sizes:");
          for (const u of uris) {
            lines.push(
              `    ${u.type ?? "?"}: ${u.url ?? u.uri ?? ""}`,
            );
          }
        }

        // Tags
        const tags = photo.tags as Array<Record<string, unknown>> | undefined;
        if (tags && tags.length > 0) {
          const tagStrs = tags.map(
            (t) => `${t.display_value ?? "?"} (ID: ${t.id ?? "?"})`,
          );
          lines.push(`  Tags: ${tagStrs.join(", ")}`);
        }

        lines.push(`  Processing: ${photo.processing_status ?? "?"}`);
        lines.push(`  Project ID: ${photo.project_id ?? "?"}`);

        return textResult(lines.join("\n"));
      } catch (error) {
        if (error instanceof CompanyCamApiError && error.statusCode === 404) {
          return errorResult("Error: Resource not found. Check the ID is correct.");
        }
        return errorResult(
          `Error fetching photo: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // ────────────────────────────────────────────
  // cc_add_photo_tags
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_add_photo_tags",
    {
      title: "Add Tags to Photo",
      description:
        "Add one or more tags to a photo. Tags are created company-wide if they don't already exist.",
      inputSchema: {
        photo_id: z
          .string()
          .min(1)
          .describe("CompanyCam photo ID"),
        tags: z
          .array(z.string())
          .min(1)
          .describe(
            "List of tag display values to add (e.g., ['Reviewed', 'Before'])",
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
        const data = await client.post<Record<string, unknown>[]>(
          `photos/${args.photo_id}/tags`,
          { tag: { display_values: args.tags } },
        );

        let tagNames: string[];
        if (Array.isArray(data) && data.length > 0) {
          tagNames = data.map(
            (t) => (t.display_value as string) ?? "?",
          );
        } else {
          tagNames = args.tags;
        }

        return textResult(
          `Tags added to photo ${args.photo_id}: ${tagNames.join(", ")}`,
        );
      } catch (error) {
        if (error instanceof CompanyCamApiError) {
          return errorResult(
            `Failed to add tags (HTTP ${error.statusCode}):\n${error.responseBody}`,
          );
        }
        return errorResult(
          `Error adding tags: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // ────────────────────────────────────────────
  // cc_add_photo_comment
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_add_photo_comment",
    {
      title: "Add Photo Comment",
      description: "Add a comment to a specific photo.",
      inputSchema: {
        photo_id: z
          .string()
          .min(1)
          .describe("CompanyCam photo ID"),
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
          `photos/${args.photo_id}/comments`,
          { comment: { content: args.content } },
        );
        const author = (data.creator_name as string) || "Unknown";
        return textResult(
          `Comment added to photo ${args.photo_id} by ${author}:\n"${data.content ?? ""}"`,
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
  // cc_get_photo_tags
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_get_photo_tags",
    {
      title: "Get Photo Tags",
      description:
        "List all tags currently applied to a specific photo. Use this to verify tagging results or check for duplicates before applying new tags.",
      inputSchema: {
        photo_id: z
          .string()
          .min(1)
          .describe("CompanyCam photo ID"),
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
          `photos/${args.photo_id}/tags`,
        );

        if (!data || data.length === 0) {
          return textResult(`No tags on photo ${args.photo_id}.`);
        }

        const lines = [`**${data.length} tag(s)** on photo ${args.photo_id}:`];
        for (const tag of data) {
          lines.push(
            `  • ${tag.display_value ?? "?"} (ID: ${tag.id ?? "?"})`,
          );
        }

        return textResult(lines.join("\n"));
      } catch (error) {
        if (error instanceof CompanyCamApiError && error.statusCode === 404) {
          return errorResult("Error: Resource not found. Check the photo ID is correct.");
        }
        return errorResult(
          `Error fetching photo tags: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // ────────────────────────────────────────────
  // cc_remove_photo_tags
  // ────────────────────────────────────────────

  server.registerTool(
    "cc_remove_photo_tags",
    {
      title: "Remove Tag from Photo",
      description:
        "Remove a specific tag from a photo. Get the tag_id from cc_list_tags or cc_get_photo_tags.",
      inputSchema: {
        photo_id: z
          .string()
          .min(1)
          .describe("CompanyCam photo ID"),
        tag_id: z
          .string()
          .min(1)
          .describe("Tag ID to remove (get from cc_list_tags or cc_get_photo_tags)"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const client = getClient();
        await client.delete(
          `photos/${args.photo_id}/tags/${args.tag_id}`,
        );
        return textResult(
          `Tag ${args.tag_id} removed from photo ${args.photo_id}.`,
        );
      } catch (error) {
        if (error instanceof CompanyCamApiError) {
          if (error.statusCode === 404) {
            return errorResult(
              "Error: Resource not found. Check the photo ID and tag ID are correct.",
            );
          }
          return errorResult(
            `Failed to remove tag (HTTP ${error.statusCode}):\n${error.responseBody}`,
          );
        }
        return errorResult(
          `Error removing tag: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
