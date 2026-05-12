'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Settings, RefreshCw } from 'lucide-react'
import { useAlbumStats, useRecentEvents } from '@/hooks/useStats'
import { useAppStore } from '@/lib/store'
import { UserBadge, UserSwitcherSheet } from '@/components/UserBadge'
import { ProgressBar } from '@/components/ProgressBar'

function formatEventText(event: { actor: string; kind: string; payload: Record<string, unknown> }): string {
  const { actor, kind, payload } = event
  const code = payload.code as string ?? ''
  const album = payload.album as string ?? ''
  const assignment = payload.assignment as string ?? ''
  const to = payload.to as string ?? ''
  const from = payload.from as string ?? ''

  switch (kind) {
    case 'add':      return `${actor} agregó ${code} → ${assignment}`
    case 'paste':    return `${actor} pegó ${code} en ${album}`
    case 'unpaste':  return `${actor} despegó ${code} de ${album}`
    case 'move':     return `${actor} movió ${code} de ${from} a ${to}`
    case 'trade_away': return `${actor} intercambió ${code}`
    default:         return `${actor}: ${kind} ${code}`
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 60_000) return 'ahora'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
}

function AlbumCard({
  title,
  base,
  bonus,
}: {
  title: string
  base: { pegada: number; total: number }
  bonus: { pegada: number; total: number }
}) {
  const basePct = base.total === 0 ? 0 : Math.round((base.pegada / base.total) * 100)
  const bonusPct = bonus.total === 0 ? 0 : Math.round((bonus.pegada / bonus.total) * 100)

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold text-primary text-base">{title}</h3>
        <span className="text-2xl font-bold text-primary">{basePct}%</span>
      </div>
      <ProgressBar value={base.pegada} max={base.total} className="mb-1.5" />
      <p className="text-xs text-gray-500 mb-3">
        {base.pegada} / {base.total} base pegadas
      </p>

      <div className="flex items-center gap-2">
        <span className="text-xs text-amber-600 font-semibold">⭐ Bonus</span>
        <div className="flex-1">
          <ProgressBar value={bonus.pegada} max={bonus.total} color="#D97706" className="h-1.5" />
        </div>
        <span className="text-xs text-gray-500 tabular-nums">{bonus.pegada}/{bonus.total}</span>
      </div>
    </div>
  )
}

export default function InicioInner() {
  const [showSwitcher, setShowSwitcher] = useState(false)
  const { currentUser } = useAppStore()
  const { data: stats, isLoading: statsLoading, refetch } = useAlbumStats()
  const { data: events, isLoading: eventsLoading } = useRecentEvents()

  const otherUser = currentUser === 'Simon' ? 'Paul' : 'Simon'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-primary px-4 pt-safe-top pb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-lg">⚽ Panini 2026</span>
        </div>
        <div className="flex items-center gap-2">
          <UserBadge onSwitchRequest={() => setShowSwitcher(true)} />
          <Link href="/settings" className="text-white/70 active:text-white transition-colors p-1">
            <Settings size={20} />
          </Link>
        </div>
      </header>

      <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
        {statsLoading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card animate-pulse h-24 bg-gray-200" />
            ))}
          </div>
        ) : stats ? (
          <>
            {/* Album cards */}
            <AlbumCard title="🅐 Álbum Principal" base={stats.principal.base} bonus={stats.principal.bonus} />
            <AlbumCard title="🅑 Álbum Secundario" base={stats.secundario.base} bonus={stats.secundario.bonus} />

            {/* Para pegar */}
            <div className="card">
              <h3 className="font-bold text-gray-800 mb-2">📦 Para pegar</h3>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-simon inline-block" />
                  <span className="text-sm font-semibold text-gray-700">Simon: {stats.forPasting.simon}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-paul inline-block" />
                  <span className="text-sm font-semibold text-gray-700">Paul: {stats.forPasting.paul}</span>
                </div>
                <span className="ml-auto text-sm text-gray-400 font-medium">
                  Total: {stats.forPasting.simon + stats.forPasting.paul}
                </span>
              </div>
            </div>

            {/* Repetidas */}
            <div className="card">
              <h3 className="font-bold text-gray-800 mb-2">🔄 Repetidas</h3>
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-simon inline-block" />
                  <span className="text-sm font-semibold text-gray-700">Tuyas: {stats.repetidas[currentUser?.toLowerCase() as 'simon' | 'paul'] ?? 0}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-paul inline-block" />
                  <span className="text-sm font-semibold text-gray-700">De {otherUser}: {stats.repetidas[otherUser.toLowerCase() as 'simon' | 'paul'] ?? 0}</span>
                </div>
              </div>
            </div>
          </>
        ) : null}

        {/* CTA */}
        <Link
          href="/agregar"
          className="btn-primary w-full flex items-center justify-center gap-2 text-center py-4 text-lg"
        >
          ➕ Agregar stickers
        </Link>

        {/* Activity feed */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800">📋 Actividad reciente</h3>
            <button onClick={() => refetch()} className="text-gray-400 active:text-primary transition-colors">
              <RefreshCw size={15} />
            </button>
          </div>
          {eventsLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-5 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : events && events.length > 0 ? (
            <div className="space-y-2">
              {events.map((ev: { id: string; at: string; actor: string; kind: string; payload: Record<string, unknown> }) => (
                <div key={ev.id} className="flex items-start justify-between gap-2">
                  <p className="text-sm text-gray-700 flex-1">{formatEventText(ev)}</p>
                  <span className="text-xs text-gray-400 shrink-0 tabular-nums">{formatTime(ev.at)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">
              Todavía no hay actividad. ¡Agregá tu primer sticker!
            </p>
          )}
        </div>
      </div>

      {showSwitcher && (
        <UserSwitcherSheet onClose={() => setShowSwitcher(false)} />
      )}
    </div>
  )
}
