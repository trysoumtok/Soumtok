function registerSetupIpc(deps) {
  const {
    ipcMain,
    folderOf,
    sessionUser,
    api,
    API,
    isHtmlSpaBody,
    detectInstallations,
    forkBuildHint,
    isSoumtokCodeEmbedded,
  } = deps

  const handler = async (event) => {
    const folder = folderOf(event)
    const session = await sessionUser()
    let health = { ok: false, coding: {}, image: false }
    try {
      const res = await api('GET', '/api/health')
      health.ok = res.status === 200 && !isHtmlSpaBody(res.data)
      health.coding = res.data?.coding && typeof res.data.coding === 'object' ? res.data.coding : {}
      health.image = Boolean(res.data?.image)
      health.version = res.data?.version
    } catch {
      health.ok = false
    }
    const codingReady = Object.values(health.coding).some(Boolean)
    return {
      api: API,
      folder: folder || null,
      healthOk: health.ok,
      codingReady,
      imageReady: Boolean(health.image),
      coding: health.coding,
      signedIn: Boolean(session.user),
      userEmail: session.user?.email || null,
      installs: detectInstallations(),
      fork: forkBuildHint(),
      features: {
        agent: health.ok && session.user && codingReady,
        tabCtrlK: health.ok && session.user && codingReady,
        extensionsInstall: true,
        extensionsRun:
          (typeof isSoumtokCodeEmbedded === 'function' && isSoumtokCodeEmbedded()) ||
          detectInstallations().some((i) => i.id === 'soumtok-code'),
        extensionHostEmbedded: typeof isSoumtokCodeEmbedded === 'function' && isSoumtokCodeEmbedded(),
        extensionHostFork: forkBuildHint().clonePresent,
      },
    }
  }

  try {
    ipcMain.removeHandler('setup:status')
  } catch {
    /* ignore */
  }
  ipcMain.handle('setup:status', handler)
}

module.exports = { registerSetupIpc }
