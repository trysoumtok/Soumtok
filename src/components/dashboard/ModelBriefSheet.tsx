import { useEffect, type CSSProperties, type ReactNode } from 'react'
import { buildModelStudy, type ModelBrief } from '../../../shared/modelBrief'
import { studyImageSrc } from '../../../shared/modelStudyDossier'
import type { CodingModel } from '../../../shared/models'

import { BRAND_LOCKUP_DARK, BRAND_MARK_DARK } from '../../../shared/brandAssets.ts'

const LOCKUP = BRAND_LOCKUP_DARK
const MARK = BRAND_MARK_DARK

async function saveStudyPdf(study: ModelBrief) {
  const article = document.getElementById('model-brief-print')
  const html = article?.outerHTML || ''
  const title = `${study.name} — Soumtok Study`
  const api = (window as unknown as {
    soumtok?: {
      studySavePdf?: (p: { title: string; html: string }) => Promise<{ path?: string; error?: string }>
      showItemInFolder?: (p: string) => void
    }
  }).soumtok
  if (api?.studySavePdf && html) {
    const res = await api.studySavePdf({ title, html })
    if (res?.error) {
      window.alert?.(res.error)
      return
    }
    if (res?.path) api.showItemInFolder?.(res.path)
    return
  }
  if (!article) return
  const printWin = window.open('', '_blank', 'noopener,noreferrer')
  if (!printWin) return
  printWin.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<base href="${window.location.origin}/">
<style>
  body{margin:0;background:#f3ece0;font-family:ui-sans-serif,system-ui,sans-serif;color:#161412}
  img{max-width:100%;height:auto}
  article{background:#f3ece0}
  header{break-after:page;page-break-after:always}
</style></head><body>${html}</body></html>`)
  printWin.document.close()
  printWin.onload = () => {
    printWin.focus()
    printWin.print()
    printWin.close()
  }
}

export function ModelBriefSheet({ model, onClose }: { model: CodingModel | null; onClose: () => void }) {
  const study = model ? buildModelStudy(model) : null

  useEffect(() => {
    if (!study) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [study, onClose])

  if (!study) return null

  return (
    <div className="fixed inset-0 z-[15000] flex flex-col items-center bg-black/80 p-3 sm:p-5" onClick={onClose}>
      <div className="mb-3 flex w-full max-w-[920px] items-center justify-between gap-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-[12px] text-white/55">Model Study · {study.name}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void saveStudyPdf(study)}
            className="rounded-lg bg-[#f54e00] px-3 py-1.5 text-[12px] font-semibold text-white"
          >
            Download PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-[12px] text-white"
          >
            Close
          </button>
        </div>
      </div>
      <div className="min-h-0 w-full max-w-[920px] flex-1 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <StudyDocument study={study} />
      </div>
    </div>
  )
}

function StudyDocument({ study }: { study: ModelBrief }) {
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
  return (
    <article id="model-brief-print" className="overflow-hidden rounded-sm bg-[#f3ece0] text-[#161412] shadow-2xl">
      <Cover study={study} />
      <div className="px-8 py-10 sm:px-12">
        <p className="max-w-[62ch] text-[17px] leading-[1.7] text-[#2a2622]">{study.hero}</p>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {study.stats.map((s) => (
            <div key={s.label} className="rounded-xl border border-[#e4d9c8] bg-[#fffaf3] px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#f54e00]">{s.hint}</p>
              <p className="mt-1 text-[20px] font-semibold tracking-tight">{s.value}</p>
              <p className="text-[11px] text-[#6b645c]">{s.label}</p>
            </div>
          ))}
        </div>

        <SectionEyebrow n="Gallery">Images — official plates and what it does</SectionEyebrow>
        <div className="grid gap-4 sm:grid-cols-2">
          {study.gallery.map((g) => (
            <figure key={g.file} className="overflow-hidden rounded-2xl border border-[#e4d9c8] bg-[#fffaf3]">
              <img src={studyImageSrc(g.file)} alt={g.caption} className="w-full object-cover" />
              <figcaption className="px-3 py-2.5 text-[12px] leading-5 text-[#3d3832]">
                {g.caption}
                <span className="mt-1 block text-[10px] uppercase tracking-wide text-[#8a8176]">{g.credit}</span>
              </figcaption>
            </figure>
          ))}
        </div>

        <SectionEyebrow n="Record">Official envelope</SectionEyebrow>
        <SpecTable specs={study.official} />
        <p className="mt-3 max-w-[66ch] text-[13px] leading-relaxed text-[#5c564e]">{study.benchmarkNote}</p>

        <SectionEyebrow n="Exams">Published scores</SectionEyebrow>
        <p className="mb-3 text-[14px] font-semibold">{study.benchmarkTitle}</p>
        <DataTable headers={study.benchmarkHeaders} rows={study.benchmarkRows} />

        <SectionEyebrow n="Reviews">What people wrote</SectionEyebrow>
        <div className="space-y-4">
          {study.reviews.map((r) => (
            <blockquote key={r.source} className="rounded-2xl border border-[#e4d9c8] bg-[#fffaf3] px-5 py-4">
              <p className="text-[14px] leading-relaxed text-[#2a2622]">“{r.quote}”</p>
              <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#f54e00]">{r.source}</p>
            </blockquote>
          ))}
        </div>

        <SectionEyebrow n="Sources">Read the primary pages</SectionEyebrow>
        <ul className="space-y-2 text-[14px]">
          {study.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className="font-medium text-[#b33c00] underline decoration-[#e4d9c8] underline-offset-4">
                {s.label}
              </a>
              <span className="ml-2 break-all text-[11px] text-[#8a8176]">{s.url}</span>
            </li>
          ))}
        </ul>

        <Toc chapters={study.chapters} />

        <SectionEyebrow n="Specs">Operating envelope</SectionEyebrow>
        <SpecTable specs={study.specs} />

        <SectionEyebrow n="Charts">Working profile</SectionEyebrow>
        <p className="mb-4 max-w-[62ch] text-[14px] leading-relaxed text-[#3d3832]">
          These bars are a builder’s grade for picking a classroom — not a vendor press chart. 100 is “this is why the
          model exists.” Low is “wrong exam.”
        </p>
        <div className="space-y-3 rounded-2xl border border-[#e4d9c8] bg-[#fffaf3] p-5">
          {study.scores.map((row) => (
            <Bar key={row.label} row={row} />
          ))}
        </div>

        {study.chapters.slice(0, 5).map((ch) => (
          <Chapter key={ch.n} ch={ch} />
        ))}

        <SectionEyebrow n="Lineup">Family comparison</SectionEyebrow>
        <DataTable headers={study.comparisonHeaders} rows={study.comparisonRows} />
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {study.family.slice(0, 6).map((m) => (
            <div key={m.name} className="rounded-xl border border-[#e4d9c8] bg-[#fffaf3] p-4">
              <p className="text-[13px] font-semibold">{m.name}</p>
              <p className="mt-1 text-[12px] leading-5 text-[#5c564e]">{m.role}</p>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#f54e00]">{m.cost}</p>
            </div>
          ))}
        </div>

        <SectionEyebrow n="Syllabus">Workload classroom</SectionEyebrow>
        <WorkloadTable rows={study.workloads} />

        {study.chapters.slice(5).map((ch) => (
          <Chapter key={ch.n} ch={ch} />
        ))}

        <SectionEyebrow n="Timeline">How this line arrived</SectionEyebrow>
        <ol className="relative space-y-0 border-l-2 border-[#f54e00] pl-6">
          {study.timeline.map((ev) => (
            <li key={ev.title} className="pb-6">
              <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-[#f54e00]" />
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#f54e00]">{ev.when}</p>
              <p className="mt-1 text-[16px] font-semibold">{ev.title}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-[#3d3832]">{ev.body}</p>
            </li>
          ))}
        </ol>

        <SectionEyebrow n="Labs">Hands-on labs</SectionEyebrow>
        <div className="grid gap-3 sm:grid-cols-2">
          {study.classroom.map((lab) => (
            <div key={lab.title} className="rounded-2xl border border-[#e4d9c8] bg-[#fffaf3] p-5">
              <p className="text-[13px] font-bold text-[#f54e00]">{lab.title}</p>
              <p className="mt-2 text-[14px] leading-relaxed text-[#3d3832]">{lab.body}</p>
            </div>
          ))}
        </div>

        <SectionEyebrow n="FAQ">Questions from the picker</SectionEyebrow>
        <div className="space-y-4">
          {study.faq.map((item) => (
            <div key={item.q} className="border-b border-[#e4d9c8] pb-4">
              <p className="text-[15px] font-semibold">{item.q}</p>
              <p className="mt-1 text-[14px] leading-relaxed text-[#3d3832]">{item.a}</p>
            </div>
          ))}
        </div>

        <SectionEyebrow n="Glossary">Words this study uses</SectionEyebrow>
        <div className="overflow-hidden rounded-xl border border-[#e4d9c8]">
          {study.glossary.map((g) => (
            <div key={g.term} className="grid grid-cols-[140px_minmax(0,1fr)] border-t border-[#e4d9c8] first:border-t-0">
              <p className="bg-[#fffaf3] px-3 py-2.5 text-[12px] font-semibold">{g.term}</p>
              <p className="px-3 py-2.5 text-[13px] leading-5 text-[#3d3832]">{g.def}</p>
            </div>
          ))}
        </div>
      </div>
      <footer className="flex items-center justify-between gap-4 border-t-2 border-[#161412] bg-[#141210] px-8 py-5 text-[11px] text-[#cbbba8] sm:px-12">
        <span className="flex items-center gap-2">
          <img src={MARK} alt="" className="h-5 w-5 object-contain" />
          Model Study · {study.name}
        </span>
        <span>Powered by Soumtok · soumtok.com · {date}</span>
      </footer>
    </article>
  )
}

function Cover({ study }: { study: ModelBrief }) {
  return (
    <header className="relative flex min-h-[min(920px,100vh)] flex-col justify-between overflow-hidden bg-[#141210] px-10 py-10 text-[#f3ece0] sm:px-14 sm:py-12">
      <div className="absolute inset-y-0 right-0 w-2 bg-[#f54e00]" />
      <div className="flex items-center justify-between gap-4">
        <img src={LOCKUP} alt="Soumtok" className="h-7 w-auto brightness-0 invert" />
        <p className="text-[11px] font-semibold tracking-wide text-[#cbbba8]">Powered by Soumtok</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center py-16 text-center">
        <div className="grid h-24 w-24 place-items-center rounded-3xl bg-[#f3ece0]">
          <img src={study.providerLogo} alt={study.providerLabel} className="h-14 w-14 object-contain" />
        </div>
        <p className="mt-8 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#f54e00]">{study.providerLabel}</p>
        <h1 className="mt-3 max-w-[18ch] text-[44px] font-semibold leading-[1.05] tracking-tight sm:text-[56px]">{study.name}</h1>
        <p className="mt-4 text-[16px] text-[#d8cfc3]">{study.coverLine}</p>
        {study.pricing.vendor ? (
          <p className="mt-3 text-[15px] font-medium text-[#f3ece0]">{study.pricing.headline} / 1M tokens</p>
        ) : null}
        <p className="mt-6 text-[12px] text-[#8a8176]">
          {study.generation} · {study.launched}
        </p>
      </div>
      <div className="flex items-end justify-between gap-4 text-[11px] text-[#8a8176]">
        <span>soumtok.com</span>
        <span>{study.id}</span>
      </div>
    </header>
  )
}

function Toc({ chapters }: { chapters: ModelBrief['chapters'] }) {
  return (
    <div className="mt-10 rounded-2xl border border-[#e4d9c8] bg-[#fffaf3] p-6">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#f54e00]">Contents</p>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {chapters.map((ch) => (
          <li key={ch.n} className="flex gap-3 text-[13px]">
            <span className="font-mono text-[11px] text-[#f54e00]">{ch.n}</span>
            <span>{ch.title}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function SectionEyebrow({ n, children }: { n: string; children: ReactNode }) {
  return (
    <div className="mb-4 mt-12 flex items-baseline justify-between gap-4 border-t border-[#e4d9c8] pt-8">
      <h2 className="text-[22px] font-semibold tracking-tight">{children}</h2>
      <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#f54e00]">{n}</span>
    </div>
  )
}

function Chapter({ ch }: { ch: ModelBrief['chapters'][number] }) {
  return (
    <section className="mt-10">
      <p className="font-mono text-[11px] text-[#f54e00]">
        {ch.n} · {ch.kicker}
      </p>
      <h2 className="mt-1 text-[26px] font-semibold tracking-tight">{ch.title}</h2>
      <div className="mt-4 max-w-[66ch] space-y-3">
        {ch.paragraphs.map((p) => (
          <p key={p.slice(0, 48)} className="text-[15px] leading-[1.75] text-[#2a2622]">
            {p}
          </p>
        ))}
      </div>
      {ch.bullets && ch.bullets.length > 0 && (
        <ul className="mt-4 max-w-[66ch] list-disc space-y-1.5 pl-5 text-[14px] leading-relaxed text-[#3d3832]">
          {ch.bullets.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Bar({ row }: { row: ModelBrief['scores'][number] }) {
  const style = { width: `${row.value}%` } as CSSProperties
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium">{row.label}</span>
        <span className="font-mono text-[12px] text-[#f54e00]">{row.value}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#e4d9c8]">
        <div className="h-full rounded-full bg-[#f54e00]" style={style} />
      </div>
      <p className="mt-1 text-[11px] text-[#6b645c]">{row.note}</p>
    </div>
  )
}

function SpecTable({ specs }: { specs: ModelBrief['specs'] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#e4d9c8]">
      <table className="w-full text-left text-[13px]">
        <tbody>
          {specs.map((s) => (
            <tr key={s.label} className="border-t border-[#e4d9c8] first:border-t-0 even:bg-[#fffaf3]">
              <th className="w-[34%] px-3 py-2.5 font-semibold text-[#5c564e]">{s.label}</th>
              <td className="px-3 py-2.5">{s.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DataTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e4d9c8]">
      <table className="w-full min-w-[520px] text-left text-[12px]">
        <thead className="bg-[#141210] text-[#f3ece0]">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r[0]} className="border-t border-[#e4d9c8] even:bg-[#fffaf3]">
              {r.map((c, i) => (
                <td key={`${r[0]}-${i}`} className={`px-3 py-2.5 ${i === 0 ? 'font-semibold' : 'text-[#3d3832]'}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WorkloadTable({ rows }: { rows: ModelBrief['workloads'] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#e4d9c8]">
      <table className="w-full min-w-[560px] text-left text-[12px]">
        <thead className="bg-[#141210] text-[#f3ece0]">
          <tr>
            <th className="px-3 py-2.5">Assignment</th>
            <th className="px-3 py-2.5">Fit</th>
            <th className="px-3 py-2.5">Grade</th>
            <th className="px-3 py-2.5">Notes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.task} className="border-t border-[#e4d9c8] even:bg-[#fffaf3]">
              <td className="px-3 py-2.5 font-semibold">{r.task}</td>
              <td className="px-3 py-2.5">{r.fit}</td>
              <td className="px-3 py-2.5 font-mono text-[#f54e00]">{r.score}</td>
              <td className="px-3 py-2.5 text-[#3d3832]">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
