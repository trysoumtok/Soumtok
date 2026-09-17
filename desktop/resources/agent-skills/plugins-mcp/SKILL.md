---
name: plugins-mcp
description: Use connected Soumtok plugins and MCP connectors (GitHub, Neon, Stripe, Figma, etc.). Use when the user mentions a connected service or asks to call an external API already in Connectors.
---
# Plugins and MCP

Account plugins and MCP connectors are listed in SOUMTOK PLATFORM CONTEXT.

- User connects from **Settings → Connectors** (or **Connect** on an installed skill pack). After Connect, call `mcp({ server: "<name or plugin_id>", tool: "<tool>", ... })`. Do not invent tokens.
- **Server aliases work** — e.g. `server: "figma"`, `"Figma"`, or the connector display name all resolve to the same connection.
- Call `mcp({ server: "<connector>", tool: "<tool>", ...args })` using the saved connection URL.
- Successful calls are saved under `mcp-exports/<server>/` in the project. Mention that path in the conclusion.
- **Design (Figma, Canva):** read frames/components/tokens via mcp(), then edit the open project (HTML/CSS/TS) to match. Ask for a Figma file URL if the user did not provide one.
- **Work apps (Notion, Linear, Slack):** fetch specs/issues via mcp(); reflect updates in code or docs when relevant.
- `generate_image(prompt)` creates still images only (saved under `assets/generated/`). Never generate video or music.
- `examine_media(path)` describes a workspace image or video.
- `read_skill` for a plugin skill name when the catalog description matches the job.
- Never print `.env` secrets. Use MCP instead of pasting API keys into source.
