import { cn } from '@/lib/utils'

interface ProgressBarProps {
  value: number
  max: number
  className?: string
  color?: string
}

export function ProgressBar({ value, max, className, color = '#953A67' }: ProgressBarProps) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div className={cn('w-full bg-gray-100 rounded-full h-2 overflow-hidden', className)}>
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}
