import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

export const server = new McpServer(
  {
    name: "companycam",
    version: "1.0.0",
  },
  {
    capabilities: {
      logging: {},
    },
  },
);

async function main(): Promise<void> {
  // Register tools (side-effect imports that call server.registerTool)
  await import("./tools/projects.js");
  await import("./tools/photos.js");
  await import("./tools/reference.js");

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("CompanyCam MCP Server running on stdio");
}

main().catch((error: unknown) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
