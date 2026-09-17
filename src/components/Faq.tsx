import { FAQ } from '../../shared/seo'

export function Faq() {
  return (
    <section id="faq" className="py-16 sm:py-20">
      <div className="page-wrap">
        <h2 className="max-w-[640px] text-[26px] font-semibold tracking-[-0.03em] sm:text-[32px] md:text-[40px]">
          Cheap. Powerful. Africa’s #1 coding platform.
        </h2>
        <p className="mt-4 max-w-[520px] text-[15px] leading-7 text-white/50">
          Start coding from $5 a month. The searches people actually type — answered straight.
        </p>
        <dl className="mt-10 divide-y divide-white/[0.06] border-y border-white/[0.06]">
          {FAQ.map((item) => (
            <div key={item.q} className="grid gap-3 py-6 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] md:gap-12">
              <dt className="text-[16px] font-medium leading-6 tracking-[-0.02em]">{item.q}</dt>
              <dd className="text-[15px] leading-7 text-white/55">{item.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
