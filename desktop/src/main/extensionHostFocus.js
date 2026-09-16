/** Legacy hook — opening is handled in extensionHostCommand.js (single path, less CPU). */

function clearFocusTimers() {}

function scheduleExtensionHostFocus() {}

module.exports = { scheduleExtensionHostFocus, clearFocusTimers }
