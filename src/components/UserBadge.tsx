'use client'

import { useAppStore } from '@/lib/store'
import type { Owner } from '@/lib/supabase'

const USER_CONFIG: Record<Owner, { emoji: string; color: string; label: string }> = {
  Simon: { emoji: '🟦', color: 'bg-simon', label: 'Simon' },
  Paul:  { emoji: '🟧', color: 'bg-paul',  label: 'Paul'  },
}

interface UserBadgeProps {
  onSwitchRequest?: () => void
}

export function UserBadge({ onSwitchRequest }: UserBadgeProps) {
  const { currentUser, setUser } = useAppStore()

  if (!currentUser) return null

  const cfg = USER_CONFIG[currentUser]

  const handleSwitch = () => {
    if (onSwitchRequest) {
      onSwitchRequest()
    } else {
      // Simple toggle
      setUser(currentUser === 'Simon' ? 'Paul' : 'Simon')
    }
  }

  return (
    <button
      onClick={handleSwitch}
      className="flex items-center gap-1.5 bg-white/10 text-white text-sm font-semibold
                 px-3 py-1.5 rounded-full active:bg-white/20 transition-colors"
    >
      <span>{cfg.emoji}</span>
      <span>{cfg.label}</span>
    </button>
  )
}

export function UserSwitcherSheet({
  onClose,
}: {
  onClose: () => void
}) {
  const { setUser, currentUser } = useAppStore()

  const pick = (user: Owner) => {
    setUser(user)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-3xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-6" />
        <p className="text-center text-gray-500 text-sm mb-4">Cambiar usuario</p>

        <div className="flex flex-col gap-3">
          {(['Simon', 'Paul'] as Owner[]).map((user) => (
            <button
              key={user}
              onClick={() => pick(user)}
              className={`w-full py-4 rounded-2xl font-bold text-lg flex items-center justify-center gap-2
                text-white active:scale-95 transition-transform
                ${user === 'Simon' ? 'bg-simon' : 'bg-paul'}
                ${currentUser === user ? 'ring-4 ring-offset-2 ring-gray-300' : ''}
              `}
            >
              {user === 'Simon' ? '🟦' : '🟧'} {user}
              {currentUser === user && <span className="text-sm opacity-80 ml-1">(activo)</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
