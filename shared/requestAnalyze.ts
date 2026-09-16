import {
  classifyFollowUp,
  looksLikeFeatureAsk,
  looksLikeQuestion,
  looksLikeThemeAsk,
  requestedNewName,
  visibleBrandNames,
  type AgentEvent,
} from './agent.ts'
import { visibleHeaderMarks, wantsBrandAsset } from './brandLogo.ts'
import { isConnectIntent, matchUnconnectedCatalog } from './connectLinks.ts'
import { repairIntentText } from './typoIntent.ts'

export type RequestKind =
  | 'theme'
  | 'rename'
  | 'question'
  | 'connect'
  | 'edit'
  | 'build'
  | 'chat'
  | 'wipe'
  | 'run'
  | 'fix'
  | 'execute'
  | 'analyze'
  | 'image'

export type RequestAnalysis = {
  kind: RequestKind
  meaning: string
  do: string[]
  dont: string[]
  where?: string
  thought: string
  repaired: string
  renameTo?: string
  connectProvider?: string
  keep?: string[]
}

function isConfirmGoMessage(text: string) {
  return /^(go|yes|y|ok|okay|sure|do it|please|yep|yeah|go ahead|continue|build it|do that)[!.?\s]*$/i.test(
    String(text || '').trim(),
  )
}

export function repairUserText(text: string) {
  return repairIntentText(text)
}

function whereInPage(text: string) {
  if (/\bfooter\b/i.test(text) && !wantsBrandAsset(text)) return 'footer'
  if (wantsBrandAsset(text)) return 'header'
  if (/\bhero|headline|banner\b/i.test(text)) return 'hero'
  if (/\bheader|nav|top bar|hamburger|overlap\b/i.test(text)) return 'header'
  if (/\bsidebar\b/i.test(text)) return 'sidebar'
  return ''
}

function wantsRealLogo(text: string) {
  return wantsBrandAsset(text)
}

function wantsMorePages(text: string) {
  return /\b((more|another|any|new|extra|other) pages?|add (a |an |any |more )?pages?)\b/i.test(text)
}

function connectHit(text: string) {
  if (!isConnectIntent(text) && !/\b(use|with|enable)\b/i.test(text)) return null
  if (looksLikeThemeAsk(text) || looksLikeFeatureAsk(text)) return null
  const hits = matchUnconnectedCatalog(text, [])
  return hits[0] || null
}

/** Soumtok product, account, or casual chat — answer with the model, not a repo scan. */
export function isGeneralOrSoumtokChat(text: string) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
  if (!t) return true
  if (isConfirmGoMessage(t)) return false
  if (/^(hi+|hello+|hey+|hy+|hii+|heyy+|thanks?|thank you|ty|ok|okay|yes|no|yo|sup|wass?up)[\s!.?]*$/i.test(t)) {
    return true
  }
  if (
    /\b(fix|implement|refactor|change|edit|bug|selector|patch|broken)\b/.test(t) &&
    /\b(my |this |the )?(app|project|code|repo|dashboard|file|component|selector|workspace)\b/.test(t)
  ) {
    return false
  }
  if (/\b(src\/|apps\/|\.tsx?\b|\.jsx?\b)\b/.test(t)) return false
  if (
    /\b(soumtok|dashboard|billing|invoice|api key|connector|connectors|mcp|extension|claude code|sign in|sign-in|open folder|local tools|how do i|where (is|do)|what is soumtok|neon|lakebase|branch)\b/.test(
      t,
    )
  ) {
    return !/\b(apps\/|src\/|fix this bug|my repo|codebase|implement|grep|read file|in my)\b/.test(t)
  }
  if (
    /\b(plan|brainstorm|exercise|practice|roleplay|talk about|general question|life advice|explain like)\b/.test(t)
  ) {
    return !/\b(fix|bug|implement|refactor|apps\/|\.ts|\.tsx|my project code)\b/.test(t)
  }
  return false
}

function looksLikeWipeWorkspace(text: string) {
  const t = String(text || '')
  return (
    /\b(delete|remove|wipe|clear|trash|nuke|empty)\b[\s\S]{0,48}\b(everything|every file|all files|all of it|whole project|entire project|this project|this folder|the folder|the project)\b/i.test(
      t,
    ) ||
    /\b(delete|wipe)\s+(this|the)\s+(folder|project|repo)\b/i.test(t) ||
    /^delete everything/i.test(t.trim())
  )
}

function userAskedToPlaceImageInProject(text: string) {
  const t = String(text || '').toLowerCase()
  return (
    /\b(add|put|place|insert|replace|wire|use)\b/.test(t) &&
    /\b(hero|header|nav|footer|html|css|component|page|site|app|website|landing|in (the|this) (project|folder|repo|code))\b/.test(
      t,
    )
  )
}

function hasGenerateLikeVerb(t: string) {
  return (
    /\b(generate|create|make|draw|paint|render|imagine)\b/.test(t) ||
    /\bgener(?!al\b|ic\b|ous\b|ation\b|ator\b)[a-z]{0,12}\b/.test(t)
  )
}

function hasStillImageNoun(t: string) {
  return /\b(image|picture|photo|illustration|artwork|wallpaper|png|jpe?g|webp)\b/.test(t)
}

function looksLikeCodeOrAppJob(t: string) {
  return /\b(app|application|website|webapp|web app|component|gallery|slider|carousel|library|folder|repo|codebase|workspace|package\.json|\.tsx|\.jsx|html|css|function|class|hook|endpoint)\b/.test(
    t,
  )
}

function looksLikeVisualScene(t: string) {
  return (
    /\b(danc\w*|posing|flying|sitting|standing|jumping|walking|man|woman|person|people|guy|girl|boy|child|car|supercar|truck|bike|motorcycle|eagle|bird|cat|dog|horse|lion|wolf|city|street|sunset|sunrise|mountain|ocean|beach|forest|portrait|landscape|skyline|neon|night)\b/.test(
      t,
    ) || /\bwith a (man|woman|person|car|dog|cat|bird|eagle)\b/.test(t)
  )
}

function isImageFollowUp(t: string, hint?: { lastKind?: string; priorImage?: boolean }) {
  if (!/\b(a new one|another one|another|one more|again|new still|new picture|new photo)\b/.test(t)) return false
  if (hint?.lastKind === 'image' || hint?.priorImage) return true
  return looksLikeVisualScene(t)
}

/** Standalone still-image request — generate_image, do not scan the repo. */
export function looksLikeStandaloneImageGen(
  text: string,
  hint?: { lastKind?: string; priorImage?: boolean },
) {
  const raw = String(text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  const t = repairUserText(raw).toLowerCase().replace(/\s+/g, ' ').trim()
  if (!t) return false
  if (userAskedToPlaceImageInProject(t) || userAskedToPlaceImageInProject(raw)) return false
  if (/\b(image|picture|photo|illustration)s?\s+(gallery|app|page|component|library|slider|carousel)\b/.test(t)) {
    return false
  }
  if (/\b(explain|describe|analyze|analyse|what is|what'?s|tell me about)\b/.test(t) && !hasGenerateLikeVerb(t)) {
    return false
  }
  if (
    /\b(an?\s+)?(image|picture|photo|illustration)s?\s+of\b/.test(t) ||
    /\b(an?\s+)?(image|picture|photo|illustration)s?\s+of\b/.test(raw)
  ) {
    return true
  }
  if (hasStillImageNoun(t) && hasGenerateLikeVerb(t)) return true
  if (hasStillImageNoun(raw) && hasGenerateLikeVerb(raw)) return true
  if (
    /\ban?\s+[a-z][a-z-]{1,24}\s+(image|picture|photo)\b/.test(t) ||
    /\ban?\s+[a-z][a-z-]{1,24}\s+(image|picture|photo)\b/.test(raw)
  ) {
    return true
  }
  if (hasGenerateLikeVerb(t) && isImageFollowUp(t, hint) && !looksLikeCodeOrAppJob(t)) return true
  if (hasGenerateLikeVerb(t) && looksLikeVisualScene(t) && !looksLikeCodeOrAppJob(t)) return true
  if (
    (hint?.lastKind === 'image' || hint?.priorImage) &&
    looksLikeVisualScene(t) &&
    !looksLikeCodeOrAppJob(t) &&
    !/\b(explain|what is|fix|edit|implement)\b/.test(t)
  ) {
    return true
  }
  return hasStillImageNoun(t) && /\b(for me|please)\b/.test(t) && !/\b(fix|edit|change|update|add)\b/.test(t)
}

export function looksLikeRunExisting(text: string) {
  const t = String(text || '').toLowerCase()
  if (!t.trim()) return false
  if (/localhost|127\.0\.0\.1|local\s*host/.test(t)) return true
  if (/runmy/.test(t) && /local|host|app|server|dev|site/.test(t)) return true
  if (/run\s*my\s*(app|server|dev|local|site|project|web)/.test(t)) return true
  return /\b(start (the )?(dev |)?(server|app)|run (the )?(app|server|dev|project|web)|npm run (dev|start|serve|preview)|launch (the )?app)\b/i.test(
    t,
  )
}

function looksLikeGreenfieldCreate(text: string) {
  const t = String(text || '')
  if (looksLikeStandaloneImageGen(t)) return false
  return (
    /\b(build|create|make|scaffold|generate|from scratch)\b/i.test(t) &&
    /\b(app|application|website|web app|webapp|game|simulator|simulation|landing|dashboard|api|site|page|cli|command line|script|bot|server|tool|electron|desktop|python|flask|django)\b/i.test(
      t,
    )
  )
}

export function analyzeUserRequest(
  raw: string,
  ctx?: { hasFiles?: boolean; files?: Record<string, string>; attachments?: boolean; hasImage?: boolean; priorImage?: boolean; lastKind?: string },
): RequestAnalysis {
  const repaired = repairUserText(raw)
  const hasFiles = Boolean(ctx?.hasFiles || (ctx?.files && Object.keys(ctx.files).length))
  const hasImage = Boolean(ctx?.hasImage)
  const brands = ctx?.files ? visibleBrandNames(ctx.files) : []
  const keep = brands.slice(0, 3)
  const follow = classifyFollowUp(repaired, hasFiles, {
    attachments: Boolean(ctx?.attachments || hasImage),
  })
  const where = whereInPage(repaired)
  const plugin = connectHit(repaired)

  if (isConfirmGoMessage(repaired) || isConfirmGoMessage(raw)) {
    return {
      kind: 'execute',
      meaning: repaired || raw || 'go',
      do: [
        'Continue the pending work with tools now (write/diff/terminal as already planned)',
        'Do not re-scan the tree or re-read files you already have',
      ],
      dont: [
        'Treat this as a question',
        'Ask them to say go again',
        'Say tools are not allowed',
        'Only list_dir or ls',
      ],
      thought: 'Short confirmation — continue the previous job with tools.',
      repaired: repaired || 'go',
    }
  }

  if (looksLikeWipeWorkspace(repaired) || looksLikeWipeWorkspace(raw)) {
    return {
      kind: 'wipe',
      meaning: 'Wipe this workspace folder with tools until it is empty.',
      do: ['wipe_workspace() or delete every project file', 'Do not leave stray app files'],
      dont: ['Only describe the delete', 'Ask them to empty the folder themselves', 'Scaffold a new app'],
      thought: 'User asked to delete the project files — use wipe tools.',
      repaired,
    }
  }

  if (looksLikeStandaloneImageGen(repaired, ctx) || looksLikeStandaloneImageGen(raw, ctx)) {
    return {
      kind: 'image',
      meaning: repaired || raw,
      do: [
        'Tell them you understood the request, then generate_image({ prompt }) NOW with their subject',
        'Save the still to assets/generated/ and tell them the path',
      ],
      dont: [
        'list_dir, read, grep, or explore the project first',
        'Say you need tool access — generate_image is already enabled',
        'Ask where to put it or wait for another turn',
      ],
      thought: 'They want a still image generated — no repo scan.',
      repaired,
    }
  }

  if (
    (looksLikeRunExisting(repaired) || looksLikeRunExisting(raw)) &&
    !looksLikeGreenfieldCreate(repaired) &&
    !looksLikeGreenfieldCreate(raw)
  ) {
    return {
      kind: 'run',
      meaning: repaired || raw,
      do: [
        'terminal() the package.json start/dev script (Windows: ; not &&)',
        'read_terminal({ wait_ms: 20000 })',
        'Reply with the URL from that output — never from a URL found inside source files',
      ],
      dont: ['Scaffold a new app', 'Ask permission to run', 'Tell them to run it in their own terminal', 'Treat this as a question'],
      thought: 'They want the current app running — terminal then URL.',
      repaired,
    }
  }

  if (isGeneralOrSoumtokChat(repaired)) {
    return {
      kind: 'chat',
      meaning: repaired || 'General conversation or Soumtok help.',
      do: [
        'Understand the question first, then answer from Soumtok product knowledge and this chat',
        'Use tools only if they explicitly asked about files in their open project',
      ],
      dont: [
        'Force a repo scan or list_dir for casual chat',
        'Invent a coding task',
        'Say you cannot access Soumtok docs — use SOUMTOK PRODUCT GUIDE in context',
      ],
      thought: 'Understand first, then answer — no automatic code research.',
      repaired,
      keep,
    }
  }

  if (plugin) {
    return {
      kind: 'connect',
      meaning: `Connect ${plugin.name} so later tools can use it.`,
      do: [`Start the ${plugin.name} connect flow`],
      dont: ['Edit project files until they finish connecting', 'Treat this as a UI restyle'],
      thought: `They asked to connect ${plugin.name}.`,
      repaired,
      connectProvider: plugin.id,
    }
  }

  if (follow === 'question' || (follow !== 'task' && looksLikeQuestion(repaired))) {
    const meaning = /name|heading|title|brand/i.test(repaired)
      ? 'Answer with the current project name / heading from the existing files. Do not edit anything.'
      : 'Answer the question from the existing project and this chat. Do not start a new site or rewrite files.'
    return {
      kind: 'question',
      meaning,
      do: ['Understand the question first, then read only the files needed and reply with the fact they asked for'],
      dont: ['Write or rewrite files', 'Say Preview is ready', 'Treat this as a rename'],
      thought: 'They asked a question about the current project — I’ll answer, not edit.',
      repaired,
      keep,
    }
  }

  if (looksLikeThemeAsk(raw) || looksLikeThemeAsk(repaired)) {
    const place = where ? ` in the ${where}` : ' on the page'
    const meaning = `Add a working control that switches the existing page between dark and light appearance${place}. Wire CSS and JS so the look actually changes. Keep the current brand name.`
    return {
      kind: 'theme',
      meaning,
      do: [
        `Add a clickable light/dark theme toggle${place}`,
        'Update CSS (and JS if needed) so the page appearance switches',
        'Keep the existing layout and brand',
      ],
      dont: [
        'Rename the project or brand',
        'Put the user’s sentence into <title> or meta description',
        'Connect GitHub or any plugin',
        'Only change document metadata',
      ],
      where: where || undefined,
      thought: `Analyzed: add a working light/dark theme switch${place} — not a rename, and not the page title.`,
      repaired,
      keep,
    }
  }

  const renameTo = requestedNewName(repaired) || requestedNewName(raw)
  if (renameTo && !looksLikeFeatureAsk(repaired) && !looksLikeFeatureAsk(raw)) {
    return {
      kind: 'rename',
      meaning: `Rename the visible brand on the page to ${renameTo}. Change the pill, heading, and other user-visible names — not only <title>.`,
      do: [`Replace the current brand with ${renameTo} everywhere it is shown`],
      dont: ['Invent a new site', 'Only edit <title> or meta', 'Add unrelated features'],
      thought: `Analyzed: rename the visible brand to ${renameTo}.`,
      repaired,
      renameTo,
      keep,
    }
  }

  if (looksLikeGreenfieldCreate(repaired) || looksLikeGreenfieldCreate(raw)) {
    return {
      kind: 'build',
      meaning: repaired,
      do: [
        'write() every file for this app with full content',
        'terminal("npm install") then start (npm run dev / npm start)',
        'read_terminal({ wait_ms: 20000 }) and give the localhost URL',
      ],
      dont: [
        'Stop after list_dir',
        'Describe the plan without write()',
        'Ask the user what to build — they already said',
      ],
      thought: 'New app/site in this folder — write files and run it.',
      repaired,
    }
  }

  if (follow === 'task' || (hasFiles && /\b(add|fix|change|update|edit|make)\b/i.test(repaired))) {
    const meaning = repaired
    const shot = hasImage && hasFiles
    const logo = wantsRealLogo(repaired)
    const pages = wantsMorePages(repaired)
    const headerMarks = logo && ctx?.files ? visibleHeaderMarks(ctx.files) : []
    const extras = [
      ...(logo
        ? [
            'Fetch the brand SVG from Simple Icons (cdn.simpleicons.org/{slug} or jsDelivr). Save images/{slug}.svg',
            headerMarks.length
              ? `Replace the visible top-left header mark (${headerMarks.join(', ')}) with that SVG — that leftover word is the logo`
              : 'Replace the visible top-left header mark (.logo, .brand, or CSS content:) with that SVG',
            'Patch only the logo node (and CSS that paints those letters) on every HTML page',
          ]
        : []),
      ...(pages
        ? [
            'Add at least one new HTML page that does not already exist',
            'Link the new page in the nav on every existing page',
          ]
        : []),
    ]
    return {
      kind: 'edit',
      meaning: shot
        ? `Look at the attached screenshot of the current preview and fix that section in the existing files${where ? ` (${where})` : ''}: ${meaning}`
        : logo || pages
          ? [
              logo ? 'Put a real SVG logo of this brand in the header on every page' : '',
              pages ? 'Add more pages to the site and wire them in the nav' : '',
              headerMarks.length ? `Current header letters to replace: ${headerMarks.join(', ')}` : '',
              `Request: ${meaning}`,
            ]
              .filter(Boolean)
              .join('. ')
          : `Edit the existing project in place: ${meaning}`,
      do: shot
        ? [
            'Look at the screenshot — it is this project’s live preview',
            'Read the matching HTML/CSS/JS for the broken section',
            'Patch overlapping layout, missing images, and overflow in place',
          ]
        : extras.length
          ? extras
          : ['Change only what they asked for in the current files'],
      dont: [
        'Start a new unrelated site',
        'Rename the brand unless they asked',
        'Connect a plugin unless they asked',
        ...(shot ? ['Stop after describing the image', 'Scaffold a new page instead of editing the current one'] : []),
        ...(logo
          ? [
              ...(pages
                ? ['Rewrite unrelated hero/about/menu/contact copy']
                : ['Add pages, rewrite hero/about/menu/contact copy, or restyle the site']),
              'Replace a whole HTML file — diff only the logo node',
              'Leave the current header letters — that mark is the logo to replace',
              'Invent a text-only fake logo',
            ]
          : []),
        ...(pages && !logo ? ['Only list pages that already exist', 'Reply without writing files'] : []),
        ...(logo || pages ? ['Only describe the current logo or list pages that already exist', 'Reply without writing files'] : []),
      ],
      thought: shot
        ? `Analyzed: screenshot of the current preview — fix the broken section${where ? ` (${where})` : ''}.`
        : logo || pages
          ? `They want${logo && pages ? ' a real SVG logo in the header and more pages' : logo ? ' only a real SVG logo in the header — not new pages or a rewrite of the rest of the site' : ' more pages'}. Write the files.`
          : `Analyzed: ${meaning.slice(0, 160)}`,
      repaired,
      where: where || undefined,
      keep,
    }
  }

  if (!hasFiles && /\b(build|make|create|design)\b/i.test(repaired)) {
    return {
      kind: 'build',
      meaning: repaired,
      do: ['Build the thing they asked for'],
      dont: ['Ignore the request and ask to connect GitHub unless they asked'],
      thought: `Analyzed: ${repaired.slice(0, 160)}`,
      repaired,
    }
  }

  return {
    kind: 'chat',
    meaning: repaired || raw,
    do: ['Reply in context'],
    dont: ['Invent a coding task they did not ask for'],
    thought: 'Analyzed the message.',
    repaired: repaired || raw,
    keep,
  }
}

/** Block the coding model must obey. The user's sentence is the job. */
export function formatAnalyzedRequest(analysis: RequestAnalysis) {
  const keep = analysis.keep?.length ? `Keep brand: ${analysis.keep.join(', ')}` : ''
  const where = analysis.where ? `Where: ${analysis.where}` : ''
  return [
    'ANALYZED REQUEST — intent is a tools hint. The user sentence is the job.',
    `Intent: ${analysis.kind}`,
    `Meaning: ${analysis.meaning}`,
    where,
    analysis.do.length ? `Do:\n${analysis.do.map((item) => `- ${item}`).join('\n')}` : '',
    analysis.dont.length ? `Don't:\n${analysis.dont.map((item) => `- ${item}`).join('\n')}` : '',
    keep,
    `User asked: ${analysis.repaired}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** Visible handoff the user sees before the coding model starts. Now lives in the progress card, not the feed. */
export function analysisPipelineEvents(_analysis: RequestAnalysis): AgentEvent[] {
  return []
}
