'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { AppShell } from '@/components/AppShell'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Owner, Assignment } from '@/lib/supabase'
import { Search, X } from 'lucide-react'

type InvRow = {
  id: string
  sticker_code: string
  owner: Owner
  assignment: Assignment
  added_at: string
  stickers: { code: string; section: string; number: number; section_label: string; display_name: string; is_foil: boolean; is_bonus: boolean }
}

function useInventory() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['inventory'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*, stickers(code, section, number, section_label, display_name, is_foil, is_bonus)')
        .order('added_at', { ascending: false })
      if (error) throw error
      return data as InvRow[]
    },
  })

  useEffect(() => {
    const ch = supabase
      .channel('inventory-mazo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        qc.invalidateQueries({ queryKey: ['inventory'] })
        qc.invalidateQueries({ queryKey: ['album-stats'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [qc])

  return query
}

// ── Action sheet for a row ────────────────────────────────────────────────────

async function pasteRow(inv: InvRow, actor: Owner, qc: ReturnType<typeof useQueryClient>) {
  // Update album slot
  const { error } = await supabase
    .from('album_slots')
    .update({ status: 'Pegada', pegada_at: new Date().toISOString(), pegada_by: actor })
    .eq('sticker_code', inv.sticker_code)
    .eq('album', inv.assignment)

  if (error) { toast.error('Error al pegar'); return }

  await supabase.from('inventory').delete().eq('id', inv.id)
  await supabase.from('events').insert({
    actor,
    kind: 'paste',
    payload: { code: inv.sticker_code, album: inv.assignment, actor },
  })

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(30)
  toast.success(`✅ ${inv.sticker_code} pegada en ${inv.assignment}`)
  qc.invalidateQueries({ queryKey: ['inventory'] })
  qc.invalidateQueries({ queryKey: ['album-slots'] })
  qc.invalidateQueries({ queryKey: ['album-stats'] })
}

async function moveRow(inv: InvRow, newAssignment: Assignment, actor: Owner, slots: Record<string, string>, qc: ReturnType<typeof useQueryClient>) {
  if (newAssignment === 'Principal' || newAssignment === 'Secundario') {
    if (slots[`${inv.sticker_code}-${newAssignment}`] === 'Pegada') {
      toast.error('Ese slot ya está pegado.')
      return
    }
  }

  const { error } = await supabase
    .from('inventory')
    .update({ assignment: newAssignment })
    .eq('id', inv.id)

  if (error) { toast.error('Error al mover'); return }

  await supabase.from('events').insert({
    actor,
    kind: 'move',
    payload: { code: inv.sticker_code, from: inv.assignment, to: newAssignment, actor },
  })

  toast(`↕ ${inv.sticker_code} → ${newAssignment}`)
  qc.invalidateQueries({ queryKey: ['inventory'] })
  qc.invalidateQueries({ queryKey: ['album-stats'] })
}

async function tradeRow(inv: InvRow, actor: Owner, qc: ReturnType<typeof useQueryClient>) {
  await supabase.from('inventory').delete().eq('id', inv.id)
  await supabase.from('events').insert({
    actor,
    kind: 'trade_away',
    payload: { code: inv.sticker_code, from: inv.assignment, actor },
  })
  toast(`🤝 ${inv.sticker_code} marcada como intercambiada`)
  qc.invalidateQueries({ queryKey: ['inventory'] })
  qc.invalidateQueries({ queryKey: ['album-stats'] })
}

function RowActionSheet({
  inv,
  slots,
  onClose,
}: {
  inv: InvRow
  slots: Record<string, string>
  onClose: () => void
}) {
  const { currentUser } = useAppStore()
  const qc = useQueryClient()
  const actor = currentUser!

  const canMovePrincipal = inv.assignment !== 'Principal' && slots[`${inv.sticker_code}-Principal`] !== 'Pegada'
  const canMoveSecundario = inv.assignment !== 'Secundario' && slots[`${inv.sticker_code}-Secundario`] !== 'Pegada'
  const canPaste = inv.assignment === 'Principal' || inv.assignment === 'Secundario'

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-3xl p-6 shadow-2xl max-w-lg mx-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <p className="font-bold text-gray-900 mb-1">{inv.sticker_code}</p>
        <p className="text-sm text-gray-400 mb-5">{inv.stickers?.display_name}</p>

        <div className="space-y-2">
          {canPaste && (
            <button
              onClick={async () => { await pasteRow(inv, actor, qc); onClose() }}
              className="w-full bg-pegada text-white font-semibold rounded-xl py-3 active:scale-95 transition-transform"
            >
              ✅ Marcar como pegada
            </button>
          )}
          {canMovePrincipal && (
            <button
              onClick={async () => { await moveRow(inv, 'Principal', actor, slots, qc); onClose() }}
              className="w-full bg-gray-100 text-gray-800 font-semibold rounded-xl py-3 active:scale-95 transition-transform"
            >
              🅐 Mover a Principal
            </button>
          )}
          {canMoveSecundario && (
            <button
              onClick={async () => { await moveRow(inv, 'Secundario', actor, slots, qc); onClose() }}
              className="w-full bg-gray-100 text-gray-800 font-semibold rounded-xl py-3 active:scale-95 transition-transform"
            >
              🅑 Mover a Secundario
            </button>
          )}
          {inv.assignment !== 'Repetida' && (
            <button
              onClick={async () => { await moveRow(inv, 'Repetida', actor, slots, qc); onClose() }}
              className="w-full bg-gray-100 text-gray-800 font-semibold rounded-xl py-3 active:scale-95 transition-transform"
            >
              🔄 Mover a Repetidass
            </button>
          )}
          <button
            onClick={async () => { await tradeRow(inv, actor, qc); onClose() }}
            className="w-full border border-red-200 text-red-500 font-semibold rounded-xl py-3 active:scale-95 transition-transform"
          >
            🤝 Quitar (intercambiada)
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Mazo Page ────────────────────────────────────────────────────────────

export default function MazoPage() {
  const { currentUser } = useAppStore()
  const [tab, setTab] = useState<'pegar' | 'mis' | 'otro'>('pegar')
  const [search, setSearch] = useState('')
  const [selectedInv, setSelectedInv] = useState<InvRow | null>(null)
  const { data: inventory, isLoading } = useInventory()
  const qc = useQueryClient()

  const otherUser: Owner = currentUser === 'Simon' ? 'Paul' : 'Simon'

  // Fetch album slots for move validation
  const { data: slotsData } = useQuery({
    queryKey: ['all-slots-status'],
    queryFn: async () => {
      const { data } = await supabase.from('album_slots').select('sticker_code, album, status')
      return (data ?? []).reduce<Record<string, string>>((acc, r) => {
        acc[`${r.sticker_code}-${r.album}`] = r.status
        return acc
      }, {})
    },
  })
  const slots = slotsData ?? {}

  const forPasting = inventory?.filter(r => r.assignment === 'Principal' || r.assignment === 'Secundario') ?? []
  const myReps = inventory?.filter(r => r.assignment === 'Repetida' && r.owner === currentUser) ?? []
  const otherReps = inventory?.filter(r => r.assignment === 'Repetida' && r.owner === otherUser) ?? []

  const filteredReps = (currentUser && tab === 'mis' ? myReps : otherReps).filter(r =>
    search === '' ||
    r.sticker_code.toLowerCase().includes(search.toLowerCase()) ||
    r.stickers?.section_label?.toLowerCase().includes(search.toLowerCase())
  )

  // Group by section
  const groupBySection = (rows: InvRow[]) => {
    const grouped: Record<string, InvRow[]> = {}
    rows.forEach(r => {
      const sec = r.stickers?.section ?? '??'
      if (!grouped[sec]) grouped[sec] = []
      grouped[sec].push(r)
    })
    return grouped
  }

  // Group for pasting by owner
  const simonPasting = forPasting.filter(r => r.owner === 'Simon')
  const paulPasting  = forPasting.filter(r => r.owner === 'Paul')

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-primary px-4 pt-safe-top pb-0">
          <h1 className="text-white font-bold text-lg pt-4 pb-2">Mazo</h1>
          <div className="flex gap-0.5 overflow-x-auto scrollbar-hide">
            {[
              { key: 'pegar', label: `Para pegar (${forPasting.length})` },
              { key: 'mis',   label: `Mis repetidas (${myReps.length})` },
              { key: 'otro',  label: `De ${otherUser} (${otherReps.length})` },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key as typeof tab)}
                className={cn(
                  'shrink-0 py-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
                  tab === key ? 'text-white border-white' : 'text-white/50 border-transparent'
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 py-4">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="card h-14 animate-pulse bg-gray-200" />
              ))}
            </div>
          ) : (
            <>
              {/* Para pegar tab */}
              {tab === 'pegar' && (
                <div className="space-y-4">
                  {forPasting.length === 0 ? (
                    <p className="text-center text-gray-400 py-12 text-sm">Mazo vacío — ¡agrega monas!</p>
                  ) : (
                    <>
                      {simonPasting.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-simon uppercase tracking-widest mb-2">🟦 Simon</p>
                          <div className="space-y-1.5">
                            {simonPasting.map(r => (
                              <button
                                key={r.id}
                                onClick={() => setSelectedInv(r)}
                                className="w-full card flex items-center justify-between py-3 active:bg-gray-50"
                              >
                                <div>
                                  <span className="font-mono font-bold text-sm text-gray-800">{r.sticker_code}</span>
                                  <span className="text-xs text-gray-400 ml-2">{r.stickers?.display_name}</span>
                                </div>
                                <span className={cn(
                                  'text-xs font-bold px-2 py-0.5 rounded-full',
                                  r.assignment === 'Principal' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'
                                )}>
                                  {r.assignment === 'Principal' ? '🅐' : '🅑'} {r.assignment}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {paulPasting.length > 0 && (
                        <div>
                          <p className="text-xs font-bold text-paul uppercase tracking-widest mb-2">🟧 Paul</p>
                          <div className="space-y-1.5">
                            {paulPasting.map(r => (
                              <button
                                key={r.id}
                                onClick={() => setSelectedInv(r)}
                                className="w-full card flex items-center justify-between py-3 active:bg-gray-50"
                              >
                                <div>
                                  <span className="font-mono font-bold text-sm text-gray-800">{r.sticker_code}</span>
                                  <span className="text-xs text-gray-400 ml-2">{r.stickers?.display_name}</span>
                                </div>
                                <span className={cn(
                                  'text-xs font-bold px-2 py-0.5 rounded-full',
                                  r.assignment === 'Principal' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'
                                )}>
                                  {r.assignment === 'Principal' ? '🅐' : '🅑'} {r.assignment}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Repetidas tabs */}
              {(tab === 'mis' || tab === 'otro') && (
                <div>
                  <div className="relative mb-4">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      placeholder="Buscar por código o sección..."
                      className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm
                                 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    {search && (
                      <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {filteredReps.length === 0 ? (
                    <p className="text-center text-gray-400 py-12 text-sm">
                      {tab === 'otro' ? `${otherUser} no tiene repetidas` : 'No tienes repetidas'}
                    </p>
                  ) : (
                    Object.entries(groupBySection(filteredReps)).map(([sec, rows]) => (
                      <div key={sec} className="mb-4">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                          {rows[0]?.stickers?.section_label ?? sec}
                          <span className="ml-2 bg-gray-200 text-gray-600 rounded-full px-2 py-0.5 font-semibold normal-case text-[10px]">
                            {rows.length}
                          </span>
                        </p>
                        <div className="space-y-1">
                          {rows.map(r => (
                            <button
                              key={r.id}
                              onClick={() => tab === 'mis' ? setSelectedInv(r) : undefined}
                              className={cn(
                                'w-full card flex items-center justify-between py-3',
                                tab === 'mis' ? 'active:bg-gray-50' : 'cursor-default'
                              )}
                            >
                              <div>
                                <span className="font-mono font-bold text-sm text-gray-800">{r.sticker_code}</span>
                                <span className="text-xs text-gray-400 ml-2">{r.stickers?.display_name}</span>
                              </div>
                              {tab === 'mis' && <span className="text-gray-300 text-sm">›</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {selectedInv && (
          <RowActionSheet
            inv={selectedInv}
            slots={slots}
            onClose={() => setSelectedInv(null)}
          />
        )}
      </div>
    </AppShell>
  )
}
