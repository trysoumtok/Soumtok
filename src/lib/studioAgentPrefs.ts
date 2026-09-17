import {
  applyRunModeToPrefs,
  mergeDesktopAgentPrefs,
  type DesktopAgentPrefs,
} from '../../shared/desktopAgentPrefs'

const STORAGE_KEY = 'soumtok.studio.agentPrefs'

export function readStudioAgentPrefs(): DesktopAgentPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return applyRunModeToPrefs(mergeDesktopAgentPrefs(null))
    return applyRunModeToPrefs(mergeDesktopAgentPrefs(JSON.parse(raw) as Partial<DesktopAgentPrefs>))
  } catch {
    return applyRunModeToPrefs(mergeDesktopAgentPrefs(null))
  }
}

export function writeStudioAgentPrefs(prefs: Partial<DesktopAgentPrefs>) {
  const merged = applyRunModeToPrefs(mergeDesktopAgentPrefs({ ...readStudioAgentPrefs(), ...prefs }))
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  return merged
}

export function studioAgentPrefsForRunMode(
  prefs: DesktopAgentPrefs,
  runMode: 'agent' | 'ask' | 'plan',
): DesktopAgentPrefs {
  const next = { ...prefs }
  if (runMode === 'ask') next.runMode = 'ask'
  else if (runMode === 'plan') next.runMode = 'auto-review'
  else next.runMode = 'run-everything'
  return applyRunModeToPrefs(next)
}
