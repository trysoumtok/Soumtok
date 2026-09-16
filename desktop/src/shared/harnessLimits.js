/** Keep in sync with shared/desktopAgentPrefs.ts maxToolRoundsForPrefs. */
const { maxToolRoundsForPrefs } = require('./agentPrefsRuntime')

function maxToolRounds(driver, prefs) {
  return maxToolRoundsForPrefs(driver === 'bot' ? 'bot' : 'ide', prefs)
}

module.exports = { maxToolRounds }
