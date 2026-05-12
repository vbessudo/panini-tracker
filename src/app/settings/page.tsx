'use client'

import { useState } from 'react'
import { AppShell } from '@/components/AppShell'
import { useAppStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Owner } from '@/lib/supabase'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default function SettingsPage() {
  const { currentUser, setUser, logout } = useAppStore()
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetCode, setResetCode] = useState('')

  const handleSwitchUser = (user: Owner) => {
    setUser(user)
    toast(`Usuario cambiado a ${user}`)
  }

  const handleExport = async () => {
    toast('Exportando datos…')
    try {
      const [invRes, slotsRes, eventsRes] = await Promise.all([
        supabase.from('inventory').select('*').order('added_at'),
        supabase.from('album_slots').select('*').order('sticker_code'),
        supabase.from('events').select('*').order('at'),
      ])

      // Download inventory CSV
      if (invRes.data) {
        const csv = [
          ['id', 'sticker_code', 'owner', 'assignment', 'added_at', 'added_by'].join(','),
          ...invRes.data.map(r => [r.id, r.sticker_code, r.owner, r.assignment, r.added_at, r.added_by].join(',')),
        ].join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'inventory.csv'; a.click()
      }

      // Download album_slots JSON
      if (slotsRes.data) {
        const json = JSON.stringify(slotsRes.data, null, 2)
        const blob = new Blob([json], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = 'album_slots.json'; a.click()
      }

      toast.success('Datos exportados ✓')
    } catch {
      toast.error('Error al exportar')
    }
  }

  const handleResetInventory = async () => {
    await supabase.from('inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('events').insert({
      actor: currentUser,
      kind: 'move',
      payload: { action: 'vaciar_mazo', actor: currentUser },
    })
    toast('🗑 Mazo vaciado')
    setConfirmReset(false)
  }

  const handleFullReset = async () => {
    if (resetCode !== 'RESET2026') {
      toast.error('Código incorrecto. Escribí RESET2026 para confirmar.')
      return
    }
    await supabase.from('inventory').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('events').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('album_slots').update({ status: 'Falta', pegada_at: null, pegada_by: null })
      .neq('id', '00000000-0000-0000-0000-000000000000')
    toast.success('Reset total completado')
    setConfirmReset(false)
    setResetCode('')
  }

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-primary px-4 pt-safe-top pb-4 flex items-center gap-3">
          <Link href="/" className="text-white/70 active:text-white">
            <ChevronLeft size={22} />
          </Link>
          <h1 className="text-white font-bold text-lg">Configuración</h1>
        </header>

        <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
          {/* Current user */}
          <div className="card">
            <h2 className="font-bold text-gray-800 mb-3">👤 Usuario activo</h2>
            <div className="flex gap-3">
              {(['Simon', 'Paul'] as Owner[]).map(u => (
                <button
                  key={u}
                  onClick={() => handleSwitchUser(u)}
                  className={cn(
                    'flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95',
                    currentUser === u
                      ? u === 'Simon' ? 'bg-simon text-white' : 'bg-paul text-white'
                      : 'bg-gray-100 text-gray-600'
                  )}
                >
                  {u === 'Simon' ? '🟦' : '🟧'} {u}
                </button>
              ))}
            </div>
          </div>

          {/* Export */}
          <div className="card">
            <h2 className="font-bold text-gray-800 mb-1">📥 Exportar datos</h2>
            <p className="text-xs text-gray-500 mb-3">Descarga el inventario (CSV) y los slots del álbum (JSON).</p>
            <button onClick={handleExport} className="btn-primary w-full">
              Exportar todo
            </button>
          </div>

          {/* Danger zone */}
          <div className="card border-red-200">
            <h2 className="font-bold text-red-600 mb-3">⚠️ Zona de peligro</h2>

            {!confirmReset ? (
              <button
                onClick={() => setConfirmReset(true)}
                className="w-full border border-red-300 text-red-500 rounded-xl py-3 font-semibold text-sm active:bg-red-50"
              >
                Vaciar mazo / Reset total…
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">¿Qué querés hacer?</p>
                <button
                  onClick={handleResetInventory}
                  className="w-full border border-amber-400 text-amber-600 rounded-xl py-3 font-semibold text-sm active:bg-amber-50"
                >
                  Solo vaciar el mazo (inventario)
                </button>
                <div className="space-y-2">
                  <p className="text-xs text-red-500">Para reset total (borra mazo + album + eventos), escribí <strong>RESET2026</strong>:</p>
                  <input
                    value={resetCode}
                    onChange={e => setResetCode(e.target.value)}
                    placeholder="RESET2026"
                    className="w-full border border-red-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                  <button
                    onClick={handleFullReset}
                    className="w-full bg-red-500 text-white rounded-xl py-3 font-bold text-sm active:bg-red-600"
                  >
                    Reset total ⚠️
                  </button>
                </div>
                <button onClick={() => { setConfirmReset(false); setResetCode('') }} className="w-full text-gray-400 text-sm py-2">
                  Cancelar
                </button>
              </div>
            )}
          </div>

          {/* About */}
          <div className="card text-center text-xs text-gray-400 space-y-1">
            <p className="font-semibold text-gray-600">Panini 2026 Tracker</p>
            <p>Edición colombiana · 992 figuritas</p>
            <p>Checklist: Diamond Cards Online</p>
            <button
              onClick={logout}
              className="text-red-400 mt-2 font-medium active:text-red-600"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
