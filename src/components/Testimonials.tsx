const desks = [
  {
    title: 'Students and weekend builders',
    body: 'Start on Trial with DeepSeek and Gemma. Finish a school project without five provider dashboards.',
  },
  {
    title: 'Shops that ship on GitHub',
    body: 'Attach a repo, ask Studio to plan or patch, and keep GitHub as the source of truth.',
  },
  {
    title: 'Teams that pay here',
    body: 'Pro and Team seats, usage you can see, and checkout in KES on M-Pesa or USD on PayPal.',
  },
]

export function Testimonials() {
  return (
    <section className="py-20">
      <div className="page-wrap">
        <h2 className="text-center text-[28px] font-semibold tracking-[-0.03em] sm:text-[36px] md:text-[44px]">
          Built for the desks that stay late.
        </h2>
        <p className="mx-auto mt-4 max-w-[520px] text-center text-[16px] leading-7 text-white/50">
          Soumtok is a Studio, not a second git host and not a video lab. Chat, models, and GitHub
          in one place.
        </p>
        <div className="mt-12 grid gap-3 md:grid-cols-3">
          {desks.map((desk) => (
            <article key={desk.title} className="quote-card">
              <p className="text-[16px] font-medium">{desk.title}</p>
              <p className="mt-3 text-[15px] leading-7 text-white/60">{desk.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
