export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <span className={`loader-ring ${className}`} aria-hidden />
}

export function AuthOverlay({ title = 'Signing you in' }: { title?: string; detail?: string }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[80]" role="status" aria-live="polite">
      <div className="loader-bar" />
      <span className="sr-only">{title}</span>
    </div>
  )
}

export function Bone({ className = '', light = false }: { className?: string; light?: boolean }) {
  return <div className={`${light ? 'skeleton-bone-light' : 'skeleton-bone'} ${className}`} />
}

export function PageSkeleton() {
  return (
    <div className="theme-app min-h-svh bg-[#0b0b0a] text-white">
      <div className="loader-bar" />
      <div className="border-b border-white/5">
        <div className="page-wrap flex h-[64px] items-center justify-between">
          <Bone className="h-8 w-28 rounded-md" />
          <div className="hidden gap-4 lg:flex">
            <Bone className="h-3 w-14 rounded-full" />
            <Bone className="h-3 w-16 rounded-full" />
            <Bone className="h-3 w-20 rounded-full" />
            <Bone className="h-3 w-14 rounded-full" />
          </div>
          <div className="flex gap-3">
            <Bone className="h-8 w-16 rounded-full" />
            <Bone className="h-8 w-24 rounded-full" />
          </div>
        </div>
      </div>
      <div className="page-wrap pt-16">
        <Bone className="h-12 w-[min(560px,90%)] rounded-lg" />
        <Bone className="mt-4 h-12 w-[min(420px,70%)] rounded-lg" />
        <div className="mt-8 flex gap-3">
          <Bone className="h-11 w-44 rounded-full" />
          <Bone className="h-11 w-36 rounded-full" />
        </div>
        <Bone className="mt-14 h-[380px] w-full rounded-2xl" />
      </div>
    </div>
  )
}

export function LoginSkeleton() {
  return (
    <div className="theme-app grid min-h-svh place-items-center bg-[#0b0b0a] px-6">
      <div className="w-full max-w-[400px]">
        <Bone className="mx-auto h-10 w-72 rounded-lg" />
        <Bone className="mx-auto mt-4 h-4 w-40 rounded-full" />
        <Bone className="mt-10 h-12 w-full rounded-lg" />
        <Bone className="mx-auto mt-6 h-3 w-10 rounded-full" />
        <Bone className="mt-6 h-12 w-full rounded-lg" />
        <Bone className="mt-4 h-12 w-full rounded-lg" />
      </div>
    </div>
  )
}

export function AccountSkeleton() {
  return (
    <div className="mt-6 space-y-3">
      <Bone className="h-11 w-full rounded-xl" />
      <Bone className="h-20 w-full rounded-xl" />
      <Bone className="h-11 w-36 rounded-full" />
      <Bone className="h-16 w-full rounded-xl" />
      <Bone className="h-16 w-full rounded-xl" />
    </div>
  )
}
