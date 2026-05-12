'use client'

import { AppShell } from '@/components/AppShell'
import InicioInner from './_inicio'

export default function RootPage() {
  return (
    <AppShell>
      <InicioInner />
    </AppShell>
  )
}
