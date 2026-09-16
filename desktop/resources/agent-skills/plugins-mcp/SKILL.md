---
name: plugins-mcp
description: Use connected Soumtok plugins and MCP connectors (GitHub, Neon, Stripe, Figma, etc.). Use when the user mentions a connected service or asks to call an external API already in Connectors.
---
# Plugins and MCP

Account plugins and MCP connectors are listed in SOUMTOK PLATFORM CONTEXT.

- User connects from **Settings → Connectors**. One card per MCP URL. After Connect, call `mcp({ server: "<name>", tool: "<tool>", ... })`. Do not invent tokens.
- Call `mcp({ server: "<connector name>", tool: "<tool>", ...args })` using the saved connection URL.
- Successful calls are saved under `mcp-exports/<server>/` in the project. Mention that path in the conclusion.
- `generate_image(prompt)` creates still images only (saved under `assets/generated/`). Never generate video or music.
- `examine_media(path)` describes a workspace image or video.
- `read_skill` for a plugin skill name when the catalog description matches the job.
- Never print `.env` secrets. Use MCP instead of pasting API keys into source.
