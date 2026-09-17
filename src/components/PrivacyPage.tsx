import { LegalPage, type LegalSection } from './LegalPage'

const UPDATED = 'September 17, 2026'

const SECTIONS: LegalSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    paragraphs: [
      'Soumtok respects your privacy. This policy explains what we collect when you use Studio, Desktop, the Terminal CLI, cloud agents, and soumtok.com — and how we use, store, and share it.',
      'Soumtok is built in Nairobi, Kenya. We do not sell your personal data.',
    ],
  },
  {
    id: 'collect',
    title: 'Information we collect',
    paragraphs: ['We collect information you provide and data generated when you use the product:'],
    bullets: [
      'Account: name, email, phone for verification, profile handle, avatar, team membership',
      'Authentication: session tokens, device labels, two-factor status, OAuth identifiers from Google or GitHub sign-in',
      'Billing: plan, payment status, invoices, and transaction references from PayPal or M-Pesa processors — not full card numbers',
      'Usage: model turns, token estimates, pool balances, and feature activity for metering and support',
      'GitHub: repository names, languages, and descriptions you grant — not your full git history unless an agent clones a repo to work',
      'Content you send: chat messages, attachments, screenshots, and files you upload for document extraction or image generation',
      'Technical: browser or app version, IP address, and basic logs needed to secure and operate the service',
    ],
  },
  {
    id: 'use',
    title: 'How we use information',
    paragraphs: ['We use your data to run Soumtok, bill fairly, and keep accounts secure:'],
    bullets: [
      'Provide Studio, Desktop, Terminal CLI, and cloud agent features',
      'Route prompts to the AI models and tools you select',
      'Process subscriptions, usage pools, and invoices',
      'Send verification codes, magic links, receipts, and product mail you expect',
      'Detect abuse, fraud, and security incidents',
      'Improve reliability and fix bugs — aggregated analytics where possible',
    ],
  },
  {
    id: 'share',
    title: 'When we share data',
    paragraphs: [
      'We share data only with processors and partners needed to deliver the service, under contracts that require appropriate protection.',
    ],
    bullets: [
      'Model providers (OpenAI, Anthropic, Google, DeepSeek, xAI, and others you choose) receive prompts and context needed for each turn',
      'GitHub receives API calls when you connect repos or run cloud agents',
      'Payment processors handle checkout and webhooks',
      'Infrastructure: Neon (Postgres), Bunny (file storage), email delivery, and hosting providers',
      'Law enforcement or regulators when required by valid legal process',
    ],
  },
  {
    id: 'storage',
    title: 'Storage and retention',
    paragraphs: [
      'Account and billing records are stored in our database while your account is active and for a reasonable period afterward for legal and accounting needs.',
      'Chat threads and agent history are kept so you can resume work. You may delete content where the product provides deletion controls. Backups may persist for a limited time.',
      'Session cookies and local storage keep you signed in. Sign out or revoke sessions from Settings → Security.',
    ],
  },
  {
    id: 'rights',
    title: 'Your choices and rights',
    paragraphs: [
      'You can update profile details, manage GitHub grants, cancel subscriptions, and revoke sessions in the dashboard. Contact support@soumtok.com for access, correction, or deletion requests we cannot handle in-product.',
      'If you are in a region with specific privacy rights, we will honor applicable requests after verifying your identity.',
    ],
  },
  {
    id: 'security',
    title: 'Security',
    paragraphs: [
      'We use encryption in transit, access controls, and industry-standard practices for a young SaaS product. No online service is perfectly secure — use strong passwords, enable two-factor authentication when offered, and rotate API keys you upload.',
      'We do not display SOC or ISO certifications we have not earned.',
    ],
  },
  {
    id: 'children',
    title: 'Children',
    paragraphs: [
      'Soumtok is not directed at children under 16. We do not knowingly collect data from children. Contact us if you believe a child created an account.',
    ],
  },
  {
    id: 'changes',
    title: 'Changes and contact',
    paragraphs: [
      'We may update this policy. The “Last updated” date at the top will change when we do. Continued use after an update means you accept the revised policy.',
      'Privacy questions: support@soumtok.com · Product: info@soumtok.com · Soumtok, Nairobi, Kenya',
    ],
  },
]

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={UPDATED}
      intro="This policy describes how Soumtok collects, uses, and protects personal data when you use our coding platform and website."
      sections={SECTIONS}
      sibling={{ label: 'Terms of Service', href: '/terms' }}
    />
  )
}
