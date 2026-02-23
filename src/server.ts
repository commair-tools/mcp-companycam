import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerPhotoTools } from "./tools/photos.js";
import { registerReferenceTools } from "./tools/reference.js";

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "companycam", version: "1.0.0" },
    { capabilities: { logging: {} } },
  );

  registerProjectTools(server);
  registerPhotoTools(server);
  registerReferenceTools(server);

  return server;
}
