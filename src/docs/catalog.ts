export type DocsBlock =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'callout'; text: string }
  | { type: 'image'; src: string; alt: string }
  | { type: 'steps'; items: string[] }

export type DocsPage = {
  id: string
  title: string
  crumb: string
  toc: { id: string; title: string }[]
  blocks: ({ id?: string; title?: string } & DocsBlock)[]
}

export type DocsNavGroup = {
  title: string
  items: { id: string; title: string }[]
}

export const DOCS_NAV: DocsNavGroup[] = [
  {
    title: 'Get started',
    items: [
      { id: 'overview', title: 'Overview' },
      { id: 'quick-start', title: 'Quick start' },
      { id: 'accounts', title: 'Accounts' },
      { id: 'profile', title: 'Handle & public profile' },
    ],
  },
  {
    title: 'Studio',
    items: [
      { id: 'studio', title: 'Studio chat' },
      { id: 'models', title: 'Models' },
      { id: 'codebase', title: 'Codebase' },
      { id: 'automations', title: 'Automations' },
      { id: 'agents', title: 'Cloud agents' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { id: 'dashboard', title: 'Dashboard' },
      { id: 'github', title: 'GitHub' },
      { id: 'plugins', title: 'Plugins' },
      { id: 'connectors', title: 'Connectors' },
      { id: 'skills', title: 'Skills' },
      { id: 'keys', title: 'API keys' },
      { id: 'billing', title: 'Billing' },
      { id: 'settings', title: 'Settings & security' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { id: 'api', title: 'API' },
      { id: 'cli', title: 'CLI' },
      { id: 'plans', title: 'Plans' },
      { id: 'company', title: 'Company' },
    ],
  },
]

export const DOCS_PAGES: DocsPage[] = [
  {
    id: 'overview',
    title: 'Soumtok',
    crumb: 'Docs',
    toc: [
      { id: 'what', title: 'What it is' },
      { id: 'who', title: 'Who it is for' },
      { id: 'surfaces', title: 'Product surfaces' },
      { id: 'stack', title: 'How it is built' },
      { id: 'not', title: 'What it is not' },
      { id: 'next', title: 'Next steps' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Soumtok is a coding-agent workspace for builders in Africa and the diaspora. You sign in, finish onboarding, open Studio, attach a GitHub repo, pick a model, and ship. Chat, models, and git live in one dark desk. GitHub stays the source of truth for your code. You do not rent a second host, and you do not paste the repo into a generic chatbot.',
      },
      {
        type: 'p',
        text: 'The pitch is simple because the loop is simple. One account. One Studio. Models from DeepSeek, Gemini, Claude, Grok, and GPT. Pay with PayPal or M-Pesa. The agent writes against the repos you already keep on GitHub. That is the product we ship today — not a fleet of rented machines, not a desktop installer, not a second git company.',
      },
      {
        id: 'what',
        title: 'What it is',
        type: 'p',
        text: 'There are two shells. The dashboard is the workspace around the work: Overview, Models, Settings, Plugins, Connectors, Skills, Keys, Members, Usage, Spending, Billing. Studio is a separate full-screen desk. Clicking Studio replaces that chrome with New Chat, Automations, Codebase, and a way back to Dashboard. The public landing site explains Studio, models, pricing, and the Windows waitlist. Work happens after you are signed in.',
      },
      {
        type: 'p',
        text: 'A handle is optional to publish but required to finish onboarding. Your page can stay private. Files and some APIs stay locked until email and phone are verified with Soumtok codes — a Google “email verified” flag is not enough.',
      },
      {
        id: 'who',
        title: 'Who it is for',
        type: 'ul',
        items: [
          'Solo builders and students who want a local-feeling coding agent without juggling five provider dashboards',
          'Shops that pay in ways that work here — PayPal today, M-Pesa through PayHero',
          'Teams that need shared seats, usage analytics, and a handle policy on Team or Team Premium',
          'Anyone who already lives on GitHub and wants the agent to open branches and pull requests there',
          'People who will wait for a Windows app instead of pretending one already ships',
        ],
      },
      {
        id: 'surfaces',
        title: 'Product surfaces',
        type: 'ul',
        items: [
          'Studio — prompt box, model picker, GitHub attach, multitask, skills, MCP, search',
          'Codebase — grant repos, pick one, start a chat with that project attached',
          'Automations — scheduled or webhook jobs that reuse the same models and GitHub attach',
          'Dashboard — overview, models catalog, usage, spending, billing, settings, keys, members',
          'Public profile — /yourhandle when you flip the page to Public',
          'Landing — Studio story, models, pricing, Windows waitlist. Trial is not sold as a landing card',
          'Docs — this site. Learn more in the product always opens a matching guide here',
        ],
      },
      {
        id: 'stack',
        title: 'How it is built',
        type: 'p',
        text: 'The app is Vite, React, and TypeScript. Better Auth writes to public.user, public.account, and public.profiles on Neon (Lakebase) Postgres. Do not turn on Neon console Auth — it would fight Better Auth. Uploads go to Bunny (soumtok-files). Coding calls use platform env keys or your own keys for OpenAI, Anthropic, Google, DeepSeek, and xAI. Still images in Studio are Flux 2 Max on Replicate (REPLICATE_API_TOKEN), with Fal Schnell as a fallback. Video, music, audio, and TTS model ids are rejected.',
      },
      {
        id: 'not',
        title: 'What it is not',
        type: 'ul',
        items: [
          'Not a second git host. GitHub is canonical. Codebase lists granted repos and attaches them to Studio',
          'Not a Windows desktop product yet. The landing waitlist is the app. Studio in the browser is what ships',
          'Not a video or music studio. Image generation is stills only and is not listed as a count on the Models page',
          'Spending meters Soumtok models and your own keys. There is no third branded quota row',
        ],
      },
      {
        id: 'next',
        title: 'Next steps',
        type: 'steps',
        items: [
          'Create an account and finish onboarding (username, how you found us, country, email code, phone code)',
          'Open Studio and send a first chat',
          'Connect GitHub on Codebase and grant at least one repo',
          'Pick a ready model and attach that repo from Start from scratch or + → Files',
        ],
      },
    ],
  },
  {
    id: 'quick-start',
    title: 'Quick start',
    crumb: 'Get started',
    toc: [
      { id: 'sign-up', title: 'Sign up' },
      { id: 'onboard', title: 'Finish setup' },
      { id: 'first-chat', title: 'First chat' },
      { id: 'repo', title: 'Attach a repo' },
      { id: 'spend', title: 'Watch usage' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'You can be in a working Studio chat in a few minutes. This path assumes a new account on Trial. Paid plans change how much included usage you have, not the first-run steps. The goal is not a tour. The goal is one real prompt against one real repo.',
      },
      {
        id: 'sign-up',
        title: 'Sign up',
        type: 'p',
        text: 'Go to /signup. Use email and password, Google, GitHub, or a magic link. You stay signed in until you click Log Out, or until 48 hours after that sign-in. After sign-in you always land on /onboarding until the profile is complete. Google and GitHub still need the Soumtok email code and phone code — social login does not skip the gate.',
      },
      {
        id: 'onboard',
        title: 'Finish setup',
        type: 'ul',
        items: [
          'Choose a username (3–20 characters, starts with a letter — see Handle & public profile)',
          'Say how you found Soumtok',
          'Set your country',
          'Verify email with the Soumtok 6-digit code sent to your inbox',
          'Verify phone with a 6-digit SMS code',
        ],
      },
      {
        type: 'callout',
        text: 'Incomplete profiles cannot use files or several write APIs. Those routes return 403 until onboarding is done. finishIfReady only sets completed_at when username, how_found, country, email_verified_at, and phone_verified_at are all present.',
      },
      {
        id: 'first-chat',
        title: 'First chat',
        type: 'p',
        text: 'Open Dashboard → Studio. The whole chrome swaps to the Studio shell. The prompt box says Ask Soumtok to build, fix bugs, explore. Enter sends. Shift+Enter is a new line. The model name next to + opens the picker — hover a model for about two seconds to read why you would pick it. Studio default is DeepSeek V4 Flash if that provider is ready. Search in the sidebar is a command palette for New Chat and actions. Docs search is Command-K on this docs site, not inside Studio.',
      },
      {
        id: 'repo',
        title: 'Attach a repo',
        type: 'p',
        text: 'Two ways. From an empty chat, click Start from scratch and connect a GitHub project. Or open Studio → Codebase, press Get Started, grant repos to the Soumtok GitHub App, then click a row. Clicking a repo stores it in sessionStorage as soumtok-project and opens Studio with that project in the system prompt (name, language, description — not the full tree unless an agent clones it).',
      },
      {
        id: 'spend',
        title: 'Watch usage',
        type: 'p',
        text: 'Dashboard → Spending shows Trial as two cards: included usage percent and Upgrade to Pro. When the trial pool is gone, the usage card says Free trial ended — upgrade to keep coding. Paid cycles count from plan start, not leftover trial tokens. Dashboard → Usage has a date picker, token cards, a model chart, and a request table. Empty usage still shows that layout with zeros and No data. Overview has token totals plus a year heatmap.',
      },
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts',
    crumb: 'Get started',
    toc: [
      { id: 'providers', title: 'Sign-in methods' },
      { id: 'session', title: 'Sessions' },
      { id: 'onboarding', title: 'Onboarding gate' },
      { id: 'tables', title: 'Where users live' },
      { id: 'profile', title: 'Public profile' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Auth is Better Auth, not Neon console Auth. If you open the Neon project, look at Tables → public.user, public.account, and public.profiles. The Neon Auth → Users screen is a different product. Leave it off.',
      },
      {
        id: 'providers',
        title: 'Sign-in methods',
        type: 'ul',
        items: [
          'Email and password',
          'Google — callback must be exactly /api/auth/callback/google on the app origin (local: http://localhost:5173/api/auth/callback/google)',
          'GitHub — callback /api/auth/callback/github, scopes read:user, user:email, repo',
          'Magic link delivered through SMTP as info@soumtok.com',
        ],
      },
      {
        id: 'session',
        title: 'Sessions',
        type: 'p',
        text: 'A session lasts until you click Log Out, or 48 hours after you signed in — whichever comes first. Activity does not extend it. Settings → Security lists Web devices. Revoking a session can take up to ten minutes to show everywhere. trustedOrigins in the auth server config must stay a static array — do not build it from request headers.',
      },
      {
        id: 'onboarding',
        title: 'Onboarding gate',
        type: 'p',
        text: 'isOnboardingComplete is true only when the profile is completed, a username exists, emailVerified is the Soumtok code (email_verified_at), and phoneVerified is set (phone_verified_at). Google’s own emailVerified is ignored for this gate. Until then, file uploads and similar routes 403.',
      },
      {
        id: 'tables',
        title: 'Where users live',
        type: 'ul',
        items: [
          'public.user — Better Auth identity (id, email, name)',
          'public.account — OAuth and credential links, including the GitHub access token',
          'public.profiles — handle, plan, country, verification timestamps, avatar flags, public_profile',
        ],
      },
      {
        id: 'profile',
        title: 'Public profile',
        type: 'p',
        text: 'A claimed handle can be public at /your-handle with no @ in the path. The long guide is Handle & public profile.',
      },
    ],
  },
  {
    id: 'profile',
    title: 'Handle & public profile',
    crumb: 'Get started',
    toc: [
      { id: 'what', title: 'What a handle is' },
      { id: 'claim', title: 'Claim your handle' },
      { id: 'rules', title: 'Rules' },
      { id: 'reserved', title: 'Reserved words' },
      { id: 'url', title: 'Your public URL' },
      { id: 'privacy', title: 'Private vs public' },
      { id: 'photo', title: 'Profile image' },
      { id: 'links', title: 'Links' },
      { id: 'page', title: 'What people see' },
      { id: 'settings', title: 'Settings vs the modal' },
      { id: 'next', title: 'Next steps' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Your handle is the name you own on Soumtok. It is not a nickname in chat. It is the address of your page. When someone opens soumtok.com/joseph they are asking for the public profile that belongs to the handle joseph. This guide is the long version of the Claim your handle modal — every rule, every screen, and what stays private until you flip the switch.',
      },
      {
        id: 'what',
        title: 'What a handle is',
        type: 'p',
        text: 'Soumtok treats a handle as a first-class username stored on public.profiles.username. You pick it during onboarding, you can change it later if the new one is free, and you can show or hide the page that sits on it. The modal copy is exact: a public profile for how you build, showing token, model, and agent usage when you choose to publish. Until then the handle is still yours. It is just not on the open web.',
      },
      {
        type: 'p',
        text: 'The handle is also how Soumtok talks about you inside the product. Dashboard settings show Public page · localhost:5173/joseph (or soumtok.com/joseph in production). The account menu, Studio sidebar, and Settings all read the same profile row. If you upload a photo, that photo is the circle next to your name in the sidebar the moment the upload finishes.',
      },
      {
        id: 'claim',
        title: 'Claim your handle',
        type: 'p',
        text: 'Open the account card at the bottom of the sidebar → Create Profile. The first step is Claim your handle. You type a handle. Under the box Soumtok prints Visible at soumtok.com/@you and a live status: Checking…, Available, Claimed, Taken, or a validation error in orange. Learn more on that card opens this page and closes the modal.',
      },
      {
        type: 'steps',
        items: [
          'Open the outlined account card in the sidebar',
          'Choose Create Profile',
          'Type a handle that starts with a letter',
          'Wait until the status says Available or Claimed',
          'Press Claim or Next',
          'Add links, set Public or Private, then View Profile or Share',
        ],
      },
      {
        type: 'p',
        text: 'Claim calls savePublicProfile with that username. If another account already has it, the API rejects the write and the modal shows the error. If it is yours already, status is Claimed and Next just continues. After a successful claim you move to the second step: avatar, links, visibility, Share, and View Profile.',
      },
      {
        id: 'rules',
        title: 'Rules',
        type: 'ul',
        items: [
          'Length 3 to 20 characters after trim',
          'Must start with a letter (a–z or A–Z)',
          'After that: letters, numbers, and underscore only',
          'No spaces — spaces are stripped on normalize',
          'No two underscores in a row',
          'Cannot end with an underscore',
          'Case is stored as you type; reserved checks are case-insensitive',
        ],
      },
      {
        type: 'p',
        text: 'These rules live in shared/username.ts and run in the browser before the network check, then again on the server when you save. That is why a bad handle turns orange instantly, and why Taken only appears after checkUsername returns.',
      },
      {
        id: 'reserved',
        title: 'Reserved words',
        type: 'p',
        text: 'Soumtok will not let a person claim a path that is already a product route or a staff word. Reserved includes admin, api, auth, billing, dashboard, docs, login, models, onboarding, settings, signup, soumtok, studio, support, usage, www, and the rest of the list in shared/username.ts. App routing also blocks login, signup, onboarding, dashboard, docs, privacy, terms, api, images, and assets from being treated as a public profile slug.',
      },
      {
        id: 'url',
        title: 'Your public URL',
        type: 'p',
        text: 'Locally the page is http://localhost:5173/yourhandle. In production it is https://soumtok.com/yourhandle. The modal sometimes prints soumtok.com/@handle as a human label. The actual route has no @ — it is /joseph, not /@joseph. Bookmark the slash form. Share can copy the origin + /handle URL or use the system share sheet.',
      },
      {
        id: 'privacy',
        title: 'Private vs public',
        type: 'p',
        text: 'public.profiles.public_profile (exposed as publicProfile) is a boolean on your account. Default is off. Private means the row exists, the handle is claimed, but GET of the public profile returns a private error. Visitors see “This profile is private.” They do not see your photo, links, or name. You still see Edit profile when you open your own URL while signed in.',
      },
      {
        type: 'p',
        text: 'Turning the switch to Public writes immediately from the modal and from Dashboard → Settings. Keep it private until you are ready. Usage, tokens, and model stats are only meant for a page you chose to publish.',
      },
      {
        type: 'callout',
        text: 'A reserved or taken handle is never yours. A claimed handle that is still private is yours, but the world gets a locked page, not a 404. A handle that was never claimed shows “No one here.”',
      },
      {
        id: 'photo',
        title: 'Profile image',
        type: 'p',
        text: 'Upload PNG, JPEG, or WebP under 2 MB from Dashboard → Settings → Profile image. The file goes to Bunny (soumtok-files) via PUT /api/me/photo/avatar. After a good upload, Settings shows the new picture at once, and the sidebar account card updates in the same moment — not on the next refresh. Public visitors load /api/u/{username}/photo only when the profile is public and hasAvatar is true. If there is no photo, the public page falls back to the Soumtok mark.',
      },
      {
        id: 'links',
        title: 'Links',
        type: 'p',
        text: 'You can store up to eight links. The claim modal starts with two empty fields (x.com/username, github.com/username). Settings has the same list plus Add link. Empty rows are dropped on save. If a link has no http, the public page prefixes https:// so x.com/you still opens. Links are the only extra content on the public page today besides name, handle, and photo.',
      },
      {
        id: 'page',
        title: 'What people see',
        type: 'p',
        text: 'The public page is a quiet dark screen: the Soumtok lockup in the header, Sign in, then a centered column. Ready state: circular photo, display name (first + last, or @handle), @username, then the link list. Private state: a short lock message. Missing state: “No one here.” Owners get Edit profile, which returns to /dashboard/settings.',
      },
      {
        type: 'image',
        src: '/images/soumtok-lockup.png',
        alt: 'Soumtok lockup — the same mark that sits in the public profile header',
      },
      {
        id: 'settings',
        title: 'Settings vs the modal',
        type: 'p',
        text: 'Create Profile is the guided claim. Settings is the always-on editor: first name, last name, handle, links, public toggle, appearance, sessions, security. Changing the handle in Settings re-runs the same availability check. If you change it, the old URL stops resolving as yours and the new one takes the page. Do that only when you mean to move the address.',
      },
      {
        id: 'next',
        title: 'Next steps',
        type: 'steps',
        items: [
          'Claim a handle that is Available',
          'Upload a profile image so the sidebar and the public page match',
          'Add the links you want people to open',
          'Leave the page Private until you are ready',
          'Turn Public on, then View Profile or Share',
        ],
      },
    ],
  },
  {
    id: 'studio',
    title: 'Studio chat',
    crumb: 'Studio',
    toc: [
      { id: 'why', title: 'Why Studio exists' },
      { id: 'open', title: 'Open the desk' },
      { id: 'shell', title: 'The Studio shell' },
      { id: 'composer', title: 'The prompt box' },
      { id: 'send', title: 'Sending a turn' },
      { id: 'model', title: 'Model picker' },
      { id: 'add', title: 'Add menu' },
      { id: 'skills', title: 'Skills' },
      { id: 'mcp', title: 'MCP servers' },
      { id: 'search', title: 'Search' },
      { id: 'agents', title: 'Agents list' },
      { id: 'image', title: 'Images' },
      { id: 'spend', title: 'What a turn costs' },
      { id: 'not', title: 'What Studio is not' },
      { id: 'next', title: 'Next steps' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Studio is the reason Soumtok exists. Dashboard is where you set keys, pay, and grant repos. Studio is where the work happens: a full-screen chat that can read your GitHub project, pick a frontier model, run a skill, and hand you a plan you can argue with before a single file moves.',
      },
      {
        type: 'p',
        text: 'You do not juggle five provider consoles. You do not paste a repo into a generic chatbot. You open one desk, attach the repo GitHub already owns, and ask in the language you already use: build this, fix that, explain this file, write the tests.',
      },
      {
        type: 'callout',
        text: 'Studio lives at /dashboard/studio. Nested routes like /dashboard/studio/automations and /dashboard/studio/codebase still count as Studio — the first path segment stays studio so the shell does not flicker back to Overview.',
      },
      {
        id: 'why',
        title: 'Why Studio exists',
        type: 'p',
        text: 'Most coding agents sell a feeling. Soumtok sells a loop you can finish on a Kenyan afternoon: sign in, attach a repo, pick DeepSeek or Claude or Grok, send the prompt, review the plan, keep going. The prompt box is the whole product. Everything else — models, plugins, MCP, billing — exists to make that box smarter without leaving the page.',
      },
      {
        type: 'p',
        text: 'If you are coming from a tab-complete editor, Studio will feel slower on purpose. It is not trying to finish your current line. It is trying to take a messy request (“make checkout take M-Pesa”) and turn it into files, questions, and a thread you can follow up on. That is the product. The empty-state line is honest: Ask Soumtok to build, fix bugs, explore.',
      },
      {
        id: 'open',
        title: 'Open the desk',
        type: 'steps',
        items: [
          'Finish onboarding (handle, country, email code, phone code). File and repo APIs stay locked until both codes land.',
          'From the dashboard sidebar, click Studio. Overview, Models, Spending, and Billing leave the screen.',
          'You land on New Chat with the prompt box in the middle. The Soumtok lockup is top-left. Your account menu is at the bottom of the sidebar.',
          'Optional: open Codebase first, grant a GitHub repo, click the row. Studio opens with that project already attached.',
        ],
      },
      {
        type: 'p',
        text: 'On a phone, the sidebar collapses behind a menu. Collapse is the same control on desktop if you want the chat wide. Search stays in the rail so you can jump without hunting.',
      },
      {
        id: 'shell',
        title: 'The Studio shell',
        type: 'p',
        text: 'Studio is a different chrome from the dashboard. That is the point. Billing and usage are one click away — Dashboard in the rail — but they are not in your face while you are trying to ship.',
      },
      {
        type: 'ul',
        items: [
          'New Chat starts a fresh thread and a clean prompt box. Follow-ups live on the same thread until you click New Chat again.',
          'Automations is the scheduled and webhook desk. Same models, same GitHub attach, a job you do not want to retype every Monday.',
          'Codebase is where you connect GitHub, grant repos, and click a project into the next chat. GitHub stays the source of truth.',
          'Dashboard returns you to Overview, Models, Keys, Spending, Billing — the workspace around Studio, not a second product.',
          'The agents list under the rail stays empty until a cloud run exists. New Chat is the interactive agent. Do not wait on that list to start working.',
          'The search icon opens Search agents… — a command palette for this shell, not the docs ⌘K search.',
        ],
      },
      {
        id: 'composer',
        title: 'The prompt box',
        type: 'p',
        text: 'The prompt box is the wide field in the middle of an empty chat, and the compact follow-up bar once a thread exists. Placeholder: Ask Soumtok to build, fix bugs, explore. On a follow-up it becomes Add a follow up. Enter sends. Shift+Enter makes a new line. That is the whole keyboard contract.',
      },
      {
        type: 'p',
        text: 'Under an empty prompt box you get two invitations: Create an Automation (opens the Automations editor) and Try Commands (slash skills). Start from scratch opens the GitHub source picker — the same attach path as Codebase and + → Files. Use it when the chat should know which repo you mean before the first token.',
      },
      {
        type: 'ul',
        items: [
          '+ and the model name sit on one row. Height is tight on purpose so the prompt stays the hero.',
          'When the box is empty, the right control is a microphone. It uses the browser speech API. After you have text, it becomes send.',
          'Enter inside the model search field only filters the list. It never sends the chat. That is easy to miss and worth repeating.',
          'Attached repo and Multitask show as chips next to the model. × clears them without wiping the prompt.',
        ],
      },
      {
        id: 'send',
        title: 'Sending a turn',
        type: 'p',
        text: 'A turn is one user message plus whatever Studio streams back: thoughts, file reads, edits, questions, a workbench of files. You stay on the page. If Trial is exhausted you get a 402: your free trial ended — upgrade to Pro. Paid cycles count usage from the moment you paid, not leftover trial tokens.',
      },
      {
        type: 'p',
        text: 'Good first prompts name the outcome and the constraint. “Add M-Pesa STK to checkout, keep PayPal, do not invent a CLI.” Weak prompts dump a vibe. Studio will still try. It will also ask clarifying questions when the task is wide — same energy as a sharp engineer in Slack, not a slot machine.',
      },
      {
        id: 'model',
        title: 'Model picker',
        type: 'p',
        text: 'Click the current model name. The menu opens under that name with a thin dark scrollbar. Search by name. Filter High / Fast / Medium. Turn on Use Multiple Models when you want more than one brain on the same ask. The current model is pinned with a check. Ready means Soumtok has a platform key or you saved a BYOK key for that provider.',
      },
      {
        type: 'p',
        text: 'Hover a model for about two seconds and a card opens: name, what it is strong at, context window. That is not decoration. Opus is for the hard bug. DeepSeek V4 Flash is the cheap daily driver and the Studio default. Grok is the long-context / repo pass. Gemini flash is the middle. Switch before you send if the last turn was the wrong tool.',
      },
      {
        type: 'p',
        text: 'The catalog is DeepSeek, Gemini, Gemma, Claude, Grok, and GPT. There is no second branded pool. Details, keys, and the New tag live on the Models page. If a row is visible but not ready, the call fails until a key exists — the picker does not hide the future, it just will not fake a completion.',
      },
      {
        id: 'add',
        title: 'Add menu',
        type: 'p',
        text: 'The + button is how you give Studio extra hands without leaving the prompt box. It is a small menu. It is also most of the product surface people miss.',
      },
      {
        type: 'ul',
        items: [
          'Multitask — tell the model to split the work into parallel sub-tasks instead of one long serial pass.',
          'Files — attach a granted GitHub repo. Same attach as Codebase and Start from scratch. Name, language, and description go into the system prompt. The git history stays on GitHub.',
          'Skills — open the skills panel (search, last used, plugin skills). Picking one inserts a ready prompt into the box.',
          'MCP Servers — hover or click to open the side flyout. Search installed servers, or + Add MCP to browse the catalog and custom URLs.',
        ],
      },
      {
        id: 'skills',
        title: 'Skills',
        type: 'p',
        text: 'A skill is a named prompt with a job: review this diff, write tests, apply a Notion styleguide, open a page. Built-in skills sit next to anything you installed from Plugins (Notion, Figma, Slack, Linear, and the rest of the catalog). Titles are human — Create Page, not create-page.',
      },
      {
        type: 'ul',
        items: [
          'The list scrolls. Last used sits at the top, stored in this browser as soumtok-recent-skills.',
          'Search filters by title. No match shows an empty state, not a fake row.',
          'Choosing a skill inserts text into the prompt box. You still hit send. You can edit the insert before you send.',
          'Plugins that ship skills install those skills when you Add the plugin. You do not paste a second secret for the skill itself.',
        ],
      },
      {
        id: 'mcp',
        title: 'MCP servers',
        type: 'p',
        text: 'MCP is how Studio talks to tools outside the chat: Notion, Figma, GitHub-shaped APIs, a custom URL you already run. Hover MCP Servers in the + menu and a flyout opens. If nothing is connected you see No MCP servers available. + Add MCP opens Browse MCPs: search, Custom MCP, and catalog cards. Adding uses the same install path as Dashboard → Plugins / Connectors.',
      },
      {
        type: 'p',
        text: 'Do not hunt for an MCP URL when the catalog already bundled it. Notion, Figma, and friends ship the address with the plugin. Sign in at the provider when Soumtok opens that window. Until the window exists, the plugin and skills are still saved for Studio.',
      },
      {
        id: 'search',
        title: 'Search',
        type: 'p',
        text: 'The sidebar search icon opens a palette titled Search agents… Actions first, New Chat highlighted. Type to filter, arrow keys, Enter to run, Escape to close. This palette is only for Studio. Docs search is ⌘K on /docs. Mixing them up is how people think search is broken.',
      },
      {
        id: 'agents',
        title: 'Agents list',
        type: 'p',
        text: 'The list in the rail says No Agents Yet until a cloud run has actually happened. That is correct, not a bug. Interactive work is New Chat. Unattended work — a written task, a granted repo, a branch, a pull request while you are away — is Cloud agents. Do not sit on the empty list. Open the prompt box.',
      },
      {
        id: 'image',
        title: 'Images',
        type: 'p',
        text: 'Studio can ask for a still image through Flux 2 Max when the server has REPLICATE_API_TOKEN. Stills only. The API rejects ids that look like video, veo, sora, lyria, music, audio, or TTS. The Models catalog does not count an image model and does not advertise one there. If you need a screenshot in the prompt, attach it. If you need a generated still, ask in chat. If you need a film, this is the wrong product.',
      },
      {
        id: 'spend',
        title: 'What a turn costs',
        type: 'p',
        text: 'Trial is DeepSeek V4 Flash and Gemma 4 on a small monthly pool. When that pool is gone, Studio stops until you upgrade — the spending card says Free trial ended. Pro and above count included tokens from plan start to plan renew, not from the first of the calendar month. Usage past the include burns Other models (your keys) then on-demand. Spending and Billing are the live meters. Studio itself just sends the turn.',
      },
      {
        id: 'not',
        title: 'What Studio is not',
        type: 'ul',
        items: [
          'Not a local Windows IDE yet. The landing waitlist is the desktop app. Studio in the browser is the product today.',
          'Not a second git host. Attach points at GitHub. Merge happens on GitHub.',
          'Not Slack, not a CLI you curl into Jenkins, not a fleet of rented VMs on the marketing site.',
          'Not a music, video, or voice studio. Stills through Flux, then back to code.',
        ],
      },
      {
        id: 'next',
        title: 'Next steps',
        type: 'steps',
        items: [
          'Send a first prompt on New Chat, even without a repo — “explain how Soumtok checkout should take M-Pesa”.',
          'Open Codebase, grant one repo, click it, ask for a small, reviewable change.',
          'Hover two models for two seconds each and pick on purpose, not by habit.',
          'Install one plugin you already pay for (Notion or GitHub) and run a skill from +.',
          'Read Models for keys, Automations for the jobs you repeat, Billing when the trial bar fills.',
        ],
      },
    ],
  },
  {
    id: 'models',
    title: 'Models',
    crumb: 'Studio',
    toc: [
      { id: 'why', title: 'Why the catalog exists' },
      { id: 'pick', title: 'How to pick' },
      { id: 'ready', title: 'What is ready' },
      { id: 'picker', title: 'Studio picker' },
      { id: 'catalog', title: 'Dashboard catalog' },
      { id: 'keys', title: 'Keys and routing' },
      { id: 'trial', title: 'Trial vs paid' },
      { id: 'new', title: 'New tag' },
      { id: 'blocked', title: 'Blocked aliases' },
      { id: 'not', title: 'What is not a model' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Soumtok talks to the models your keys can reach. One picker, one catalog, one story: DeepSeek, Gemini, Gemma, Claude, Grok, and GPT. You are not buying a private branded pool. You are buying a desk that routes to the labs you already know, with Soumtok keys or your own.',
      },
      {
        type: 'p',
        text: 'The Models page does not print a vanity count. It does not list the still-image path (Flux 2 Max lives in Studio chat when REPLICATE_API_TOKEN is set). Ready is a flag, not a promise that every id on earth is live. If a row is visible but not ready, the call fails until a platform key or a BYOK key exists.',
      },
      {
        id: 'why',
        title: 'Why the catalog exists',
        type: 'p',
        text: 'A coding agent is only as good as the brain you put on the turn. Cheap flash models finish the small edit before the tea cools. Opus and GPT-6 Astra are for the bug that has already eaten an afternoon. Grok is the long-context pass over a fat repo. DeepSeek V4 Flash is the Studio default because most turns should be fast and cheap. The catalog exists so you can switch on purpose instead of hoping one model is good at everything.',
      },
      {
        id: 'pick',
        title: 'How to pick',
        type: 'ul',
        items: [
          'Daily drive — DeepSeek V4 Flash or a Gemini flash. Fast, cheap, enough for most Studio turns',
          'Screenshot or UI in the prompt — DeepSeek V4 Flash Vision or GPT-4o',
          'Hard bug, architecture, a scary refactor — Claude Opus, GPT-6 Astra, o1 / o3, Grok reasoning',
          'Long repo pass — Grok 4.20 and Grok 4.6',
          'Open / free feel — Gemma 4 on Trial, then upgrade when the bar fills',
          'Many files, agent-style coding — Codex (gpt-5.3-codex)',
        ],
      },
      {
        id: 'ready',
        title: 'What is ready',
        type: 'ul',
        items: [
          'DeepSeek — V4 Flash (Studio default), V4 Pro, V4 Flash Vision',
          'Google — Gemini 3.1–3.8 flash and lite, Gemini 3 Pro preview, Gemma 4 31B and 26B',
          'Claude — Haiku 4.5, Sonnet 4.5–5, Opus 4.5–5, Fable 5 / 5.1',
          'Grok — Build 0.1, 4.20 Fast / Reasoning / Multi-agent, 4.3–4.6',
          'GPT — 4.1 family through GPT-6 Astra, Codex, o1 / o3 / o4',
        ],
      },
      {
        id: 'picker',
        title: 'Studio picker',
        type: 'p',
        text: 'Click the model name beside +. The menu opens under that name with a thin dark scrollbar. Search by name. Turn on Use Multiple Models when you want more than one brain on the same ask. Filter High / Fast / Medium. The current model is pinned with a check. Enter in the search field only filters the list — it never sends the chat. Hover a row for about two seconds to read the guide card: strength, context, why you would pick it.',
      },
      {
        id: 'catalog',
        title: 'Dashboard catalog',
        type: 'p',
        text: 'Dashboard → Models groups by provider. Search matches name, id, and the word New. Click a model for context window, max output, and what it is good at. Ready means a platform key, OpenRouter, or your BYOK key can call that provider. This page is the catalog. Studio is where you actually send the turn.',
      },
      {
        id: 'keys',
        title: 'Keys and routing',
        type: 'p',
        text: 'Platform env: OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY, DEEPSEEK_API_KEY, XAI_API_KEY. You can also save BYOK keys in Dashboard → Keys. Some OpenAI models use the Responses API (gpt-6, ids that include codex, ids that end in pro, o1 / o3 / o4, gpt-5 mini/nano). xAI multi-agent uses Responses too. See API keys.',
      },
      {
        id: 'trial',
        title: 'Trial vs paid',
        type: 'p',
        text: 'Trial only runs DeepSeek V4 Flash and Gemma 4 on a small included pool. When that pool is gone, Studio returns 402 until you upgrade — the spending card says Free trial ended. Pro and above unlock the rest of the ready catalog, count usage from plan start to plan renew, and can still use your own keys under Other models. Picking Opus on Trial does not secretly work. Upgrade first.',
      },
      {
        id: 'new',
        title: 'New tag',
        type: 'p',
        text: 'The catalog tags recent drops as New: DeepSeek V4 family, Gemini 3.6 / 3.7 / 3.8, Gemma 4, Claude Sonnet 5 / Opus 5 / Fable 5 / 5.1, Grok 4.6 / 4.20 multi-agent, Codex, GPT-5.5, GPT-5.6 Luna / Sol / Terra, GPT-6 Astra. The tag is a label, not a second product and not a second price.',
      },
      {
        id: 'blocked',
        title: 'Blocked aliases',
        type: 'p',
        text: 'Gemini 2.5 is blocked for new keys. Old aliases redirect to the 3.x line (gemini-2.5-flash → 3.1 flash lite, and so on). If a model is not ready, the picker still shows it but Studio will fail the call until a key exists. That is honest empty, not a hidden second catalog.',
      },
      {
        id: 'not',
        title: 'What is not a model',
        type: 'ul',
        items: [
          'Flux 2 Max stills — a Studio image path, not a row on Models',
          'Video, music, audio, TTS — rejected by the API',
          'A count of “how many models we have” — we do not print one',
        ],
      },
    ],
  },
  {
    id: 'codebase',
    title: 'Codebase',
    crumb: 'Studio',
    toc: [
      { id: 'what', title: 'What Codebase is' },
      { id: 'who', title: 'Who can access' },
      { id: 'privacy', title: 'Privacy and git' },
      { id: 'enable', title: 'Enable Codebase' },
      { id: 'landing', title: 'The landing card' },
      { id: 'repos', title: 'Repo list' },
      { id: 'attach', title: 'What attach does' },
      { id: 'prs', title: 'Pull requests' },
      { id: 'limits', title: 'Limits and beta' },
      { id: 'next', title: 'Next steps' },
    ],
    blocks: [
      {
        type: 'callout',
        text: 'Codebase is in early beta. It is Soumtok’s Origin-style repo layer: GitHub stays the source of truth, Studio attaches the repo, and agents open branches and pull requests. Send product feedback to info@soumtok.com.',
      },
      {
        id: 'what',
        title: 'What Codebase is',
        type: 'p',
        text: 'Codebase is the Studio page where you grant and browse the GitHub repositories an agent is allowed to touch. It is not a second git host. Soumtok does not store your full history as the canonical copy. You clone, branch, and merge on GitHub. Soumtok lists the repos you granted, attaches one to a chat, and later lets cloud agents open a branch and a pull request on that same GitHub repo.',
      },
      {
        type: 'p',
        text: 'Open it from Studio → Codebase. You first see the landing card (a sample Open pull request, Get Started, Learn More). Learn More is this page. Under the card, granted repos appear as a list: full name, public or private, language. Click a row to start Studio with that project attached.',
      },
      {
        id: 'who',
        title: 'Who can access',
        type: 'p',
        text: 'Anyone with a finished Soumtok account can open the page. Connecting GitHub is optional until you want a repo in chat. Grant only the repositories Soumtok should see — do not grant the whole org if you do not need to. The GitHub App install URL is https://github.com/apps/soumtok/installations/new. OAuth scopes for sign-in are read:user, user:email, and repo. A future app manifest uses contents: read and pull_requests: write.',
      },
      {
        id: 'privacy',
        title: 'Privacy and git',
        type: 'ul',
        items: [
          'GitHub remains the source of truth for commits, branches, and pull requests',
          'Soumtok stores the GitHub access token on public.account for provider github',
          'GET /api/github/repos lists user repos, then installation repos, and syncs github_login',
          'Studio attach sends repo name, language, and description into the system prompt — not your full tree unless an agent clones it',
          'Private repos stay private on GitHub. Soumtok only sees what the token and the app grant allow',
          'File uploads for avatars and logos go to Bunny. Do not turn on extra Bunny geo-replicas',
        ],
      },
      {
        id: 'enable',
        title: 'Enable Codebase',
        type: 'steps',
        items: [
          'Open Studio → Codebase',
          'Click Get Started',
          'If GitHub is not connected, you are sent through GitHub OAuth and return to /dashboard/studio/codebase',
          'If you are connected but have zero granted repos, Get Started opens the Soumtok GitHub App install page so you can grant repos',
          'If you already have repos, Get Started scrolls to Your repositories',
          'Click a repository — it attaches to a new Studio chat',
        ],
      },
      {
        id: 'landing',
        title: 'The landing card',
        type: 'p',
        text: 'The left side is a product mock of a GitHub-style pull request: status Open, a title like feat(soumtok): faster clones…, branch pair main ← origin/get-started, Approve and Merge, then comment / check / review counts. That card is the promise, not a live PR until an agent opens one. The right side explains that GitHub stays the source of truth, clones and agents get faster, and you can browse repos and review PRs in Studio. Get Started runs the connect / grant / scroll flow above. Learn More opens this guide.',
      },
      {
        id: 'repos',
        title: 'Repo list',
        type: 'p',
        text: 'Granted repos appear under Your repositories. Each row shows fullName, Public or Private, and language when GitHub sent one. Clicking a row writes sessionStorage.soumtok-project as JSON and navigates to /dashboard/studio. You can also attach from Start from scratch on an empty chat or from + → Files. Integrations on the dashboard uses the same /api/github/repos list.',
      },
      {
        id: 'attach',
        title: 'What attach does',
        type: 'p',
        text: 'Attach does not upload the repo to Soumtok object storage. It tells the next Studio completion which project you are talking about so the model can name files and suggest branches correctly. Cloud agents that clone use the GitHub token. If the list is empty after OAuth, you still need the GitHub App grant. If OAuth is missing on the server, /api/setup/github/start walks setup.',
      },
      {
        id: 'prs',
        title: 'Pull requests',
        type: 'p',
        text: 'The intended loop: you attach a repo, you ask for a change, an agent clones, branches from main (the sample card shows main ← origin/get-started), and opens a PR you Approve or Merge on GitHub. Cloud Agents on Dashboard are the longer-running, unattended version of the same idea. Codebase itself does not merge for you — Merge on the landing card is illustration.',
      },
      {
        id: 'limits',
        title: 'Limits and beta',
        type: 'ul',
        items: [
          'Early beta — expect the list and attach path to grow before merge-from-Studio is real',
          'Trial accounts can connect GitHub; included Studio tokens are still the Trial credit (see Billing)',
          'GitHub remains the source of truth. Soumtok does not host origin remotes. Clone, branch, and merge stay on GitHub',
          'Feedback: info@soumtok.com',
        ],
      },
      {
        id: 'next',
        title: 'Next steps',
        type: 'ul',
        items: [
          'Finish onboarding so file and repo APIs are allowed',
          'Connect GitHub from Codebase → Get Started',
          'Grant at least one repo to the Soumtok GitHub App',
          'Open that repo in Studio and ask for a branch and a pull request',
          'Read GitHub for scopes, and Cloud agents for unattended runs',
        ],
      },
    ],
  },
  {
    id: 'automations',
    title: 'Automations',
    crumb: 'Studio',
    toc: [
      { id: 'why', title: 'Why they exist' },
      { id: 'what', title: 'What they are' },
      { id: 'create', title: 'Create one' },
      { id: 'trigger', title: 'Triggers' },
      { id: 'repo', title: 'With a repo' },
      { id: 'tools', title: 'Tools and history' },
      { id: 'vs', title: 'Versus chat and cloud agents' },
      { id: 'spend', title: 'What a run costs' },
      { id: 'next', title: 'Next steps' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Automations are the jobs you already do every week and should not retype into a fresh chat: run the tests, draft the changelog, review the open PRs, nag the stale branch. You write the task once. Soumtok runs it on a clock or when a webhook fires. Same models as Studio. Same GitHub attach. No second product to learn.',
      },
      {
        id: 'why',
        title: 'Why they exist',
        type: 'p',
        text: 'New Chat is for the messy ask you have never asked before. Automations are for the ask you will have again on Monday. If you are copy-pasting the same prompt every Friday, that prompt wants to be an automation. The empty chat even invites it: Create an Automation sits under the prompt box, next to Try Commands.',
      },
      {
        id: 'what',
        title: 'What they are',
        type: 'p',
        text: 'In Studio, Automations is its own rail item. The editor has a title (Untitled until you name it), an active switch, instructions, a model, optional GitHub project, triggers, and tools. Memories is on by default. You can add MCP tools from plugins you already installed. An automation is not a second model catalog and not a Slack bot we pretend to ship.',
      },
      {
        id: 'create',
        title: 'Create one',
        type: 'steps',
        items: [
          'Open Studio → Automations, or press Create an Automation on an empty chat',
          'Name the job in plain language — what should happen, on which repo if any',
          'Write instructions the way you would prompt Studio. Be specific. “Review open PRs and comment on missing tests” beats “do the usual”.',
          'Pick a ready model the same way you would in chat. Hover for the guide card if you are unsure.',
          'Add a trigger: Scheduled or Webhook Triggered',
          'Flip Active when you want it live. Save. Test from the editor before you trust the clock.',
        ],
      },
      {
        id: 'trigger',
        title: 'Triggers',
        type: 'ul',
        items: [
          'Scheduled — Every hour, Every day at 09:00, or Every Monday. Use this for chores that already live on a calendar',
          'Webhook Triggered — Soumtok mints a token. Hit that URL when another system should start the job (a deploy hook, a form, a CI step)',
          'You can stack triggers. A job can be both on a clock and callable',
        ],
      },
      {
        id: 'repo',
        title: 'With a repo',
        type: 'p',
        text: 'If the automation should touch code, connect GitHub first (Codebase or Start from scratch). Automations that need a clone use the same token and grant as Codebase. Without a repo, the job can still draft text, but it cannot open a real branch. Grant only the repos the job should see.',
      },
      {
        id: 'tools',
        title: 'Tools and history',
        type: 'p',
        text: 'The Settings tab is the job itself. History lists runs — when it fired, whether it finished, what came back. Test runs a turn now so you can see the prompt is not nonsense before Monday 09:00. Tools start with Memories. Add MCP servers you already connected if the job should talk to Notion, Linear, or a custom URL.',
      },
      {
        id: 'vs',
        title: 'Versus chat and cloud agents',
        type: 'ul',
        items: [
          'New Chat — you are in the loop, message by message. Best for a new, messy ask',
          'Automations — you define the job once and run it again, on a schedule, or from a webhook',
          'Cloud agents — unattended run that is supposed to come back with a pull request. The Studio agents list stays empty until one of those runs exists',
        ],
      },
      {
        id: 'spend',
        title: 'What a run costs',
        type: 'p',
        text: 'A run burns the same included usage as a Studio turn: Trial pool first, then paid credits from plan start, then Other models (your keys), then on-demand. A noisy hourly job will fill the bar. Watch Spending. Turn Active off if you are done with the clock.',
      },
      {
        id: 'next',
        title: 'Next steps',
        type: 'steps',
        items: [
          'Create one automation for a chore you already do weekly',
          'Attach the GitHub repo it should touch',
          'Test once, then turn Active on',
          'Read Studio chat if you still want to stay in the loop, and Cloud agents for unattended PRs',
        ],
      },
    ],
  },
  {
    id: 'agents',
    title: 'Cloud agents',
    crumb: 'Studio',
    toc: [
      { id: 'why', title: 'Why they exist' },
      { id: 'what', title: 'What they do' },
      { id: 'studio', title: 'In Studio' },
      { id: 'need', title: 'What you need' },
      { id: 'result', title: 'What you get back' },
      { id: 'not', title: 'What they are not' },
      { id: 'next', title: 'Next steps' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Cloud agents are Studio without you in the chair. You write the task, grant the repo, walk away. The agent clones on GitHub, opens a branch, and comes back with a pull request. That is Dashboard → Cloud Agents and, later, the Agents list in the Studio rail. Until a run has actually happened, both surfaces say empty on purpose.',
      },
      {
        id: 'why',
        title: 'Why they exist',
        type: 'p',
        text: 'Not every job wants a conversation. Some jobs want a PR waiting when you get back from lunch. Cloud agents are that loop. They are not a rented VM farm on the marketing site. They are not a second model catalog. They use the same ready models, the same GitHub token, and the same included usage as a long Studio turn.',
      },
      {
        id: 'what',
        title: 'What they do',
        type: 'ul',
        items: [
          'Take a written task — the same kind of prompt you would type in Studio',
          'Work against a granted GitHub repo. No grant, no clone',
          'Open a branch and a pull request on GitHub',
          'Show up later in the Studio Agents list so you can open that PR',
        ],
      },
      {
        id: 'studio',
        title: 'In Studio',
        type: 'p',
        text: 'The rail says No Agents Yet. That is correct. New Chat is the interactive agent. Automations is the repeating job. Cloud agents are the unattended PR. Do not sit on the empty list. Open the prompt box. Do not expect the Codebase landing-card Merge button to merge a cloud-agent PR — merge on GitHub.',
      },
      {
        id: 'need',
        title: 'What you need',
        type: 'ul',
        items: [
          'Onboarding complete (email and phone codes)',
          'GitHub connected and at least one repo granted to the Soumtok GitHub App',
          'A ready model (platform key or BYOK)',
          'Included usage or on-demand headroom on Spending',
          'A task specific enough that a stranger could open a PR from it',
        ],
      },
      {
        id: 'result',
        title: 'What you get back',
        type: 'p',
        text: 'The contract is a pull request, not a zip of files. GitHub stays canonical. If the agent cannot push, check the GitHub App grant and the repo scope. Failed or empty runs belong in a mail to info@soumtok.com with the repo name and the task you sent.',
      },
      {
        id: 'not',
        title: 'What they are not',
        type: 'ul',
        items: [
          'Not a fleet of always-on machines you SSH into',
          'Not a replacement for New Chat when you still want to argue with the plan',
          'Not a merge button inside Soumtok. Approve and merge on GitHub',
        ],
      },
      {
        id: 'next',
        title: 'Next steps',
        type: 'steps',
        items: [
          'Ship a small change with New Chat first so attach and keys are known-good',
          'Grant the repo on Codebase',
          'Start a cloud run with a tight task',
          'Open the PR on GitHub when the Agents list lights up',
        ],
      },
    ],
  },
  {
    id: 'dashboard',
    title: 'Dashboard',
    crumb: 'Workspace',
    toc: [
      { id: 'why', title: 'Why two shells' },
      { id: 'nav', title: 'Navigation' },
      { id: 'overview', title: 'Overview' },
      { id: 'spend', title: 'Spending' },
      { id: 'other', title: 'Other pages' },
      { id: 'next', title: 'Next steps' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'The dashboard is everything around Studio: keys, models, money, plugins, the GitHub grant, the heatmap of what you actually used. It is the workspace. Studio is the desk. You need both. You should not live in Billing while you are trying to ship, which is why Studio replaces this chrome.',
      },
      {
        id: 'why',
        title: 'Why two shells',
        type: 'p',
        text: 'A coding agent that shares a sidebar with invoices will always lose the invoice. Studio is full screen on purpose. Dashboard in the Studio rail is the door back. Nested /dashboard/studio/codebase still counts as Studio so the shell does not flicker to Overview.',
      },
      {
        type: 'p',
        text: 'The classic dashboard sidebar is Overview, Models, Studio, Settings, Cloud Agents, Plugins, Connectors, Integrations, Keys, Members, Usage, Spending, and Billing.',
      },
      {
        id: 'nav',
        title: 'Navigation',
        type: 'p',
        text: 'The first path segment after /dashboard picks the section. /dashboard/studio and /dashboard/studio/codebase both stay on Studio. The desktop header repeats the current section title. Mobile uses a Menu control and the same list.',
      },
      {
        id: 'overview',
        title: 'Overview',
        type: 'ul',
        items: [
          'Getting started checklist and GitHub projects',
          'Usage stats (requests, tokens, models used, product events) and a year heatmap',
          'Usage by model — not a second catalog. Open usage goes to Dashboard → Usage',
          'No models list and no pricing cards on Overview — those live on Models and Billing',
        ],
      },
      {
        id: 'spend',
        title: 'Spending',
        type: 'p',
        text: 'Trial shows two outlined square cards: Your included usage (percent used) and Pro $13.99/mo with Upgrade to Pro. When the trial pool is gone, the usage card says Free trial ended — upgrade to keep coding. Paid plans show Current plan (started datetime and expires), Upgrade available, square usage bars for Soumtok models and Other models (your keys), on-demand, and a monthly limit. There is no third branded quota row. Full rules live on Billing.',
      },
      {
        id: 'other',
        title: 'Other pages',
        type: 'ul',
        items: [
          'Models — provider catalog and ready flags',
          'Settings — profile, handle, appearance, sessions, security',
          'Keys — User API Keys, Codebase SSH keys, and optional BYOK provider keys',
          'Integrations — GitHub connect, same repo list as Codebase',
          'Usage — date range, token cards, chart by model, and a request table',
          'Billing — PayPal or M-Pesa checkout, monthly/annual, orders, PDF receipts',
          'Plugins — marketplace Add installs the bundle (no MCP hunt); Trial gets 1, then Pro',
          'Connectors — Pro-only MCP links; custom URLs are checked live, then saved',
          'Skills — files you upload for Studio to attach',
        ],
      },
      {
        id: 'next',
        title: 'Next steps',
        type: 'steps',
        items: [
          'Finish the Overview checklist',
          'Open Studio for the first chat',
          'Connect GitHub from Integrations or Codebase',
          'Watch Spending after a few turns so the bar is not a surprise',
        ],
      },
    ],
  },
  {
    id: 'plugins',
    title: 'Plugins',
    crumb: 'Workspace',
    toc: [
      { id: 'why', title: 'Why plugins' },
      { id: 'how', title: 'How Add works' },
      { id: 'inside', title: 'What is inside a plugin' },
      { id: 'add', title: 'Click Add — you do not fetch MCP' },
      { id: 'signin', title: 'Then sign in at the vendor' },
      { id: 'custom', title: 'When you do paste an MCP URL' },
      { id: 'studio', title: 'In Studio' },
      { id: 'soumtok', title: 'What Soumtok does today' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Dashboard → Plugins is Soumtok’s marketplace. Click a plugin to open its page (/dashboard/plugins/notion). That page shows the official logo, publisher, Add or Uninstall, every skill, and an MCPs section when the vendor ships one. The arrow on a skill opens that SKILL.md on GitHub. The arrow on an MCP opens that plugin’s mcp.json on GitHub. A plugin is a reviewed bundle: skills, rules, agents, commands, MCP, hooks.',
      },
      {
        id: 'why',
        title: 'Why plugins',
        type: 'p',
        text: 'Studio is smarter when it can open a Notion page, read a Figma file, or follow a Linear issue without you pasting dumps into the prompt. Plugins are how those tools arrive as named skills in the + menu. You install once. You pick the skill when the chat needs it. You do not hunt vendor docs for an MCP URL unless the server is yours.',
      },
      {
        id: 'how',
        title: 'How Add works',
        type: 'ul',
        items: [
          'Click a plugin, then Add. Soumtok installs the bundle — every skill on that page plus the official MCP address. You do not go find an MCP URL for catalog plugins.',
          'If that product needs permission, you sign in there. One click to install, then one vendor login. It is not silent.',
          'Add next to search is only for your own MCP URL — a server you host, or one that is not in this catalog.',
          'Soumtok does not yet open the vendor login window after Add. Today Add saves the plugin and lists every skill in Studio → +. Live vendor calls start when that OAuth step ships.',
        ],
      },
      {
        id: 'inside',
        title: 'What is inside a plugin',
        type: 'ul',
        items: [
          'Skills — the real SKILL.md files from the vendor plugin repo (Notion has 14, Figma 14, Slack 7, Granola 11, Datadog 3). Click the arrow to open that file on GitHub',
          'MCPs — listed under the skills. Notion shows “notion”, Figma “figma”, Linear “linear”. The arrow opens the official mcp.json (or .mcp.json) on GitHub',
          'Rules, agents, commands, hooks — the full plugin format. Soumtok lists the same idea; the live pieces today are skills + saved MCP',
        ],
      },
      {
        id: 'add',
        title: 'Click Add — you do not fetch MCP',
        type: 'p',
        text: 'Official catalog plugins already contain the MCP URL. You do not open vendor docs to copy https://mcp.notion.com/mcp unless you are adding a custom or community server. One click saves Notion, Figma, Datadog, Drive, and the rest, including their official MCP address.',
      },
      {
        id: 'signin',
        title: 'Then sign in at the vendor',
        type: 'p',
        text: 'Install is not the same as permission. If Notion, Figma, Google, Slack, or Linear needs access, you sign in at that product (OAuth). That step is required. It is not silent and not fully automatic. Teammates on a Required plugin still each authenticate. Datadog also asks for API keys. GitHub on Soumtok uses Dashboard → Integrations, not an MCP URL.',
      },
      {
        id: 'custom',
        title: 'When you do paste an MCP URL',
        type: 'p',
        text: 'The Add button next to Search is only for a server you host, or a community MCP that is not in the catalog. Do not paste official Notion or Figma URLs there — those plugins already include them.',
      },
      {
        id: 'studio',
        title: 'In Studio',
        type: 'p',
        text: 'Open + → Skills. Search the list. Last used sits at the top. Plugin skills show human titles (Create Page, not create-page). + → MCP Servers opens a flyout: search installed servers, or + Add MCP to browse. Escape closes the flyout first, then the menu.',
      },
      {
        id: 'soumtok',
        title: 'What Soumtok does today',
        type: 'callout',
        text: 'Add saves the plugin, every skill, and every MCP onto your user row. Studio → + reads those saved skills; Studio → MCP reads the saved servers. Uninstall deletes both. Trial can add one. Soumtok does not yet open the vendor login window after Add. Live Notion/Figma/Drive calls start when that OAuth step ships.',
      },
    ],
  },
  {
    id: 'connectors',
    title: 'Connectors',
    crumb: 'Workspace',
    toc: [
      { id: 'pro', title: 'Trial limit' },
      { id: 'add', title: 'Add a connector' },
      { id: 'custom', title: 'Custom MCP URL' },
      { id: 'link', title: 'Connect link' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Dashboard → Connectors is where you attach MCP servers. Popular tiles (Gmail, Google Drive, Slack) use the official plugin MCP address. Add → Add custom connector is for your own HTTPS URL. Each saved connector gets a connect page at /dashboard/connectors/{id}.',
      },
      {
        id: 'pro',
        title: 'Trial limit',
        type: 'p',
        text: 'Trial can connect one connector. After that, Add asks you to upgrade. Paid plans can add as many as you need.',
      },
      {
        id: 'add',
        title: 'Add a connector',
        type: 'ul',
        items: [
          'Add → Browse connectors lists every catalog MCP',
          'Add → Add custom connector opens name + URL, then a live check',
          'Filters: All, Connected, Not connected',
          'Custom rows show a Custom tag next to Type: Web',
        ],
      },
      {
        id: 'custom',
        title: 'Custom MCP URL',
        type: 'p',
        text: 'Continue checks the HTTPS server in realtime: reach the MCP endpoint, look for an authorization server, then verify OAuth metadata. A 401 still counts as reached — the server exists and wants a sign-in. You then pick Always required / When asked / None, and how the OAuth client is registered. Add saves the connector and also lists that MCP for Studio.',
      },
      {
        id: 'link',
        title: 'Connect link',
        type: 'p',
        text: 'Connect saves the official MCP address (Gmail uses gmailmcp.googleapis.com, Drive uses drivemcp.googleapis.com, Slack uses mcp.slack.com) and opens that product’s login window. You sign in there — Google, Slack, and the rest. After you allow access, click I’ve signed in. Soumtok cannot finish vendor OAuth silently.',
      },
    ],
  },
  {
    id: 'skills',
    title: 'Skills',
    crumb: 'Workspace',
    toc: [
      { id: 'why', title: 'Two kinds of skill' },
      { id: 'builtin', title: 'Built-in and plugin skills' },
      { id: 'upload', title: 'Upload your own' },
      { id: 'agents', title: 'Give to Studio' },
      { id: 'search', title: 'Search and last used' },
      { id: 'next', title: 'Next steps' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'A skill is a named prompt with a job. Review this diff. Write tests. Create a Notion page. Apply your house styleguide. Studio should not make you retype that job. Skills are how the + menu stays short and the work stays sharp.',
      },
      {
        id: 'why',
        title: 'Two kinds of skill',
        type: 'ul',
        items: [
          'Built-in and plugin skills — ready prompts from Soumtok and from Plugins you Add. They insert text into the prompt box. You still hit send.',
          'Uploaded files — Dashboard → Skills. PDFs, notes, zips, images you already have. Studio attaches the file so the agent can read it.',
        ],
      },
      {
        id: 'builtin',
        title: 'Built-in and plugin skills',
        type: 'p',
        text: 'Titles are human — Create Page, not create-page. Installing Notion (or Figma, Slack, Linear) adds that vendor’s skills to the same list. You do not paste a second secret for the skill itself. The arrow on a plugin page opens the SKILL.md on GitHub if you want to read what it will insert.',
      },
      {
        id: 'upload',
        title: 'Upload your own',
        type: 'p',
        text: 'Dashboard → Skills sits under Connectors. Upload a PDF, Markdown, text, zip, image, or an installer you downloaded. Files stay on your account. Soumtok does not run installers. Use this for a design PDF, an API dump, a house style guide — anything the next turn should already know.',
      },
      {
        id: 'agents',
        title: 'Give to Studio',
        type: 'p',
        text: 'In Studio, open + → Skills. Uploaded files are listed first, then built-in and plugin skills. Click a file to attach it. Click a prompt skill to insert it. You can edit the insert before you send. The next run includes that skill.',
      },
      {
        id: 'search',
        title: 'Search and last used',
        type: 'p',
        text: 'The list scrolls. Last used sits at the top, stored in this browser as soumtok-recent-skills. Search filters by title. No match shows an empty state, not a fake row. Escape closes Skills back to the + menu.',
      },
      {
        id: 'next',
        title: 'Next steps',
        type: 'steps',
        items: [
          'Install one plugin you already pay for',
          'Run a skill from Studio → +',
          'Upload one file you keep pasting into chats',
          'Read Plugins if Add is confusing, and Studio chat for the rest of the + menu',
        ],
      },
    ],
  },
  {
    id: 'github',
    title: 'GitHub',
    crumb: 'Workspace',
    toc: [
      { id: 'connect', title: 'Connect' },
      { id: 'scopes', title: 'Scopes and the app' },
      { id: 'use', title: 'Where it is used' },
      { id: 'troubleshoot', title: 'If the list is empty' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'GitHub is how Soumtok sees your repositories. Tokens live on the Better Auth account row for provider github. Soumtok does not replace GitHub. Codebase, Studio attach, Integrations, automations, and cloud agents all read the same connection.',
      },
      {
        id: 'connect',
        title: 'Connect',
        type: 'p',
        text: 'Connect from Overview, Dashboard → Integrations, Studio Start from scratch, or Codebase → Get Started. The OAuth callback is /api/auth/callback/github. After connect, grant repos to the GitHub App if the list is still empty. If GitHub OAuth is not configured on the server, /api/setup/github/start walks setup.',
      },
      {
        id: 'scopes',
        title: 'Scopes and the app',
        type: 'ul',
        items: [
          'OAuth: read:user, user:email, repo',
          'GitHub App soumtok — grant repos at https://github.com/apps/soumtok/installations/new',
          'Future manifest: contents: read, pull_requests: write',
          'Org: github.com/Soumtok',
        ],
      },
      {
        id: 'use',
        title: 'Where it is used',
        type: 'p',
        text: 'GET /api/github/repos returns connected, login, repos, and installUrl. It lists user repos then installation repos and syncs github_login on the profile. Studio attach, Codebase, and Integrations all call this. Clicking a Codebase row stores the repo in sessionStorage and opens Studio.',
      },
      {
        id: 'troubleshoot',
        title: 'If the list is empty',
        type: 'ul',
        items: [
          'Finish onboarding — incomplete profiles get 403 on several APIs',
          'Complete GitHub OAuth (Integrations or Get Started)',
          'Open the install URL and grant the specific repos you need',
          'Confirm the server has GitHub OAuth env and trustedOrigins includes your app origin',
        ],
      },
    ],
  },
  {
    id: 'keys',
    title: 'API keys',
    crumb: 'Workspace',
    toc: [
      { id: 'platform', title: 'Platform keys' },
      { id: 'byok', title: 'Your keys' },
      { id: 'ready', title: 'Ready vs not ready' },
      { id: 'image', title: 'Image key' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Dashboard → Keys is the API page. Click New API Key to create a key. Soumtok shows the full secret once, then stores it hashed. The key is Active immediately. Send it as Authorization: Bearer sk-soumtok-… on Studio, models, and usage. Codebase SSH keys are stored as Active public keys for git clones.',
      },
      {
        id: 'platform',
        title: 'Platform keys',
        type: 'ul',
        items: [
          'OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY, DEEPSEEK_API_KEY, XAI_API_KEY',
          'REPLICATE_API_TOKEN — Flux 2 Max stills; FAL_KEY is an optional Schnell fallback',
          'A model is ready if you have that provider, OpenRouter, or a platform key',
        ],
      },
      {
        id: 'byok',
        title: 'Your keys',
        type: 'p',
        text: 'User API Keys live on Dashboard → Keys. Create one, copy it once, then revoke it from that list when you are done. Never commit .env. Do not paste keys into Studio chat.',
      },
      {
        id: 'ready',
        title: 'Ready vs not ready',
        type: 'p',
        text: 'GET /api/models returns the catalog plus ready flags. Studio will still list a model that is not ready; the completion fails until a key exists. Platform keys cover included usage. BYOK covers Other models and can keep you going after included credits are used.',
      },
      {
        id: 'image',
        title: 'Image key',
        type: 'p',
        text: 'Still images use Replicate Flux 2 Max. The Models page does not advertise this as a counted model. Video, music, and TTS ids are rejected by the image route.',
      },
    ],
  },
  {
    id: 'billing',
    title: 'Billing',
    crumb: 'Workspace',
    toc: [
      { id: 'plans', title: 'Plans' },
      { id: 'spend', title: 'Spending page' },
      { id: 'included', title: 'Included usage' },
      { id: 'other', title: 'Other models' },
      { id: 'ondemand', title: 'On-demand' },
      { id: 'reset', title: 'Reset dates' },
      { id: 'pay', title: 'How you pay' },
      { id: 'labels', title: 'Names we use' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Trial is free and default. It is not sold on the landing page. Paid plans are Pro ($13.99 / mo), Pro Plus ($48 / mo), Ultra ($149 / mo), Team ($32 / user / mo), and Team Premium ($96 / user / mo). Annual is monthly × 12 × 0.8. VAT is 8%. The free tier is always labeled Trial — never Hobby or Free in the product UI. Open Dashboard → Spending to see usage, or Dashboard → Billing to change plan and read invoices.',
      },
      {
        id: 'plans',
        title: 'Plans',
        type: 'ul',
        items: [
          'Trial — two cheap models only (DeepSeek V4 Flash and Gemma 4), a short usage bar, then Studio stops until you upgrade. Internal id is still hobby',
          'Pro — $13.99 / mo, 40 credits, premium models, higher Studio usage, cloud agents',
          'Pro Plus — $48 / mo, 120 credits, featured, GPT-6 and Opus when you need them',
          'Ultra — $149 / mo, 400 credits, maximum Studio and agent capacity',
          'Team — $32 / user / mo, 200 credits, shared rules, SSO ready, usage analytics',
          'Team Premium — $96 / user / mo, about 5× Team usage. Internal id is team_plus',
        ],
      },
      {
        id: 'spend',
        title: 'Spending page',
        type: 'p',
        text: 'On Trial, Spending is two compact cards: Usage (percent used, bar) and Pro with Upgrade to Pro. When the trial pool is gone, the usage card says Free trial ended — upgrade to keep coding. On Pro and above, you see Current plan (started datetime and expires / planRenewsAt), Upgrade available, then square progress bars. Spending meters Soumtok models and Other models (your keys) — there is no third branded quota row. Upgrade opens the Soumtok checkout page (Mobile Money or PayPal / card). Adjust Plan opens Billing.',
      },
      {
        id: 'included',
        title: 'Included usage',
        type: 'p',
        text: 'Included usage is Studio work billed to Soumtok platform keys. Trial does not talk about credits. A small token pool on DeepSeek V4 Flash and Gemma 4 is shown as a progress bar. When the bar fills, Studio returns 402 until you upgrade. Paid plans use credits: Pro 40, Pro Plus 120, Ultra 400, Team 200, Team Premium higher, at about 8,000 tokens per credit. Paid usage counts from the moment the plan started (planStartedAt) to when it renews — not from the first of the calendar month, and not leftover trial tokens.',
      },
      {
        id: 'other',
        title: 'Other models',
        type: 'p',
        text: 'Other models is usage billed to your own provider keys (Dashboard → Keys). Bring-your-own-key calls still count toward analytics. When both included and Other pools are exhausted, further tokens become on-demand dollars.',
      },
      {
        id: 'ondemand',
        title: 'On-demand',
        type: 'p',
        text: 'Usage past your included limit is estimated at $2 per million tokens and shown against a monthly cap. Fixed mode lets you type a dollar amount (default $50) and Save. Unlimited removes the cap. The setting is stored in this browser so you can stop runaway spend before Billing invoices it. PayPal still charges the subscription; on-demand is billed later.',
      },
      {
        id: 'reset',
        title: 'Reset dates',
        type: 'p',
        text: 'On Trial, included usage resets with the trial window shown on Spending. On paid plans, the cycle is plan start → plan renew. Changing plan does not invent leftover trial tokens. Overview and Usage can still show raw tokens and calls for a date range you pick. After upgrade, the Spending bars follow the paid cycle.',
      },
      {
        id: 'pay',
        title: 'How you pay',
        type: 'p',
        text: 'Upgrade opens /checkout — a split page: order summary on the dark left (KES or USD, 20% off annual), payment on the light right. Methods are Mobile Money (M-Pesa via PayHero STK) and PayPal or Card (PayPal Checkout). POST /api/billing/mpesa starts the phone prompt. POST /api/billing/checkout starts PayPal. GET /api/billing/me returns plan, orders, and the KES rate. Cancel resets to Trial. A live PayPal webhook must point at Soumtok — localhost cannot receive live webhooks.',
      },
      {
        id: 'labels',
        title: 'Names we use',
        type: 'p',
        text: 'UI copy says Trial, Pro, Pro Plus, Ultra, Team, Team Premium. Database and checkout still use hobby, pro, pro_plus, ultra, team, team_plus. If you see Hobby in an old screenshot, that is Trial.',
      },
    ],
  },
  {
    id: 'settings',
    title: 'Settings & security',
    crumb: 'Workspace',
    toc: [
      { id: 'profile', title: 'Profile' },
      { id: 'appearance', title: 'Appearance' },
      { id: 'security', title: 'Security' },
      { id: 'neon', title: 'Neon Auth' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Settings is the always-on editor for the same profile the Claim your handle modal starts. First name, last name, handle, links, public page URL, appearance, sessions, and security all write to public.profiles and Better Auth. For handle rules, reserved words, and the public URL, read Handle & public profile — this page does not repeat a stock photo of a person at a laptop.',
      },
      {
        id: 'profile',
        title: 'Profile',
        type: 'p',
        text: 'Avatar and company logo upload to Bunny (soumtok-files) as PNG, JPEG, or WebP under 2 MB. The sidebar account card shows the new avatar immediately (soumtok-avatar event). Theme can follow system, light, or dark. The handle field shows Public page · host/you under it. Plan under your name in the account menu is Trial, Pro, Pro Plus, or Team.',
      },
      {
        id: 'appearance',
        title: 'Appearance',
        type: 'p',
        text: 'System, light, or dark. The product default is dark. This setting is yours; it does not change other people viewing your public page.',
      },
      {
        id: 'security',
        title: 'Security',
        type: 'p',
        text: 'Email and phone codes are Soumtok-issued. Sessions list Web devices; revocation can take up to ten minutes. Password and OAuth accounts live on public.account. Magic links use the same SMTP sender as product mail (info@soumtok.com).',
      },
      {
        id: 'neon',
        title: 'Neon Auth',
        type: 'callout',
        text: 'Do not enable Neon console Auth (Auth → Users). Soumtok uses Better Auth on public.user. Turning on Neon Auth would fight that table and break sign-in.',
      },
    ],
  },
  {
    id: 'api',
    title: 'API',
    crumb: 'Reference',
    toc: [
      { id: 'auth', title: 'Auth' },
      { id: 'me', title: 'Profile and files' },
      { id: 'studio', title: 'Studio' },
      { id: 'github', title: 'GitHub' },
      { id: 'billing', title: 'Billing' },
      { id: 'analytics', title: 'Analytics' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'The app is a Vite SPA with /api on the same origin. Cookie session from Better Auth. Most write routes need a ready user (onboarding complete). Incomplete profiles get 403 on files and similar endpoints. This is the HTTP surface the dashboard already uses — not a separate public REST product yet.',
      },
      {
        id: 'auth',
        title: 'Auth',
        type: 'ul',
        items: [
          '/api/auth/* — Better Auth (sign-in, callbacks, session)',
          'User API key: Authorization: Bearer sk-soumtok-… on Studio, models, and usage',
          'POST /api/account-keys — create a user API key (shown once)',
          'GET /api/account-keys — list Active API and SSH keys',
          'Google callback /api/auth/callback/google',
          'GitHub callback /api/auth/callback/github',
          'trustedOrigins must stay a static array',
        ],
      },
      {
        id: 'me',
        title: 'Profile and files',
        type: 'ul',
        items: [
          'Profile read/write on /api/me and public profile save',
          'PUT /api/me/photo/avatar — PNG, JPEG, WebP under 2 MB to Bunny',
          'GET /api/u/{username}/photo — public avatar only when the profile is public',
          'Username check before claim',
        ],
      },
      {
        id: 'studio',
        title: 'Studio',
        type: 'ul',
        items: [
          'GET /api/models — catalog plus ready flags',
          'POST /api/studio/complete — chat completion (platform or BYOK)',
          'POST /api/studio/image — still Flux 2 Max (Replicate) only; video/audio/tts ids are rejected',
        ],
      },
      {
        id: 'github',
        title: 'GitHub',
        type: 'ul',
        items: [
          'GET /api/github/repos — connected, login, repos, installUrl',
          '/api/setup/github/start — when OAuth is not configured yet',
        ],
      },
      {
        id: 'billing',
        title: 'Billing',
        type: 'ul',
        items: [
          'POST /api/billing/checkout — start checkout for pro, pro_plus, ultra, or team',
          'GET /api/billing/me — plan, status, subscription, orders',
          'PayPal webhook on the server — must be a Soumtok URL in production',
        ],
      },
      {
        id: 'analytics',
        title: 'Analytics',
        type: 'ul',
        items: [
          'GET /api/analytics/summary — usage rows (model, provider, billed_to, calls, tokens), events, activity heatmap',
          'billed_to user means BYOK (Other models). Platform usage is included',
          'GET /api/health — database, oauth, storage, mail, sms, coding providers',
        ],
      },
    ],
  },
  {
    id: 'cli',
    title: 'CLI',
    crumb: 'Reference',
    toc: [
      { id: 'dev', title: 'Local app' },
      { id: 'env', title: 'What env is for' },
      { id: 'not', title: 'No product CLI yet' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Soumtok is a web app. There is no Soumtok CLI you install to talk to Studio, and no desktop app yet — the landing waitlist is Windows. The command you run locally as a developer is npm run dev -- --host --port 5173, then open http://localhost:5173/. If 5173 is taken, Vite picks the next port — check the terminal for Local:.',
      },
      {
        id: 'dev',
        title: 'Local app',
        type: 'p',
        text: 'Env is gitignored. You need DATABASE_URL, Better Auth secrets, Google/GitHub OAuth, Bunny, SMTP, and the coding keys you want live. Do not put secrets in docs or commits. localhost cannot receive live PayPal webhooks — use a public Soumtok URL for production billing events.',
      },
      {
        id: 'env',
        title: 'What env is for',
        type: 'ul',
        items: [
          'DATABASE_URL — Neon / Lakebase Postgres',
          'Better Auth secret and OAuth client ids',
          'Bunny soumtok-files for avatars and logos',
          'SMTP info@soumtok.com for codes and magic links',
          'Provider keys for coding; REPLICATE_API_TOKEN for stills',
          'PayPal and PayHero for checkout',
        ],
      },
      {
        id: 'not',
        title: 'No product CLI yet',
        type: 'p',
        text: 'GitHub is the git remote. Soumtok does not host origin remotes and does not ship a command-line agent you curl into CI. If you need unattended work, use Automations (schedule or webhook) or Cloud agents. If you need a desktop shell, join the Windows waitlist on the landing page.',
      },
    ],
  },
  {
    id: 'plans',
    title: 'Plans',
    crumb: 'Reference',
    toc: [
      { id: 'credits', title: 'Credits' },
      { id: 'spend', title: 'Where you see them' },
      { id: 'landing', title: 'Landing vs dashboard' },
      { id: 'upgrade', title: 'Upgrade path' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Trial is a short usage bar on two cheap models, not a credit pack. Paid credits: Pro 40, Pro Plus 120, Ultra 400, Team 200. The default plan is Trial, never sold as Free on the product. Internal id hobby is Trial in every label you see.',
      },
      {
        id: 'credits',
        title: 'Credits',
        type: 'p',
        text: 'Credits are the monthly allowance used when estimating Studio spend. One credit is treated as about 8,000 tokens on Spending. Overview and Usage show raw tokens and calls. Extra tokens become on-demand spend after both Soumtok models and Other models (your keys) are used up. See Billing for the full spending rules.',
      },
      {
        id: 'spend',
        title: 'Where you see them',
        type: 'p',
        text: 'Dashboard → Spending is the live view. Trial is two cards. Paid plans add square usage bars. Dashboard → Billing is checkout, monthly vs annual (20% off), and invoices.',
      },
      {
        id: 'landing',
        title: 'Landing vs dashboard',
        type: 'p',
        text: 'The marketing page sells Pro, Pro Plus, Ultra, and Team. Team Premium ($96 / user) is a dashboard / checkout plan. Trial is the default after signup, not a landing card. Pricing must match shared/plans.ts: Pro $13.99, Pro Plus $48, Ultra $149, Team $32 / user, Team Premium $96 / user. Annual is monthly × 12 × 0.8. VAT 8%.',
      },
      {
        id: 'upgrade',
        title: 'Upgrade path',
        type: 'ul',
        items: [
          'Trial → Pro from Spending or Billing',
          'Pro → Pro Plus from Spending Upgrade available',
          'Pro Plus → Ultra from the next upgrade card',
          'Ultra → Team from the next upgrade card',
          'Cancel → Trial',
        ],
      },
    ],
  },
  {
    id: 'company',
    title: 'Company',
    crumb: 'Reference',
    toc: [
      { id: 'team', title: 'The team' },
      { id: 'contact', title: 'Contact' },
      { id: 'legal', title: 'Legal' },
    ],
    blocks: [
      {
        type: 'p',
        text: 'Soumtok is a coding-agent company building for desks that actually ship — first in Nairobi, then anywhere the same loop works. Founder: Joseph. Product mail is info@soumtok.com — the same address on the Codebase beta callout. Support: support@soumtok.com.',
      },
      {
        id: 'team',
        title: 'The team',
        type: 'p',
        text: 'Changelog notes on the landing page are ships that actually landed. Brand lockup and mark are the files in /images used in the header, sidebar, and public profile. GitHub org: github.com/Soumtok.',
      },
      {
        id: 'contact',
        title: 'Contact',
        type: 'ul',
        items: [
          'Product mail: info@soumtok.com',
          'Request a demo from the landing page',
          'GitHub org: github.com/Soumtok',
          'Codebase and agent feedback: same inbox',
        ],
      },
      {
        id: 'legal',
        title: 'Legal',
        type: 'p',
        text: 'Terms, acceptable use, privacy, data use, and security are linked from the footer. Soumtok is based in Nairobi. We do not print SOC or ISO badges we have not earned.',
      },
    ],
  },
]

export function docsPage(id: string) {
  return DOCS_PAGES.find((page) => page.id === id) || DOCS_PAGES[0]
}

export function docsPath(path: string) {
  const rest = path.replace(/^\/docs\/?/, '')
  return rest.split('/')[0] || 'overview'
}

export function docsSearchText(page: DocsPage) {
  return [
    page.title,
    page.crumb,
    ...page.toc.map((item) => item.title),
    ...page.blocks.flatMap((block) => {
      const parts = [block.title || '']
      if ('text' in block) parts.push(block.text)
      if ('items' in block) parts.push(...block.items)
      if ('alt' in block) parts.push(block.alt)
      return parts
    }),
  ]
    .join(' ')
    .toLowerCase()
}
