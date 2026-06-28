import { Sprout } from 'lucide-react'

export default function Empty({ label = '这里还没有内容' }: { label?: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--campus-border)] bg-white/70 p-8 text-center text-sm text-slate-500">
      <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
        <Sprout className="size-5" />
      </div>
      <div className="font-semibold text-slate-700">{label}</div>
    </div>
  )
}
