const { contextBridge, ipcRenderer } = require('electron')
const { readOpenAiKeyFromEnvFile, transcribeWithOpenAiDirect } = require('../main/speechTranscribeCore')

async function speechTranscribe(payload) {
  try {
    const out = await ipcRenderer.invoke('speech:transcribe', payload)
    if (out && typeof out === 'object') return out
  } catch (err) {
    const msg = String(err?.message || err)
    if (!/no handler registered/i.test(msg)) return { error: msg }
  }
  const key = (process.env.OPENAI_API_KEY || readOpenAiKeyFromEnvFile() || '').trim()
  if (!key) {
    return {
      error: 'Add OPENAI_API_KEY to your Soumtok repo .env file, then reload the window (Ctrl+R).',
    }
  }
  return transcribeWithOpenAiDirect(key, payload)
}

contextBridge.exposeInMainWorld('soumtok', {
  info: () => ipcRenderer.invoke('app:info'),
  window: (action) => ipcRenderer.invoke('window:control', action),
  newWindow: () => ipcRenderer.invoke('window:new'),
  openFolder: () => ipcRenderer.invoke('folder:open'),
  openPath: (dir) => ipcRenderer.invoke('folder:openPath', dir),
  closeFolder: () => ipcRenderer.invoke('folder:close'),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  openWorkspaceFile: () => ipcRenderer.invoke('workspace:openFile'),
  saveWorkspaceAs: (payload) => ipcRenderer.invoke('workspace:saveAs', payload),
  duplicateWorkspace: (sourcePath) => ipcRenderer.invoke('workspace:duplicate', sourcePath),
  openFileDialog: () => ipcRenderer.invoke('file:open'),
  saveFileAs: (payload) => ipcRenderer.invoke('file:saveAs', payload),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  recents: () => ipcRenderer.invoke('recents:list'),
  clone: (url) => ipcRenderer.invoke('git:clone', url),
  ssh: (target) => ipcRenderer.invoke('ssh:connect', target),
  tree: (extraFolders) => ipcRenderer.invoke('folder:tree', extraFolders),
  workspaceGrep: (payload) => ipcRenderer.invoke('workspace:grep', payload),
  workspaceReplaceAll: (payload) => ipcRenderer.invoke('workspace:replaceAll', payload),
  workspaceLoad: () => ipcRenderer.invoke('workspace:load'),
  workspaceSave: (payload) => ipcRenderer.invoke('workspace:save', payload),
  readFile: (filePath) => ipcRenderer.invoke('file:read', filePath),
  readFileMedia: (filePath) => ipcRenderer.invoke('file:readMedia', filePath),
  writeFile: (filePath, contents) => ipcRenderer.invoke('file:write', filePath, contents),
  createFile: () => ipcRenderer.invoke('file:create'),
  createFilePath: (relPath, contents) => ipcRenderer.invoke('file:createPath', relPath, contents),
  mkdirPath: (relPath) => ipcRenderer.invoke('folder:mkdir', relPath),
  deletePath: (targetPath) => ipcRenderer.invoke('file:delete', targetPath),
  renamePath: (fromPath, toPath) => ipcRenderer.invoke('file:rename', fromPath, toPath),
  showItemInFolder: (targetPath) => ipcRenderer.invoke('shell:showItem', targetPath),
  gitStatus: (workspaceHint) => ipcRenderer.invoke('git:status', workspaceHint),
  gitInit: (workspaceHint) => ipcRenderer.invoke('git:init', workspaceHint),
  gitCommit: (message, workspaceHint) => ipcRenderer.invoke('git:commit', message, workspaceHint),
  gitPublish: (workspaceHint) => ipcRenderer.invoke('git:publish', workspaceHint),
  openHelp: () => ipcRenderer.invoke('help:open'),
  login: (mode) => ipcRenderer.invoke('auth:login', mode),
  pollLogin: (id) => ipcRenderer.invoke('auth:poll', id),
  logout: () => ipcRenderer.invoke('auth:logout'),
  session: () => ipcRenderer.invoke('auth:session'),
  agentRun: (payload) => ipcRenderer.invoke('agent:run', payload),
  agentCancel: () => ipcRenderer.invoke('agent:cancel'),
  agentJobs: () => ipcRenderer.invoke('agent:jobs'),
  agentJobEvents: (id) => ipcRenderer.invoke('agent:job-events', id),
  agentSteer: (text) => ipcRenderer.invoke('agent:steer', { text }),
  agentAskReply: (payload) => ipcRenderer.invoke('agent:askReply', payload),
  checkUpdates: () => ipcRenderer.invoke('app:checkUpdates'),
  logCrash: (payload) => ipcRenderer.invoke('crash:log', payload),
  checkpointRestore: (id) => ipcRenderer.invoke('checkpoint:restore', id),
  extensionsSearch: (payload) => ipcRenderer.invoke('extensions:search', payload),
  extensionsPopular: (payload) => ipcRenderer.invoke('extensions:popular', payload),
  extensionsDetail: (payload) => ipcRenderer.invoke('extensions:detail', payload),
  extensionsInstalled: () => ipcRenderer.invoke('extensions:installed'),
  extensionsStorage: () => ipcRenderer.invoke('extensions:storage'),
  extensionsInstalledMarket: () => ipcRenderer.invoke('extensions:installedMarket'),
  extensionsInstall: (payload) => ipcRenderer.invoke('extensions:install', payload),
  extensionsUninstall: (path) => ipcRenderer.invoke('extensions:uninstall', path),
  extensionsRecommendations: () => ipcRenderer.invoke('extensions:recommendations'),
  extensionsActivate: () => ipcRenderer.invoke('extensions:activate'),
  extensionsActivityBar: () => ipcRenderer.invoke('extensions:activityBar'),
  codeDetect: () => ipcRenderer.invoke('code:detect'),
  codeLaunch: (payload) => ipcRenderer.invoke('code:launch', payload),
  extensionHostEnsure: () => ipcRenderer.invoke('extensionHost:ensure'),
  extensionHostStart: (payload) => ipcRenderer.invoke('extensionHost:start', payload),
  extensionHostStatus: () => ipcRenderer.invoke('extensionHost:status'),
  extensionHostStop: () => ipcRenderer.invoke('extensionHost:stop'),
  extensionHostRunCommand: (payload) => ipcRenderer.invoke('extensionHost:runCommand', payload),
  extensionHostEmbed: (payload) => ipcRenderer.invoke('extensionHost:embed', payload),
  extensionHostLayout: (payload) => ipcRenderer.invoke('extensionHost:layout', payload),
  extensionHostHide: () => ipcRenderer.invoke('extensionHost:hide'),
  openUrl: (url) => ipcRenderer.invoke('app:openUrl', url),
  clipboardWriteText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  clipboardReadText: () => ipcRenderer.invoke('clipboard:readText'),
  clipboardWriteImage: (dataUrl) => ipcRenderer.invoke('clipboard:writeImage', dataUrl),
  clipboardReadImage: () => ipcRenderer.invoke('clipboard:readImage'),
  saveDataUrl: (payload) => ipcRenderer.invoke('file:saveDataUrl', payload),
  editorAiComplete: (payload) => ipcRenderer.invoke('editor:ai', payload),
  setupStatus: () => ipcRenderer.invoke('setup:status'),
  agentIsRunning: () => ipcRenderer.invoke('agent:isRunning'),
  fetchModels: () => ipcRenderer.invoke('agent:models'),
  pickFiles: () => ipcRenderer.invoke('files:pickAttach'),
  pickFolderAttach: () => ipcRenderer.invoke('folder:pickAttach'),
  testHubChat: (payload) => ipcRenderer.invoke('testhub:chat', payload),
  testHubStream: (payload) => ipcRenderer.invoke('testhub:stream', payload),
  onTestHubChunk: (fn) => {
    const listen = (_e, data) => fn(data)
    ipcRenderer.on('testhub:chunk', listen)
    return () => ipcRenderer.removeListener('testhub:chunk', listen)
  },
  testHubLoadSession: () => ipcRenderer.invoke('testhub:session:load'),
  testHubSaveSession: (payload) => ipcRenderer.invoke('testhub:session:save', payload),
  testHubListArchives: () => ipcRenderer.invoke('testhub:archives:list'),
  testHubSaveArchive: (payload) => ipcRenderer.invoke('testhub:archives:save', payload),
  testHubLoadArchive: (id) => ipcRenderer.invoke('testhub:archives:load', id),
  testHubExportZip: (payload) => ipcRenderer.invoke('testhub:export:zip', payload),
  testHubExportFolder: (payload) => ipcRenderer.invoke('testhub:export:folder', payload),
  testHubRunViteSandbox: (payload) => ipcRenderer.invoke('testhub:sandbox:vite', payload),
  testHubSaveBenchmark: (payload) => ipcRenderer.invoke('testhub:benchmark:save', payload),
  testHubListBenchmarks: (payload) => ipcRenderer.invoke('testhub:benchmarks:list', payload),
  testHubBenchmarkSummary: () => ipcRenderer.invoke('testhub:benchmarks:summary'),
  testHubPublish: (payload) => ipcRenderer.invoke('testhub:publish', payload),
  testHubListDeploys: (payload) => ipcRenderer.invoke('testhub:deploys:list', payload),
  testHubDeleteDeploy: (payload) => ipcRenderer.invoke('testhub:deploys:delete', payload),
  studySavePdf: (payload) => ipcRenderer.invoke('study:savePdf', payload),
  fetchProfile: () => ipcRenderer.invoke('profile:load'),
  fetchAvatarDataUrl: () => ipcRenderer.invoke('profile:avatar'),
  uploadProfileAvatar: () => ipcRenderer.invoke('profile:uploadAvatar'),
  fetchPlatformProviders: () => ipcRenderer.invoke('agent:platform-providers'),
  fetchAccountSummary: () => ipcRenderer.invoke('account:summary'),
  speechTranscribe,
  appInfo: () => ipcRenderer.invoke('app:info'),
  listProviderKeys: () => ipcRenderer.invoke('keys:list'),
  saveProviderKey: (provider, key) => ipcRenderer.invoke('keys:save', { provider, key }),
  deleteProviderKey: (provider) => ipcRenderer.invoke('keys:delete', provider),
  onAgentEvent: (fn) => {
    const listen = (_event, data) => fn(data)
    ipcRenderer.on('agent:event', listen)
    return () => ipcRenderer.removeListener('agent:event', listen)
  },
  onAgentFileChanged: (fn) => {
    const listen = (_event, data) => fn(data)
    ipcRenderer.on('agent:file-changed', listen)
    return () => ipcRenderer.removeListener('agent:file-changed', listen)
  },
  openBilling: () => ipcRenderer.invoke('billing:open'),
  openDashboard: () => ipcRenderer.invoke('dashboard:open'),
  openGithub: () => ipcRenderer.invoke('github:open'),
  connectorsList: () => ipcRenderer.invoke('connectors:list'),
  connectorsMarketplace: (query) => ipcRenderer.invoke('connectors:marketplace', query),
  connectorsAdd: (payload) => ipcRenderer.invoke('connectors:add', payload),
  connectorsConnect: (id) => ipcRenderer.invoke('connectors:connect', id),
  connectorsOauth: (payload) => ipcRenderer.invoke('connectors:oauth', payload),
  termCreate: (opts) => ipcRenderer.invoke('term:create', opts),
  termListLive: (opts) => ipcRenderer.invoke('term:list-live', opts),
  termStart: (cwd) => ipcRenderer.invoke('term:start', cwd),
  termWrite: (payload) => ipcRenderer.invoke('term:write', payload),
  termBindCwd: (payload) => ipcRenderer.invoke('term:bind-cwd', payload),
  termResize: (payload) => ipcRenderer.invoke('term:resize', payload),
  termKill: (id) => ipcRenderer.invoke('term:kill', id),
  termMeta: () => ipcRenderer.invoke('term:meta'),
  onTerm: (fn) => {
    const listen = (_e, data) => fn(data)
    ipcRenderer.on('term:data', listen)
    return () => ipcRenderer.removeListener('term:data', listen)
  },
  onTermExit: (fn) => {
    const listen = (_e, data) => fn(data)
    ipcRenderer.on('term:exit', listen)
    return () => ipcRenderer.removeListener('term:exit', listen)
  },
  onTermRunRequest: (fn) => {
    const listen = (_e, data) => fn(data)
    ipcRenderer.on('term:run-request', listen)
    return () => ipcRenderer.removeListener('term:run-request', listen)
  },
  onTermMirror: (fn) => {
    const listen = (_e, data) => fn(data)
    ipcRenderer.on('term:mirror', listen)
    return () => ipcRenderer.removeListener('term:mirror', listen)
  },
  onDevReload: (fn) => {
    const listen = () => fn()
    ipcRenderer.on('dev:reload', listen)
    return () => ipcRenderer.removeListener('dev:reload', listen)
  },
  onExtensionsScopeChanged: (fn) => {
    const listen = (_e, data) => fn(data)
    ipcRenderer.on('extensions:scope-changed', listen)
    return () => ipcRenderer.removeListener('extensions:scope-changed', listen)
  },
  onExtensionHostUiReady: (fn) => {
    const listen = () => fn()
    ipcRenderer.on('extension-host:ui-ready', listen)
    return () => ipcRenderer.removeListener('extension-host:ui-ready', listen)
  },
})
