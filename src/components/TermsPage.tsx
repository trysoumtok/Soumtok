import { LegalPage, type LegalSection } from './LegalPage'

const UPDATED = 'September 17, 2026'

const SECTIONS: LegalSection[] = [
  {
    id: 'service',
    title: 'The service',
    paragraphs: [
      'Soumtok provides an AI coding platform: Studio in the browser, Soumtok Desktop for Windows, macOS, and Linux, the Soumtok Terminal CLI, and cloud agents that work against GitHub repositories you grant. One Soumtok account covers every surface.',
      'We may update features, models, and pricing. When a change materially affects paid plans, we will give reasonable notice through the product or by email.',
    ],
  },
  {
    id: 'accounts',
    title: 'Accounts and eligibility',
    paragraphs: [
      'You must provide accurate account information and keep credentials secure. You are responsible for activity under your account until you sign out or revoke a session.',
      'You must be old enough to enter a binding contract in your jurisdiction. Team and business use requires that whoever pays has authority to accept these terms for the organization.',
    ],
  },
  {
    id: 'billing',
    title: 'Subscriptions and billing',
    paragraphs: [
      'Soumtok is a paid product. Consumer plans are Start ($5/month), Pro ($20/month), and Pro Plus ($48/month). Team plans are billed per seat. Prices on the site at checkout apply. VAT may apply where required.',
      'Usage is metered against monthly pools on paid plans. When a pool is exhausted, model access in that pool pauses until renewal, upgrade, bring-your-own keys, or on-demand billing where enabled.',
      'Payments are processed by PayPal, card, or M-Pesa as offered at checkout. Subscriptions renew until you cancel from Dashboard → Billing. Refunds follow our support policy and applicable payment-provider rules.',
    ],
    bullets: [
      'No free tier — subscribe to Start or use your own API keys',
      'Annual billing is monthly × 12 with a 20% discount where shown',
      'Failed payments may suspend platform model access until resolved',
    ],
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    paragraphs: [
      'Use Soumtok to build and maintain software you have the right to work on. Do not use the service to break the law, infringe others’ rights, distribute malware, scrape or attack third parties, or attempt to bypass usage limits or security controls.',
      'You may not resell Soumtok access, probe our infrastructure without permission, or use the service to generate spam or abusive content at scale.',
    ],
    bullets: [
      'Grant GitHub repos only when you are allowed to connect them',
      'Model output is your responsibility to review before shipping',
      'We may suspend accounts that abuse providers, billing, or other users',
    ],
  },
  {
    id: 'github',
    title: 'GitHub and third parties',
    paragraphs: [
      'GitHub remains the source of truth for your code. Soumtok lists repos you grant through the Soumtok GitHub App and may open branches or pull requests on your behalf when you use cloud agents or automations.',
      'Third-party models, plugins, MCP servers, and connectors are governed by their own terms. When you connect them, you authorize Soumtok to call them with the scopes you approve.',
    ],
  },
  {
    id: 'ip',
    title: 'Intellectual property',
    paragraphs: [
      'You keep ownership of your code and content. You grant Soumtok a limited license to host, process, and transmit your inputs and outputs solely to operate the service — including sending prompts to model providers you select.',
      'Soumtok’s name, logos, and product UI are our property. Do not imply endorsement or misrepresent your relationship with Soumtok.',
    ],
  },
  {
    id: 'disclaimer',
    title: 'Disclaimer and liability',
    paragraphs: [
      'AI output can be wrong. You must review diffs, tests, and security before merging. The service is provided “as is” to the fullest extent permitted by law.',
      'Soumtok is not liable for indirect, incidental, or consequential damages, or for loss of profits, data, or goodwill arising from use of the service. Our total liability for any claim is limited to the fees you paid to Soumtok in the twelve months before the claim.',
    ],
  },
  {
    id: 'law',
    title: 'Governing law and contact',
    paragraphs: [
      'Soumtok is operated from Nairobi, Kenya. These terms are governed by the laws of Kenya, without regard to conflict-of-law rules. Disputes should first be raised with support@soumtok.com.',
      'Product questions: info@soumtok.com · Support: support@soumtok.com · GitHub: github.com/trysoumtok/Soumtok',
    ],
  },
]

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={UPDATED}
      intro="These terms govern your use of Soumtok — Studio, Desktop, Terminal CLI, cloud agents, and billing. By creating an account or paying for a plan, you agree to them."
      sections={SECTIONS}
      sibling={{ label: 'Privacy Policy', href: '/privacy' }}
    />
  )
}
