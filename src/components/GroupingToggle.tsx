'use client'

import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'

export function GroupingToggle({ className }: { className?: string }) {
  const { groupingMode, setGroupingMode } = useAppStore()

  return (
    <div className={cn(
      'flex bg-white/10 rounded-lg p-0.5 text-[11px] font-semibold shrink-0',
      className
    )}>
      <button
        onClick={() => setGroupingMode('wc_group')}
        className={cn(
          'px-2.5 py-1 rounded-md transition-all whitespace-nowrap',
          groupingMode === 'wc_group'
            ? 'bg-white text-primary shadow-sm'
            : 'text-white/70 active:text-white'
        )}
      >
        Grupos
      </button>
      <button
        onClick={() => setGroupingMode('confederation')}
        className={cn(
          'px-2.5 py-1 rounded-md transition-all whitespace-nowrap',
          groupingMode === 'confederation'
            ? 'bg-white text-primary shadow-sm'
            : 'text-white/70 active:text-white'
        )}
      >
        Confed.
      </button>
    </div>
  )
}
