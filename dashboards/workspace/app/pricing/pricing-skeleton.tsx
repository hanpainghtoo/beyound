export function PricingSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
      {[1, 2, 3, 4].map((i) => (
        <article
          key={i}
          className="relative flex h-full min-h-[500px] flex-col rounded-[32px] border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm animate-pulse"
        >
          <div className="flex-1">
            <div className="mt-2 h-8 w-2/3 rounded-lg bg-slate-100" />
            <div className="mt-4 h-4 w-full rounded bg-slate-50" />
            <div className="mt-2 h-4 w-4/5 rounded bg-slate-50" />
          </div>

          <div className="mt-6 flex flex-col">
            <div>
              <div className="h-8 w-1/2 rounded-lg bg-slate-100" />
              <div className="mt-2 h-3 w-1/3 rounded bg-slate-50" />
            </div>

            <div className="mt-8 mb-6 rounded-3xl bg-slate-50 p-5 sm:p-6 grid grid-cols-2 gap-y-5 gap-x-3">
              {[1, 2, 3, 4, 5, 6].map((j) => (
                <div key={j} className="flex items-start gap-3">
                  <div className="h-5 w-5 shrink-0 rounded-full bg-slate-200" />
                  <div className="flex flex-col min-w-0 w-full gap-1.5">
                    <div className="h-4 w-full rounded bg-slate-200" />
                    <div className="h-3 w-2/3 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 h-12 w-full rounded-2xl bg-slate-100" />
        </article>
      ))}
    </div>
  )
}
