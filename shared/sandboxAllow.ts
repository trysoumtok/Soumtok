const BLOCK =
  /[;&|<>`]|\$\(|&&|\|\||\brm\b|\bdel\b|\bformat\b|\bcurl\b|\bwget\b|\bssh\b|\bpowershell\b|\bcmd\b|\breg\b|\bnet\b|\binvoke-|\bstart\s+/i

const ALLOW_HEAD =
  /^(node|nodejs|python|python3|py|npm|npx|git|echo|ls|dir|type|cat|pwd|whoami|mkdir|md|touch)\b/i

export function isGitPushCommand(raw: string) {
  const command = raw.trim()
  if (!/^git\s+push\b/i.test(command)) return false
  if (/[;&|<>`]|\$\(|&&|\|\|/.test(command)) return false
  return true
}

export function parseSandboxCommand(raw: string) {
  const command = raw.trim().slice(0, 400)
  if (!command) return null
  if (isGitPushCommand(command)) return null
  if (BLOCK.test(command) && !/^echo\s/.test(command)) return null
  if (!ALLOW_HEAD.test(command)) return null
  const parts = command.split(/\s+/).filter(Boolean)
  const head = parts[0].toLowerCase()
  const sub = (parts[1] || '').toLowerCase()
  if (head === 'npm') {
    if (!['test', 'run', 'install', 'i', 'ci'].includes(sub)) return null
    if (sub === 'run' && !/^test$/i.test(parts[2] || '')) return null
    if (parts.includes('-g') || parts.includes('--global') || parts.includes('publish')) return null
  }
  if (head === 'npx' && !/^tsc$/i.test(parts[1] || '')) return null
  if (head === 'git' && !/^(status|log|diff|show|add|commit|clone)$/i.test(parts[1] || '')) return null
  if (head === 'git' && /^commit$/i.test(parts[1] || '') && !parts.some((part) => part === '-m' || part.startsWith('-m'))) {
    return null
  }
  if (head === 'git' && /^clone$/i.test(parts[1] || '')) return null
  return { command, parts, head, sub }
}
