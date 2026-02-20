# CompanyCam MCP Server

## Project Overview
MCP server connecting Claude Desktop to CompanyCam's photo management API for Commercial Air, Inc. Enables AI-assisted project photo lookup, documentation workflows, and cross-referencing with Service Fusion jobs via address matching.

## Tech Stack
- **Runtime**: Node.js 18+, TypeScript
- **Protocol**: MCP (Model Context Protocol) via @modelcontextprotocol/sdk
- **Auth**: Bearer token (generated at app.companycam.com/access_tokens)
- **HTTP Client**: Native fetch with retry logic
- **Validation**: Zod schemas

## Architecture
Multi-file TypeScript project matching mcp-servicefusion structure:

```
src/
├── index.ts            # MCP server singleton, side-effect tool imports, stdio transport
├── client.ts           # CompanyCamClient class — Bearer auth, retries, error handling
├── tools/
│   ├── projects.ts     # 7 tools: search, get, labels, comments, notepad, add-comment, add-labels
│   ├── photos.ts       # 4 tools: list-project-photos, get-photo, add-tags, add-comment
│   └── reference.ts    # 2 tools: list-users, list-tags
└── utils/
    └── format.ts       # Formatting helpers (timestamps, addresses, projects, photos)
```

## CompanyCam API
- **Base URL**: `https://api.companycam.com/v2`
- **Auth**: `Authorization: Bearer {COMPANYCAM_API_TOKEN}`
- **Rate Limits**: Standard rate limiting with 429 responses; client retries with exponential backoff
- **Timestamps**: Unix seconds (not ISO 8601)
- **Pagination**: `page` and `per_page` query parameters (default 25, max 100)

## MCP Tools (13 total)

### Read Operations (8)
| Tool | Endpoint | Purpose |
|------|----------|---------|
| `cc_search_projects` | GET /projects | Search by name/address |
| `cc_get_project` | GET /projects/{id} | Full project details |
| `cc_list_project_photos` | GET /projects/{id}/photos | Photos with date/user/tag filters |
| `cc_get_photo` | GET /photos/{id} | Single photo details + all URLs |
| `cc_list_project_labels` | GET /projects/{id}/labels | Project labels |
| `cc_list_project_comments` | GET /projects/{id}/comments | Project comments |
| `cc_list_users` | GET /users | All company users |
| `cc_list_tags` | GET /tags | All photo tags |

### Write Operations (5)
| Tool | Endpoint | Purpose |
|------|----------|---------|
| `cc_add_project_comment` | POST /projects/{id}/comments | Add project comment |
| `cc_add_photo_tags` | POST /photos/{id}/tags | Tag photos |
| `cc_add_project_labels` | POST /projects/{id}/labels | Label projects |
| `cc_update_project_notepad` | PUT /projects/{id}/notepad | Update notepad (replaces content) |
| `cc_add_photo_comment` | POST /photos/{id}/comments | Add photo comment |

## Key Concepts
- **Labels vs Tags**: Labels are on projects, tags are on photos. Both use the Tag schema but different endpoints.
- **Notepad**: Project-level free text field. PUT replaces entire content — read first if appending.
- **Photo URIs**: Photos come in 3 sizes (original, web, thumbnail). Server returns web by default.
- **Cross-reference with Service Fusion**: Match by address — CC projects are address-based, SF jobs have customer addresses.

## Environment Variables
- `COMPANYCAM_API_TOKEN` (required) — Bearer token from app.companycam.com/access_tokens

## Running
```bash
# Build
npm run build

# Start
node build/index.js

# Dev (watch mode)
npm run dev
```
