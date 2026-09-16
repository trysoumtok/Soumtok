import { buildPreviewHtml, extractBuildArtifacts } from './testHub.ts'

export type CompareRunStats = {
  model: string
  modelName?: string
  text?: string
  ms?: number
  status?: string
  error?: string
  previewErrors?: number
  viteBuildOk?: boolean | null
}

export function looksLikeViteProject(files: Record<string, string>) {
  const pkgRaw = files['package.json']
  if (!pkgRaw) return false
  try {
    const pkg = JSON.parse(pkgRaw) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
    const scripts = Object.values(pkg.scripts || {}).join(' ')
    return Boolean(deps.vite || /vite/i.test(scripts))
  } catch {
    return false
  }
}

/** Auto score 0–100 for a single compare run (heuristic, not human quality). */
export function scoreCompareRun(run: CompareRunStats) {
  if (run.status === 'error') return 0
  const files = extractBuildArtifacts(run.text || '')
  const fileCount = Object.keys(files).length
  const hasPreview = Boolean(buildPreviewHtml(files))
  let score = 0
  if (fileCount > 0) score += Math.min(30, fileCount * 10)
  if (hasPreview) score += 25
  if (run.viteBuildOk === true) score += 25
  else if (run.viteBuildOk === false) score -= 15
  score -= Math.min(30, (run.previewErrors || 0) * 10)
  if (run.ms && run.ms > 0 && run.ms < 120_000) {
    score += Math.max(0, 15 - Math.floor(run.ms / 5000))
  }
  const chars = (run.text || '').length
  if (chars > 200) score += Math.min(10, Math.floor(chars / 800))
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function rankCompareRuns(runs: CompareRunStats[]) {
  return [...runs]
    .map((run) => ({ run, score: scoreCompareRun(run) }))
    .sort((a, b) => b.score - a.score)
}

export function benchmarkPayloadFromCompare(opts: {
  prompt: string
  runs: CompareRunStats[]
  compareMode?: boolean
  viteEnabled?: boolean
}) {
  const ranked = rankCompareRuns(opts.runs)
  const winner = ranked[0]
  return {
    kind: opts.compareMode ? 'compare' : 'single',
    prompt: String(opts.prompt || '').slice(0, 4000),
    models: opts.runs.map((run) => ({
      model: run.model,
      modelName: run.modelName || run.model,
      ms: run.ms || 0,
      fileCount: Object.keys(extractBuildArtifacts(run.text || '')).length,
      previewErrors: run.previewErrors || 0,
      outputChars: (run.text || '').length,
      autoScore: scoreCompareRun(run),
      status: run.status || 'done',
      previewOk: Boolean(buildPreviewHtml(extractBuildArtifacts(run.text || ''))),
      viteBuildOk: run.viteBuildOk ?? null,
      error: run.error || null,
    })),
    winnerModel: winner?.run.model || null,
    winnerScore: winner?.score ?? null,
    meta: {
      viteEnabled: Boolean(opts.viteEnabled),
      runCount: opts.runs.length,
    },
  }
}
