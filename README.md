# mcp-companycam
MCP server connecting Claude Desktop to CompanyCam's photo management API for HVAC field documentation, project photos, and annotation workflows.

## Quick Start
1. `npm install`
2. `npm run build`
3. Copy `.env.example` to `.env` and add your CompanyCam API token
4. Add to `claude_desktop_config.json` (see `claude_desktop_config.example.json`)
5. Restart Claude Desktop

## Tools
- **8 read tools**: Search projects, get project/photo details, list photos/labels/comments/users/tags
- **5 write tools**: Add comments, tags, labels; update notepad

See `CLAUDE.md` for full architecture reference.
