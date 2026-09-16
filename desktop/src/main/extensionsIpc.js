const { pathToFileURL } = require('url')
const {
  searchOpenVsx,
  popularOpenVsx,
  fetchExtensionDetail,
  installFromOpenVsx,
  listInstalledExtensions,
  uninstallExtension,
  readWorkspaceRecommendations,
} = require('./extensionsMarket')
const { listExtensionActivityContributions } = require('./extensionActivity')
const {
  ensureSoumtokCodeInstalled,
  startSoumtokCodeHost,
  stopSoumtokCodeHost,
  soumtokCodeStatus,
  runHostWorkbenchCommand,
} = require('./extensionHostRuntime')
const {
  attachExtensionHostView,
  layoutExtensionHostView,
  hideExtensionHostView,
} = require('./extensionHostView')
const { BrowserWindow } = require('electron')
const { extensionsRoot, extensionsStorageInfo } = require('./extensionsMarket')
const { isSignedInScope } = require('./userScope')

function requireSignedInForExtensions() {
  if (isSignedInScope()) return null
  return {
    ok: false,
    error: 'Sign in to Soumtok first. Claude Code uses your own Anthropic subscription — not the machine owner’s account.',
  }
}

function registerExtensionsIpc(deps) {
  const { ipcMain, folderOf } = deps

  const channels = [
    [
      'extensions:search',
      async (_e, payload) => {
        try {
          const query = typeof payload === 'string' ? payload : payload?.query
          const pageNumber = payload?.pageNumber || 1
          const pageSize = payload?.pageSize || 48
          const { gallerySearch } = require('./vscodeGallery')
          const { extensions, total } = await gallerySearch(query, pageSize, pageNumber)
          return { ok: true, extensions, total }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'Search failed',
            extensions: [],
            total: 0,
          }
        }
      },
    ],
    [
      'extensions:popular',
      async (_e, payload) => {
        try {
          const pageNumber = payload?.pageNumber || 1
          const pageSize = payload?.pageSize || 50
          const { browseGallery } = require('./vscodeGallery')
          const { extensions, total } = await browseGallery({
            mode: payload?.mode || 'popular',
            sort: payload?.sort,
            pageNumber,
            pageSize,
          })
          return { ok: true, extensions, total }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'Marketplace unavailable',
            extensions: [],
            total: 0,
          }
        }
      },
    ],
    [
      'extensions:installedMarket',
      async () => {
        try {
          const { galleryExtensionById } = require('./vscodeGallery')
          const { latestInstallableVersion } = require('./extensionsMarket')
          const list = listInstalledExtensions()
          const extensions = await Promise.all(
            list.map(async (row) => {
              try {
                const live = await galleryExtensionById(`${row.publisher}.${row.name}`)
                if (live) {
                  // An update is only real if that version can be installed on this platform.
                  const installable = await latestInstallableVersion(row.publisher, row.name)
                  return {
                    ...live,
                    installed: true,
                    installPath: row.path,
                    path: row.path,
                    version: row.version || live.version,
                    installedVersion: row.version || live.version,
                    marketVersion: installable || row.version,
                    galleryVersion: live.version || '',
                  }
                }
              } catch {
                /* offline row */
              }
              return {
                id: `${row.publisher}.${row.name}`,
                publisher: row.publisher,
                name: row.name,
                displayName: row.displayName,
                description: row.description,
                version: row.version,
                installedVersion: row.version,
                marketVersion: row.version,
                installed: true,
                installPath: row.path,
                iconUrl: '',
                downloadCount: 0,
                averageRating: 0,
              }
            }),
          )
          return { ok: true, extensions, total: extensions.length }
        } catch (error) {
          return {
            ok: false,
            error: error instanceof Error ? error.message : 'Could not load installed extensions',
            extensions: [],
            total: 0,
          }
        }
      },
    ],
    [
      'extensions:installed',
      () => {
        try {
          const extensions = listInstalledExtensions().map((row) => ({
            ...row,
            iconUrl: row.iconPath ? pathToFileURL(row.iconPath).href : '',
          }))
          return {
            ok: true,
            extensions,
            storage: extensionsStorageInfo(),
          }
        } catch (error) {
          return {
            ok: false,
            extensions: [],
            error: error instanceof Error ? error.message : 'Could not read extensions folder',
          }
        }
      },
    ],
    [
      'extensions:storage',
      () => {
        try {
          return { ok: true, ...extensionsStorageInfo(), extensions: listInstalledExtensions().length }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'Could not read extension storage' }
        }
      },
    ],
    [
      'extensions:activityBar',
      () => {
        try {
          const installed = listInstalledExtensions()
          const items = listExtensionActivityContributions(installed).map((row) => ({
            ...row,
            iconUrl: row.iconPath ? pathToFileURL(row.iconPath).href : '',
          }))
          return { ok: true, items }
        } catch (error) {
          return {
            ok: false,
            items: [],
            error: error instanceof Error ? error.message : 'Could not read extension contributions',
          }
        }
      },
    ],
    [
      'extensions:install',
      async (_e, payload) => {
        try {
          const publisher = payload?.publisher || payload?.namespace
          const name = payload?.name
          if (!publisher || !name) return { ok: false, error: 'Need publisher and name' }
          return await installFromOpenVsx(publisher, name)
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'Install failed' }
        }
      },
    ],
    [
      'extensions:uninstall',
      (_e, installPath) => {
        try {
          return uninstallExtension(installPath)
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'Uninstall failed' }
        }
      },
    ],
    [
      'extensions:recommendations',
      (event) => {
        const folder = folderOf(event)
        return { ok: true, recommendations: readWorkspaceRecommendations(folder) }
      },
    ],
    [
      'extensions:detail',
      async (_e, payload) => {
        try {
          const publisher = payload?.publisher || payload?.namespace
          const name = payload?.name
          if (!publisher || !name) return { ok: false, error: 'Need publisher and name' }
          return { ok: true, extension: await fetchExtensionDetail(publisher, name) }
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'Could not load extension' }
        }
      },
    ],
    [
      'extensions:activate',
      async () => {
        let list = []
        try {
          list = listInstalledExtensions()
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : 'Could not list extensions' }
        }
        if (!list.length) {
          return { ok: false, error: 'Install an extension from the marketplace first.' }
        }
        const activity = listExtensionActivityContributions(list)
        return {
          ok: true,
          count: list.length,
          launched: false,
          host: 'Soumtok Code',
          embedded: false,
          extensionsDir: extensionsRoot(),
          activity,
          message: `${list.length} extension(s) on this device. Open one from the activity bar to start the host.`,
        }
      },
    ],
    [
      'extensionHost:ensure',
      async () => ensureSoumtokCodeInstalled(),
    ],
    [
      'extensionHost:start',
      async (event, payload) => {
        const gate = requireSignedInForExtensions()
        if (gate) return gate
        try {
          const folder = folderOf(event)
          return await startSoumtokCodeHost({
            workspaceFolder: payload?.workspace || folder,
            extensionsDir: extensionsRoot(),
            usePlatformWorkspace: payload?.usePlatformWorkspace !== false,
          })
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'Could not start Soumtok Code' }
        }
      },
    ],
    [
      'extensionHost:status',
      () => ({ ok: true, ...soumtokCodeStatus() }),
    ],
    [
      'extensionHost:stop',
      (event) => {
        stopSoumtokCodeHost()
        const win = BrowserWindow.fromWebContents(event.sender)
        hideExtensionHostView(win)
        return { ok: true }
      },
    ],
    [
      'extensionHost:embed',
      (event, payload) => {
        const gate = requireSignedInForExtensions()
        if (gate) return gate
        const win = BrowserWindow.fromWebContents(event.sender)
        return attachExtensionHostView(win, payload?.url, {
          extensionId: payload?.extensionId,
          openCommand: payload?.openCommand,
          title: payload?.title,
        })
      },
    ],
    [
      'extensionHost:layout',
      (event, payload) => layoutExtensionHostView(BrowserWindow.fromWebContents(event.sender), payload),
    ],
    [
      'extensionHost:hide',
      (event) => hideExtensionHostView(BrowserWindow.fromWebContents(event.sender)),
    ],
    [
      'extensionHost:runCommand',
      (_e, payload) => {
        try {
          return runHostWorkbenchCommand(payload?.command)
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : 'Command failed' }
        }
      },
    ],
  ]

  for (const [channel, handler] of channels) {
    try {
      ipcMain.removeHandler(channel)
    } catch {
      /* first register */
    }
    ipcMain.handle(channel, handler)
  }
}

module.exports = { registerExtensionsIpc }
