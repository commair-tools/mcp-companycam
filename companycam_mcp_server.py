#!/usr/bin/env python3
"""
CompanyCam MCP Server — Tier 1 (Read Operations)
Connects Claude Desktop to CompanyCam's photo management API.

Setup:
  1. pip install "mcp[cli]" httpx pydantic
  2. Get your API token from app.companycam.com/access_tokens
  3. Set COMPANYCAM_API_TOKEN env var or pass in Claude Desktop config
  4. Add to claude_desktop_config.json (see companycam_mcp_plan.md)
"""

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
from mcp.server.fastmcp import FastMCP
from pydantic import BaseModel, ConfigDict, Field, field_validator

# ─── Configuration ───────────────────────────────────────────────────────────

BASE_URL = "https://api.companycam.com/v2"
API_TOKEN = os.environ.get("COMPANYCAM_API_TOKEN", "")
DEFAULT_PER_PAGE = 25
REQUEST_TIMEOUT = 30.0

mcp = FastMCP("companycam_mcp")

# ─── HTTP Client ─────────────────────────────────────────────────────────────


def _get_headers() -> Dict[str, str]:
    """Return authorization headers for CompanyCam API."""
    if not API_TOKEN:
        raise ValueError(
            "COMPANYCAM_API_TOKEN environment variable is not set. "
            "Generate a token at app.companycam.com/access_tokens"
        )
    return {
        "Authorization": f"Bearer {API_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


async def _api_get(
    path: str, params: Optional[Dict[str, Any]] = None
) -> Any:
    """Make an authenticated GET request to CompanyCam API."""
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.get(
            f"{BASE_URL}{path}",
            headers=_get_headers(),
            params=params or {},
        )
        response.raise_for_status()
        return response.json()


async def _api_post(path: str, data: Dict[str, Any]) -> Any:
    """Make an authenticated POST request to CompanyCam API."""
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.post(
            f"{BASE_URL}{path}",
            headers=_get_headers(),
            json=data,
        )
        response.raise_for_status()
        return response.json()


async def _api_put(path: str, data: Dict[str, Any]) -> Any:
    """Make an authenticated PUT request to CompanyCam API."""
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        response = await client.put(
            f"{BASE_URL}{path}",
            headers=_get_headers(),
            json=data,
        )
        response.raise_for_status()
        return response.json()


def _handle_api_error(e: Exception) -> str:
    """Consistent error formatting."""
    if isinstance(e, httpx.HTTPStatusError):
        status = e.response.status_code
        if status == 401:
            return "Error: Authentication failed. Check your COMPANYCAM_API_TOKEN."
        elif status == 403:
            return "Error: Permission denied. Ensure your account has API access (Pro+ plan, Admin role)."
        elif status == 404:
            return "Error: Resource not found. Check the ID is correct."
        elif status == 429:
            return "Error: Rate limit exceeded. Wait a moment and retry."
        else:
            body = e.response.text[:500]
            return f"Error: API returned {status}. Response: {body}"
    elif isinstance(e, httpx.TimeoutException):
        return "Error: Request timed out. Try again."
    elif isinstance(e, ValueError):
        return f"Error: {e}"
    return f"Error: {type(e).__name__}: {e}"


# ─── Formatting Helpers ──────────────────────────────────────────────────────


def _unix_to_str(ts: Optional[int]) -> str:
    """Convert Unix timestamp to readable string."""
    if not ts:
        return "N/A"
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def _format_address(addr: Optional[Dict]) -> str:
    """Format an address dict to a single line."""
    if not addr:
        return "No address"
    parts = [
        addr.get("street_address_1", ""),
        addr.get("street_address_2", ""),
        addr.get("city", ""),
        addr.get("state", ""),
        addr.get("postal_code", ""),
    ]
    return ", ".join(p for p in parts if p)


def _get_photo_url(uris: List[Dict], size: str = "web") -> str:
    """Extract a specific size URL from photo URIs list."""
    for uri in (uris or []):
        if uri.get("type") == size:
            return uri.get("url") or uri.get("uri", "")
    # Fallback to first available
    if uris:
        return uris[0].get("url") or uris[0].get("uri", "")
    return "No URL available"


def _format_project_summary(project: Dict) -> str:
    """Format a project for display."""
    addr = _format_address(project.get("address"))
    name = project.get("name") or "Unnamed"
    pid = project.get("id", "?")
    status = project.get("status", "?")
    archived = " [ARCHIVED]" if project.get("archived") else ""
    created = _unix_to_str(project.get("created_at"))
    updated = _unix_to_str(project.get("updated_at"))
    url = project.get("project_url", "")
    notepad = project.get("notepad", "")

    lines = [
        f"**{name}** (ID: {pid}){archived}",
        f"  Status: {status}",
        f"  Address: {addr}",
        f"  Created: {created} | Updated: {updated}",
    ]
    if url:
        lines.append(f"  URL: {url}")
    if notepad:
        lines.append(f"  Notepad: {notepad[:200]}{'...' if len(notepad) > 200 else ''}")

    # Show primary contact if present
    contact = project.get("primary_contact")
    if contact and contact.get("name"):
        contact_parts = [contact["name"]]
        if contact.get("phone_number"):
            contact_parts.append(contact["phone_number"])
        if contact.get("email"):
            contact_parts.append(contact["email"])
        lines.append(f"  Contact: {' | '.join(contact_parts)}")

    # Show integrations if present
    integrations = project.get("integrations", [])
    if integrations:
        int_strs = [f"{i.get('type', '?')}:{i.get('relation_id', '?')}" for i in integrations]
        lines.append(f"  Integrations: {', '.join(int_strs)}")

    return "\n".join(lines)


def _format_photo_summary(photo: Dict) -> str:
    """Format a photo for display."""
    pid = photo.get("id", "?")
    creator = photo.get("creator_name", "Unknown")
    desc = photo.get("description", "")
    captured = _unix_to_str(photo.get("captured_at"))
    url = _get_photo_url(photo.get("uris", []))
    internal = " [INTERNAL]" if photo.get("internal") else ""
    photo_link = photo.get("photo_url", "")

    lines = [
        f"Photo {pid}{internal} — by {creator} on {captured}",
    ]
    if desc:
        lines.append(f"  Description: {desc}")
    lines.append(f"  Image: {url}")
    if photo_link:
        lines.append(f"  Web: {photo_link}")
    return "\n".join(lines)


# ─── Input Models ────────────────────────────────────────────────────────────


class SearchProjectsInput(BaseModel):
    """Input for searching CompanyCam projects."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    query: str = Field(
        ...,
        description="Search by project name or address (e.g., '123 Main St' or 'Smith Residence')",
        min_length=1,
        max_length=200,
    )
    page: int = Field(default=1, description="Page number", ge=1)
    per_page: int = Field(default=DEFAULT_PER_PAGE, description="Results per page", ge=1, le=100)


class GetProjectInput(BaseModel):
    """Input for retrieving a single project."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    project_id: str = Field(..., description="CompanyCam project ID", min_length=1)


class ListProjectPhotosInput(BaseModel):
    """Input for listing photos in a project."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    project_id: str = Field(..., description="CompanyCam project ID", min_length=1)
    start_date: Optional[str] = Field(
        default=None,
        description="Filter photos from this date (ISO8601, e.g., '2025-01-15'). Converted to Unix timestamp.",
    )
    end_date: Optional[str] = Field(
        default=None,
        description="Filter photos until this date (ISO8601, e.g., '2025-02-20'). Converted to Unix timestamp.",
    )
    user_id: Optional[str] = Field(
        default=None,
        description="Filter by CompanyCam user ID (photographer)",
    )
    tag_id: Optional[str] = Field(
        default=None,
        description="Filter by tag ID",
    )
    page: int = Field(default=1, description="Page number", ge=1)
    per_page: int = Field(default=DEFAULT_PER_PAGE, description="Results per page", ge=1, le=100)


class GetPhotoInput(BaseModel):
    """Input for retrieving a single photo."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    photo_id: str = Field(..., description="CompanyCam photo ID", min_length=1)


class ListProjectLabelsInput(BaseModel):
    """Input for listing labels on a project."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    project_id: str = Field(..., description="CompanyCam project ID", min_length=1)


class ListProjectCommentsInput(BaseModel):
    """Input for listing comments on a project."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    project_id: str = Field(..., description="CompanyCam project ID", min_length=1)
    page: int = Field(default=1, description="Page number", ge=1)
    per_page: int = Field(default=DEFAULT_PER_PAGE, description="Results per page", ge=1, le=100)


class ListUsersInput(BaseModel):
    """Input for listing CompanyCam users."""
    model_config = ConfigDict(extra="forbid")

    page: int = Field(default=1, description="Page number", ge=1)
    per_page: int = Field(default=100, description="Results per page (up to 100)", ge=1, le=100)


class ListTagsInput(BaseModel):
    """Input for listing all company-wide photo tags."""
    model_config = ConfigDict(extra="forbid")

    page: int = Field(default=1, description="Page number", ge=1)
    per_page: int = Field(default=100, description="Results per page", ge=1, le=100)


# ─── Tier 2 Write Input Models ──────────────────────────────────────────────


class AddProjectCommentInput(BaseModel):
    """Input for adding a comment to a project."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    project_id: str = Field(..., description="CompanyCam project ID", min_length=1)
    content: str = Field(..., description="Comment text", min_length=1, max_length=5000)


class AddPhotoTagsInput(BaseModel):
    """Input for adding tags to a photo."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    photo_id: str = Field(..., description="CompanyCam photo ID", min_length=1)
    tags: List[str] = Field(
        ...,
        description="List of tag display values to add (e.g., ['Reviewed', 'Before'])",
        min_length=1,
    )


class AddProjectLabelsInput(BaseModel):
    """Input for adding labels to a project."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    project_id: str = Field(..., description="CompanyCam project ID", min_length=1)
    labels: List[str] = Field(
        ...,
        description="List of label names to add (e.g., ['Commercial', 'Priority'])",
        min_length=1,
    )


class UpdateNotepadInput(BaseModel):
    """Input for updating a project's notepad."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    project_id: str = Field(..., description="CompanyCam project ID", min_length=1)
    notepad: str = Field(..., description="New notepad content (replaces existing)", max_length=10000)


class AddPhotoCommentInput(BaseModel):
    """Input for adding a comment to a photo."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    photo_id: str = Field(..., description="CompanyCam photo ID", min_length=1)
    content: str = Field(..., description="Comment text", min_length=1, max_length=5000)


# ─── Tier 1 Tools: Read Operations ──────────────────────────────────────────


@mcp.tool(
    name="cc_search_projects",
    annotations={
        "title": "Search CompanyCam Projects",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def cc_search_projects(params: SearchProjectsInput) -> str:
    """Search CompanyCam projects by name or address.

    This is the primary lookup tool for finding projects. The query searches
    both project names and address line 1.

    Args:
        params: Search parameters including query string and pagination.

    Returns:
        str: Formatted list of matching projects with IDs, addresses, and status.
    """
    try:
        data = await _api_get(
            "/projects",
            params={
                "query": params.query,
                "page": params.page,
                "per_page": params.per_page,
            },
        )

        if not data:
            return f"No projects found matching '{params.query}'."

        lines = [f"**Found {len(data)} project(s) matching '{params.query}'** (page {params.page}):\n"]
        for project in data:
            lines.append(_format_project_summary(project))
            lines.append("")

        if len(data) == params.per_page:
            lines.append(f"_More results may be available on page {params.page + 1}._")

        return "\n".join(lines)
    except Exception as e:
        return _handle_api_error(e)


@mcp.tool(
    name="cc_get_project",
    annotations={
        "title": "Get CompanyCam Project Details",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def cc_get_project(params: GetProjectInput) -> str:
    """Get full details for a specific CompanyCam project by ID.

    Returns project name, address, status, notepad, contact info,
    integrations, and timestamps.

    Args:
        params: Project ID to retrieve.

    Returns:
        str: Formatted project details.
    """
    try:
        project = await _api_get(f"/projects/{params.project_id}")
        return _format_project_summary(project)
    except Exception as e:
        return _handle_api_error(e)


@mcp.tool(
    name="cc_list_project_photos",
    annotations={
        "title": "List Project Photos",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def cc_list_project_photos(params: ListProjectPhotosInput) -> str:
    """List photos for a CompanyCam project with optional filtering.

    Can filter by date range, user (photographer), and tag. Returns photo IDs,
    image URLs, descriptions, and capture timestamps.

    Args:
        params: Project ID and optional filters (dates, user, tag).

    Returns:
        str: Formatted list of photos with URLs and metadata.
    """
    try:
        api_params: Dict[str, Any] = {
            "page": params.page,
            "per_page": params.per_page,
        }

        # Convert ISO dates to Unix timestamps if provided
        if params.start_date:
            dt = datetime.fromisoformat(params.start_date.replace("Z", "+00:00"))
            api_params["start_date"] = str(int(dt.timestamp()))
        if params.end_date:
            dt = datetime.fromisoformat(params.end_date.replace("Z", "+00:00"))
            api_params["end_date"] = str(int(dt.timestamp()))
        if params.user_id:
            api_params["user_ids[]"] = params.user_id
        if params.tag_id:
            api_params["tag_ids[]"] = params.tag_id

        data = await _api_get(
            f"/projects/{params.project_id}/photos", params=api_params
        )

        if not data:
            return f"No photos found for project {params.project_id} with the given filters."

        lines = [f"**{len(data)} photo(s)** for project {params.project_id} (page {params.page}):\n"]
        for photo in data:
            lines.append(_format_photo_summary(photo))
            lines.append("")

        if len(data) == params.per_page:
            lines.append(f"_More photos may be available on page {params.page + 1}._")

        return "\n".join(lines)
    except Exception as e:
        return _handle_api_error(e)


@mcp.tool(
    name="cc_get_photo",
    annotations={
        "title": "Get Photo Details",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def cc_get_photo(params: GetPhotoInput) -> str:
    """Get full details for a specific photo by ID.

    Returns all image URLs (original, web, thumbnail), description,
    creator info, coordinates, and timestamps.

    Args:
        params: Photo ID to retrieve.

    Returns:
        str: Formatted photo details including all image URLs.
    """
    try:
        photo = await _api_get(f"/photos/{params.photo_id}")

        lines = [_format_photo_summary(photo)]

        # Add extra detail not in summary
        coords = photo.get("coordinates")
        if coords:
            for c in coords if isinstance(coords, list) else [coords]:
                lines.append(f"  Location: {c.get('lat', '?')}, {c.get('lon', '?')}")

        uris = photo.get("uris", [])
        if len(uris) > 1:
            lines.append("  All sizes:")
            for uri in uris:
                lines.append(f"    {uri.get('type', '?')}: {uri.get('url') or uri.get('uri', '')}")

        lines.append(f"  Processing: {photo.get('processing_status', '?')}")
        lines.append(f"  Project ID: {photo.get('project_id', '?')}")

        return "\n".join(lines)
    except Exception as e:
        return _handle_api_error(e)


@mcp.tool(
    name="cc_list_project_labels",
    annotations={
        "title": "List Project Labels",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def cc_list_project_labels(params: ListProjectLabelsInput) -> str:
    """List all labels applied to a CompanyCam project.

    Labels are like tags on projects (different from photo tags).

    Args:
        params: Project ID to list labels for.

    Returns:
        str: List of label names and IDs.
    """
    try:
        data = await _api_get(f"/projects/{params.project_id}/labels")

        if not data:
            return f"No labels on project {params.project_id}."

        lines = [f"**{len(data)} label(s)** on project {params.project_id}:"]
        for tag in data:
            lines.append(f"  • {tag.get('display_value', '?')} (ID: {tag.get('id', '?')})")

        return "\n".join(lines)
    except Exception as e:
        return _handle_api_error(e)


@mcp.tool(
    name="cc_list_project_comments",
    annotations={
        "title": "List Project Comments",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def cc_list_project_comments(params: ListProjectCommentsInput) -> str:
    """List comments on a CompanyCam project.

    Args:
        params: Project ID and pagination.

    Returns:
        str: List of comments with author and timestamp.
    """
    try:
        data = await _api_get(
            f"/projects/{params.project_id}/comments",
            params={"page": params.page, "per_page": params.per_page},
        )

        if not data:
            return f"No comments on project {params.project_id}."

        lines = [f"**{len(data)} comment(s)** on project {params.project_id}:\n"]
        for comment in data:
            author = comment.get("creator_name", "Unknown")
            content = comment.get("content", "")
            created = _unix_to_str(comment.get("created_at"))
            lines.append(f"  [{created}] **{author}**: {content}")

        return "\n".join(lines)
    except Exception as e:
        return _handle_api_error(e)


@mcp.tool(
    name="cc_list_users",
    annotations={
        "title": "List CompanyCam Users",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def cc_list_users(params: ListUsersInput) -> str:
    """List all CompanyCam users in the company.

    Useful for mapping technician names to user IDs for photo filtering.

    Args:
        params: Pagination options.

    Returns:
        str: List of users with names, emails, and IDs.
    """
    try:
        data = await _api_get(
            "/users",
            params={"page": params.page, "per_page": params.per_page},
        )

        if not data:
            return "No users found."

        lines = [f"**{len(data)} user(s):**\n"]
        for user in data:
            name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
            email = user.get("email_address", "")
            uid = user.get("id", "?")
            status = user.get("status", "?")
            lines.append(f"  • {name} — ID: {uid} | {email} | {status}")

        return "\n".join(lines)
    except Exception as e:
        return _handle_api_error(e)


@mcp.tool(
    name="cc_list_tags",
    annotations={
        "title": "List All Photo Tags",
        "readOnlyHint": True,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def cc_list_tags(params: ListTagsInput) -> str:
    """List all company-wide photo tags.

    Photo tags are different from project labels. Use tag IDs to filter
    photos in cc_list_project_photos.

    Args:
        params: Pagination options.

    Returns:
        str: List of tag names and IDs.
    """
    try:
        data = await _api_get(
            "/tags",
            params={"page": params.page, "per_page": params.per_page},
        )

        if not data:
            return "No tags found."

        lines = [f"**{len(data)} tag(s):**\n"]
        for tag in data:
            lines.append(f"  • {tag.get('display_value', '?')} (ID: {tag.get('id', '?')})")

        return "\n".join(lines)
    except Exception as e:
        return _handle_api_error(e)


# ─── Tier 2 Tools: Write Operations ─────────────────────────────────────────


@mcp.tool(
    name="cc_add_project_comment",
    annotations={
        "title": "Add Project Comment",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": True,
    },
)
async def cc_add_project_comment(params: AddProjectCommentInput) -> str:
    """Add a comment to a CompanyCam project.

    Args:
        params: Project ID and comment text.

    Returns:
        str: Confirmation with the created comment details.
    """
    try:
        data = await _api_post(
            f"/projects/{params.project_id}/comments",
            data={"comment": {"content": params.content}},
        )
        author = data.get("creator_name", "Unknown")
        created = _unix_to_str(data.get("created_at"))
        return f"Comment added to project {params.project_id} by {author} at {created}:\n\"{data.get('content', '')}\""
    except Exception as e:
        return _handle_api_error(e)


@mcp.tool(
    name="cc_add_photo_tags",
    annotations={
        "title": "Add Tags to Photo",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": True,
    },
)
async def cc_add_photo_tags(params: AddPhotoTagsInput) -> str:
    """Add one or more tags to a photo.

    Tags are created company-wide if they don't already exist.

    Args:
        params: Photo ID and list of tag names.

    Returns:
        str: Confirmation of tags added.
    """
    try:
        data = await _api_post(
            f"/photos/{params.photo_id}/tags",
            data={"tag": {"display_values": params.tags}},
        )

        if isinstance(data, list) and data:
            tag_names = [t.get("display_value", "?") for t in data]
        else:
            tag_names = params.tags

        return f"Tags added to photo {params.photo_id}: {', '.join(tag_names)}"
    except Exception as e:
        return _handle_api_error(e)


@mcp.tool(
    name="cc_add_project_labels",
    annotations={
        "title": "Add Labels to Project",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": True,
    },
)
async def cc_add_project_labels(params: AddProjectLabelsInput) -> str:
    """Add one or more labels to a CompanyCam project.

    Labels are like tags but applied to projects (not individual photos).

    Args:
        params: Project ID and list of label names.

    Returns:
        str: Confirmation of labels added.
    """
    try:
        data = await _api_post(
            f"/projects/{params.project_id}/labels",
            data={"project": {"labels": params.labels}},
        )
        return f"Labels added to project {params.project_id}: {', '.join(params.labels)}"
    except Exception as e:
        return _handle_api_error(e)


@mcp.tool(
    name="cc_update_project_notepad",
    annotations={
        "title": "Update Project Notepad",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": True,
        "openWorldHint": True,
    },
)
async def cc_update_project_notepad(params: UpdateNotepadInput) -> str:
    """Update the notepad content on a CompanyCam project.

    WARNING: This replaces the entire notepad content. Read the current
    notepad first if you need to append.

    Args:
        params: Project ID and new notepad content.

    Returns:
        str: Confirmation of update.
    """
    try:
        await _api_put(
            f"/projects/{params.project_id}/notepad",
            data={"notepad": params.notepad},
        )
        return f"Notepad updated for project {params.project_id}. New content ({len(params.notepad)} chars)."
    except Exception as e:
        return _handle_api_error(e)


@mcp.tool(
    name="cc_add_photo_comment",
    annotations={
        "title": "Add Photo Comment",
        "readOnlyHint": False,
        "destructiveHint": False,
        "idempotentHint": False,
        "openWorldHint": True,
    },
)
async def cc_add_photo_comment(params: AddPhotoCommentInput) -> str:
    """Add a comment to a specific photo.

    Args:
        params: Photo ID and comment text.

    Returns:
        str: Confirmation with the created comment details.
    """
    try:
        data = await _api_post(
            f"/photos/{params.photo_id}/comments",
            data={"comment": {"content": params.content}},
        )
        author = data.get("creator_name", "Unknown")
        return f"Comment added to photo {params.photo_id} by {author}:\n\"{data.get('content', '')}\""
    except Exception as e:
        return _handle_api_error(e)


# ─── Entry Point ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run()
