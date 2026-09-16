/**
 * Explorer icons — Material Icon Theme SVGs (same family as VS Code / Cursor).
 */
;(function () {
  const ICON_ROOT = '../../resources/file-icons/'

  /** @type {Record<string, string>} */
  const FOLDER_BY_NAME = {
    node_modules: 'folder-node',
    '.git': 'folder-node',
    src: 'folder-src',
    source: 'folder-src',
    sources: 'folder-src',
    lib: 'folder-src',
    dist: 'folder-dist',
    build: 'folder-dist',
    out: 'folder-dist',
    '.next': 'folder-dist',
    output: 'folder-dist',
    docs: 'folder-docs',
    doc: 'folder-docs',
    documentation: 'folder-docs',
    public: 'folder-public',
    static: 'folder-public',
    assets: 'folder-public',
    test: 'folder-test',
    tests: 'folder-test',
    '__tests__': 'folder-test',
    testing: 'folder-test',
    '.github': 'folder-github',
    apps: 'folder-app',
    app: 'folder-app',
    packages: 'folder-packages',
    package: 'folder-packages',
    scripts: 'folder-scripts',
    firebase: 'folder-firebase',
    '.vscode': 'folder-vscode',
    '.cursor': 'folder-vscode',
    server: 'folder-server',
    api: 'folder-server',
    backend: 'folder-server',
    components: 'folder-components',
    desktop: 'folder-vscode',
    '.agents': 'folder-vscode',
    '.soumtok': 'folder-vscode',
    netlify: 'folder-public',
    shared: 'folder-src',
    web: 'folder-public',
  }

  function extOf(name) {
    const i = name.lastIndexOf('.')
    if (i <= 0) return ''
    return name.slice(i).toLowerCase()
  }

  function stemOf(name) {
    const i = name.lastIndexOf('.')
    return (i > 0 ? name.slice(0, i) : name).toLowerCase()
  }

  function folderIconFile(name, open) {
    const key = FOLDER_BY_NAME[name.toLowerCase()]
    if (key) return `${key}.svg`
    return open ? 'folder-open.svg' : 'folder.svg'
  }

  function fileIconFile(name) {
    const base = name.toLowerCase()
    const ext = extOf(base)
    const stem = stemOf(base)

    if (base === 'package.json' || base === 'package-lock.json') return 'nodejs.svg'
    if (base.startsWith('tsconfig') || base.endsWith('.d.ts')) return 'typescript-def.svg'
    if (base === 'readme.md' || base === 'readme') return 'readme.svg'
    if (base.endsWith('.md') || base.endsWith('.mdx')) return 'markdown.svg'
    if (base === '.gitignore' || base === '.gitattributes' || base === '.gitmodules') return 'git.svg'
    if (base === '.dockerignore' || base === 'dockerfile' || base.startsWith('docker-compose')) return 'docker.svg'
    if (base.includes('firebase') && ext === '.json') return 'firebase.svg'
    if (base === 'netlify.toml') return 'netlify.svg'
    if (base === 'railway.toml' || base === 'railway.json') return 'settings.svg'
    if (typeof window.SoumtokEnvEditor?.isDotEnvFileName === 'function' && window.SoumtokEnvEditor.isDotEnvFileName(base)) {
      return 'settings.svg'
    }
    if (ext === '.json') return 'json.svg'
    if (ext === '.toml') return 'toml.svg'
    if (ext === '.yaml' || ext === '.yml') return 'yaml.svg'
    if (ext === '.tsx') return 'react_ts.svg'
    if (ext === '.jsx') return 'react.svg'
    if (ext === '.ts' || ext === '.mts' || ext === '.cts') return 'typescript.svg'
    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript.svg'
    if (ext === '.html' || ext === '.htm') return 'html.svg'
    if (ext === '.css' || ext === '.scss' || ext === '.sass' || ext === '.less') return 'css.svg'
    if (/\.(png|jpe?g|gif|webp|ico|bmp|avif)$/.test(base)) return 'image.svg'
    if (ext === '.svg') return 'svg.svg'
    if (ext === '.xml') return 'xml.svg'
    if (ext === '.py') return 'python.svg'
    if (stem === 'vite.config' || base.startsWith('vite.config.')) return 'vite.svg'
    if (stem.includes('eslint') || base.startsWith('.eslint')) return 'eslint.svg'
    if (stem.includes('prettier') || base.startsWith('.prettier')) return 'prettier.svg'
    if (base.endsWith('.lock') || base === 'pnpm-lock.yaml') return 'lock.svg'
    if (base === '.editorconfig') return 'editorconfig.svg'
    if (ext === '.wasm') return 'file.svg'
    if (stem.includes('webpack')) return 'webpack.svg'
    if (base === 'pnpm-workspace.yaml') return 'pnpm.svg'
    if (base.startsWith('.npmrc')) return 'npm.svg'
    return 'file.svg'
  }

  function iconUrl(file) {
    return `${ICON_ROOT}${file}`
  }

  /**
   * @param {{ type: string, name: string }} node
   * @param {boolean} [open]
   */
  function createTreeIconEl(node, open) {
    const el = document.createElement('span')
    el.className = 'tree-icon'
    const img = document.createElement('img')
    img.className = 'tree-icon-img'
    img.alt = ''
    img.draggable = false
    img.width = 16
    img.height = 16
    const file =
      node.type === 'dir' ? folderIconFile(node.name, Boolean(open)) : fileIconFile(node.name)
    img.src = iconUrl(file)
    img.onerror = () => {
      img.onerror = null
      img.src = iconUrl(node.type === 'dir' ? 'folder.svg' : 'file.svg')
    }
    el.appendChild(img)
    return el
  }

  window.SoumtokFileIcons = {
    createTreeIconEl,
    iconUrl,
    folderIconFile,
    fileIconFile,
  }
})()
