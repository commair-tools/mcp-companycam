# CompanyCam MCP Server — Architecture & Endpoint Mapping

## Overview

A Python MCP server (`companycam_mcp`) wrapping the CompanyCam Core API v2, designed to run alongside the existing Service Fusion MCP server in Claude Desktop. Auth is a simple Bearer token generated at `app.companycam.com/access_tokens`.

**Base URL:** `https://api.companycam.com/v2`
**Auth:** `Authorization: Bearer {COMPANYCAM_API_TOKEN}`
**Rate Limits:** Standard rate limiting with 429 responses; implement exponential backoff.
**Plan Requirement:** Pro, Premium, or Elite

---

## Prerequisites

Before building, you need:
1. CompanyCam account on Pro+ plan with Admin role
2. API access token from `app.companycam.com/access_tokens`
3. Python 3.10+ with `mcp[cli]`, `httpx`, `pydantic`

---

## Proposed MCP Tools (Priority Order)

### Tier 1 — Daily Use (Build First)

| Tool Name | API Endpoint | Method | Purpose |
|---|---|---|---|
| `cc_search_projects` | `/projects` | GET | Search projects by name or address. Primary lookup tool. |
| `cc_get_project` | `/projects/{id}` | GET | Get full project details by ID |
| `cc_list_project_photos` | `/projects/{project_id}/photos` | GET | List photos for a project with date/user/tag filtering |
| `cc_get_photo` | `/photos/{id}` | GET | Get single photo details (URLs, tags, description, creator) |
| `cc_list_project_labels` | `/projects/{project_id}/labels` | GET | List labels on a project |
| `cc_list_project_comments` | `/projects/{project_id}/comments` | GET | List comments on a project |
| `cc_get_project_notepad` | `/projects/{id}` | GET | Read project notepad (included in project response) |
| `cc_list_users` | `/users` | GET | List all CompanyCam users (techs). Map to Service Fusion techs. |

### Tier 2 — Write Operations & Cross-Referencing

| Tool Name | API Endpoint | Method | Purpose |
|---|---|---|---|
| `cc_add_project_comment` | `/projects/{project_id}/comments` | POST | Add comment to a project |
| `cc_add_photo_comment` | `/photos/{photo_id}/comments` | POST | Add comment to a photo |
| `cc_add_photo_tags` | `/photos/{photo_id}/tags` | POST | Tag a photo (e.g., "Reviewed", "Issue Found") |
| `cc_add_project_labels` | `/projects/{project_id}/labels` | POST | Add labels to a project |
| `cc_update_project_notepad` | `/projects/{project_id}/notepad` | PUT | Update project notepad |
| `cc_update_photo_description` | `/photos/{photo_id}/descriptions` | POST | Update a photo's description |

### Tier 3 — Admin & Setup

| Tool Name | API Endpoint | Method | Purpose |
|---|---|---|---|
| `cc_create_project` | `/projects` | POST | Create new project (with address, contact, coordinates) |
| `cc_list_tags` | `/tags` | GET | List all company-wide photo tags |
| `cc_create_tag` | `/tags` | POST | Create a new photo tag |
| `cc_list_photos` | `/photos` | GET | Global photo search by date/user/tag |
| `cc_get_company` | `/company` | GET | Get company info |
| `cc_list_checklists` | `/checklists` | GET | List all checklists |
| `cc_list_project_checklists` | `/projects/{project_id}/checklists` | GET | Checklists for a specific project |
| `cc_list_project_documents` | `/projects/{project_id}/documents` | GET | Documents attached to a project |
| `cc_archive_project` | `/projects/{id}/archive` | PATCH | Archive a project |

---

## Key Data Models (from OpenAPI Spec)

### Project
```
id, company_id, creator_id, creator_name, status (active/deleted),
archived (bool), name, address {street_address_1, street_address_2,
city, state, postal_code, country}, coordinates {lat, lon},
featured_image [{type, url}], project_url, embedded_project_url,
integrations [{type, relation_id}], slug, public, geofence,
primary_contact {id, name, email, phone_number}, notepad,
created_at (unix), updated_at (unix)
```

### Photo
```
id, company_id, creator_id, creator_name, project_id,
processing_status (pending/processing/processed/processing_error/duplicate),
coordinates [{lat, lon}], uris [{type, url}] (original/web/thumbnail),
hash, description, internal (bool), photo_url, captured_at (unix),
created_at (unix), updated_at (unix)
```

### Tag (used for both photo tags and project labels)
```
id, company_id, display_value, value (lowercase), created_at, updated_at
```

### User
```
id, company_id, email_address, status, first_name, last_name,
profile_image, phone_number, created_at, updated_at, user_url
```

### Comment
```
id, creator_id, creator_type, creator_name, commentable_id,
commentable_type, status, content, created_at, updated_at
```

### Document
```
id, creator_id, creator_name, project_id, name, url,
content_type, byte_size, created_at, updated_at
```

---

## API Query Parameters

### Project Search (`/projects`)
- `query` — Filter by name OR address line 1 (this is your main lookup)
- `modified_since` — ISO8601 datetime filter
- `page`, `per_page` — Pagination

### Photo Listing (`/projects/{id}/photos` or `/photos`)
- `start_date`, `end_date` — Unix timestamps
- `user_ids[]` — Filter by photographer
- `group_ids[]` — Filter by group
- `tag_ids[]` — Filter by tag
- `page`, `per_page` — Pagination

---

## Cross-Referencing with Service Fusion

The key linkage between CompanyCam and Service Fusion is **address**. CompanyCam projects are address-based; Service Fusion jobs have customer addresses.

**Proposed workflow tools (Tier 2+):**

| Scenario | How It Works |
|---|---|
| "Show me photos from today's job at 123 Main St" | Search SF jobs by address → get address → search CC projects by that address → list photos |
| "Did the tech take before/after photos?" | Get SF job address → find CC project → list photos filtered by date range of the job |
| "Tag all photos from this job as reviewed" | Find CC project → list photos → batch tag |
| "Add a note to the CompanyCam project for this customer" | Get SF customer address → find CC project → update notepad or add comment |

These cross-reference workflows could be built as higher-level tools in a combined server, or handled conversationally by calling both MCP servers.

---

## Configuration for Claude Desktop

Add to `claude_desktop_config.json` alongside your existing Service Fusion server:

```json
{
  "mcpServers": {
    "service_fusion": {
      "command": "python",
      "args": ["/path/to/sf_mcp_server.py"],
      "env": {
        "SF_API_KEY": "your-service-fusion-key"
      }
    },
    "companycam": {
      "command": "python",
      "args": ["/path/to/companycam_mcp_server.py"],
      "env": {
        "COMPANYCAM_API_TOKEN": "your-companycam-token"
      }
    }
  }
}
```

---

## What CompanyCam API Can Do vs. Can't Do

### CAN Do via API
- Search/read projects, photos, tags, users, groups, checklists, documents
- Create projects, photos, tags, comments, labels, checklists, webhooks
- Update projects, photos, tags, users, notepad, webhooks
- Delete projects, photos, tags, labels, groups, webhooks
- Archive/restore projects
- Assign/remove users from projects

### CANNOT Do via API (UI-only)
- Photo annotations/markup (drawing on photos is app-only)
- Gallery creation or management
- Report generation
- Timeline/feed management beyond embed URL
- Photo reprocessing
- Billing or plan management

---

## Implementation Notes

1. **Timestamps**: CompanyCam uses Unix timestamps (seconds), not ISO8601. Convert in tool responses for readability.
2. **Photo URLs**: Photos come in 3 sizes (original, web, thumbnail). Return web size by default, mention original is available.
3. **Pagination**: Default `per_page` is likely 25-50. Implement auto-pagination for list tools or expose page/per_page params.
4. **Project search**: The `query` param searches name OR address line 1 — this is your main cross-reference vector with SF.
5. **Labels vs Tags**: "Labels" are on projects, "Tags" are on photos. Both use the Tag schema. Different endpoints.
6. **Integrations field**: Projects have an `integrations` array with `{type, relation_id}`. If CompanyCam has a Service Fusion integration enabled, this could provide a direct SF↔CC project link.
