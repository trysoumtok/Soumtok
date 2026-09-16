/** Provider/runtime messages that mean the stream was cut, not that the job is invalid. */
export function isTransientStreamError(message: string) {
  return /terminat|aborted|abort error|timeout|econnreset|socket hang|und_err|network error|overload|429|rate.?limit|try again|temporar|unavailable|stream stopped|connection reset/i.test(
    message || '',
  )
}

export function friendlyStreamError(message: string) {
  if (isTransientStreamError(message)) {
    return 'The model dropped mid-write. Tap Retry — files already written are kept.'
  }
  return (message || '').trim() || 'Request failed'
}
