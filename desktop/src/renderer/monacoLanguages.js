/**
 * Monaco TypeScript/JavaScript language service — diagnostics, hover, go-to-definition.
 */
;(function initSoumtokMonacoLanguages() {
  let configured = false

  function compilerOptions(monaco) {
    return {
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      allowJs: true,
      checkJs: false,
      strict: false,
    }
  }

  function configure(monaco, opts = {}) {
    if (configured || !monaco?.languages?.typescript) return
    configured = true
    const ts = monaco.languages.typescript
    const comp = compilerOptions(monaco)
    ts.typescriptDefaults.setCompilerOptions(comp)
    ts.javascriptDefaults.setCompilerOptions({ ...comp, allowJs: true })
    ts.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
    })
    ts.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      noSuggestionDiagnostics: false,
    })
    ts.typescriptDefaults.setEagerModelSync(true)
    ts.javascriptDefaults.setEagerModelSync(true)

    const root = String(opts.workspaceRoot || '').replace(/\\/g, '/')
    if (root && window.soumtok?.readFile) {
      void applyWorkspaceTsconfig(monaco, root)
    }
  }

  async function applyWorkspaceTsconfig(monaco, root) {
    const tsconfigPath = `${String(root || '').replace(/\/$/, '')}/tsconfig.json`
    try {
      const text = await window.soumtok.readFile(tsconfigPath)
      if (!text || !String(text).trim()) return
      const json = JSON.parse(text)
      const co = json.compilerOptions || {}
      const ts = monaco.languages.typescript
      const base = compilerOptions(monaco)
      const merged = {
        ...base,
        ...(co.target != null ? { target: co.target } : {}),
        ...(co.module != null ? { module: co.module } : {}),
        ...(co.strict != null ? { strict: co.strict } : {}),
        ...(co.jsx != null ? { jsx: co.jsx } : {}),
        ...(co.allowJs != null ? { allowJs: co.allowJs } : {}),
        ...(co.checkJs != null ? { checkJs: co.checkJs } : {}),
      }
      ts.typescriptDefaults.setCompilerOptions(merged)
      ts.javascriptDefaults.setCompilerOptions({ ...merged, allowJs: true })
    } catch {
      /* no tsconfig or invalid JSON */
    }
  }

  window.SoumtokMonacoLanguages = { configure, applyWorkspaceTsconfig }
})()
