'use client'

import { useAppStore } from '@/lib/store'
import { PasscodeGate } from '@/components/PasscodeGate'
import { BottomNav } from '@/components/BottomNav'

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, currentUser } = useAppStore()

  if (!isAuthenticated || !currentUser) {
    return <PasscodeGate />
  }

  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1 pb-20">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
