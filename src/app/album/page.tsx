'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SECTIONS, STICKERS } from '@/data/panini-stickers'
import type { Album, Owner } from '@/lib/supabase'
import { AppShell } from '@/components/AppShell'
import { ProgressBar } from '@/components/ProgressBar'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import { X } from 'lucide-react'

// ── WC Group structure ────────────────────────────────────────────────────────

const WC_GROUP_ORDER = ['FIFA','A','B','C','D','E','F','G','H','I','J','K','L','Bonus']
const WC_GROUP_LABELS: Record<string,string> = {
  FIFA: '🏆 FIFA World Cup', Bonus: '⭐ Coca-Cola Bonus',
  A:'Grupo A', B:'Grupo B', C:'Grupo C', D:'Grupo D', E:'Grupo E', F:'Grupo F',
  G:'Grupo G', H:'Grupo H', I:'Grupo I', J:'Grupo J', K:'Grupo K', L:'Grupo L',
}

const sectionsByGroup = SECTIONS.reduce<Record<string, typeof SECTIONS>>((acc, s) => {
  const g = s.group ?? (s.code === 'FWC' ? 'FIFA' : 'Bonus')
  if (!acc[g]) acc[g] = []
  acc[g].push(s)
  return acc
}, {})

// ── Hooks ─────────────────────────────────────────────────────────────────────

type SlotRow = {
  id: string; sticker_code: string; album: Album; status: string
  pegada_at: string | null; pegada_by: Owner | null
  stickers: { code: string; section: string; number: number; display_name: string; is_foil: boolean; is_bonus: boolean }
}

function useAlbumSlots(album: Album) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['album-slots', album],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('album_slots')
        .select('*, stickers(code, section, number, display_name, is_foil, is_bonus)')
        .eq('album', album)
      if (error) throw error
      return data as SlotRow[]
    },
  })
  useEffect(() => {
    const ch = supabase.channel(`slots-${album}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'album_slots' }, () => {
        qc.invalidateQueries({ queryKey: ['album-slots', album] })
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [album, qc])
  return query
}

// Returns map: sticker_code → owners who have it reserved for this album
function useInventoryForSection(sectionCodes: string[], album: Album) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['inv-section', sectionCodes.join(','), album],
    queryFn: async () => {
      if (!sectionCodes.length) return {}
      const { data } = await supabase
        .from('inventory')
        .select('sticker_code, owner')
        .in('sticker_code', sectionCodes)
        .eq('assignment', album)
      const map: Record<string, Owner[]> = {}
      data?.forEach(r => {
        if (!map[r.sticker_code]) map[r.sticker_code] = []
        if (!map[r.sticker_code].includes(r.owner)) map[r.sticker_code].push(r.owner)
      })
      return map
    },
    enabled: sectionCodes.length > 0,
  })
  useEffect(() => {
    const ch = supabase.channel(`inv-section-${album}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        qc.invalidateQueries({ queryKey: ['inv-section'] })
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [album, qc])
  return query
}

function useInventoryForSlot(stickerCode: string | null) {
  return useQuery({
    queryKey: ['inventory-slot', stickerCode],
    queryFn: async () => {
      if (!stickerCode) return []
      const { data, error } = await supabase.from('inventory').select('*').eq('sticker_code', stickerCode)
      if (error) throw error
      return data
    },
    enabled: !!stickerCode,
  })
}

// ── Cell bottom sheet ─────────────────────────────────────────────────────────

function CellSheet({ slot, onClose }: { slot: SlotRow; onClose: () => void }) {
  const { currentUser } = useAppStore()
  const qc = useQueryClient()
  const { data: inventory } = useInventoryForSlot(slot.sticker_code)
  const relevantInv = inventory?.filter(r => r.assignment === slot.album) ?? []

  const handlePaste = async (invId: string) => {
    const { error } = await supabase.from('album_slots')
      .update({ status: 'Pegada', pegada_at: new Date().toISOString(), pegada_by: currentUser })
      .eq('sticker_code', slot.sticker_code).eq('album', slot.album)
    if (error) { toast.error('Error al pegar'); return }
    await supabase.from('inventory').delete().eq('id', invId)
    await supabase.from('events').insert({ actor: currentUser, kind: 'paste',
      payload: { code: slot.sticker_code, album: slot.album, actor: currentUser } })
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(30)
    toast.success(`✅ ${slot.sticker_code} pegada en ${slot.album}`)
    qc.invalidateQueries({ queryKey: ['album-slots'] })
    qc.invalidateQueries({ queryKey: ['album-stats'] })
    qc.invalidateQueries({ queryKey: ['inventory-slot'] })
    qc.invalidateQueries({ queryKey: ['inv-section'] })
    qc.invalidateQueries({ queryKey: ['recent-events'] })
    onClose()
  }

  const handleUnpaste = async () => {
    await supabase.from('album_slots')
      .update({ status: 'Falta', pegada_at: null, pegada_by: null })
      .eq('sticker_code', slot.sticker_code).eq('album', slot.album)
    await supabase.from('events').insert({ actor: currentUser, kind: 'unpaste',
      payload: { code: slot.sticker_code, album: slot.album, actor: currentUser } })
    toast('↩ Pegada deshecha')
    qc.invalidateQueries({ queryKey: ['album-slots'] })
    qc.invalidateQueries({ queryKey: ['album-stats'] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl p-6 shadow-2xl max-w-lg mx-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400 font-mono mb-0.5">{slot.sticker_code}</p>
            <h3 className="font-bold text-gray-900 text-lg">{slot.stickers?.display_name}</h3>
            <p className="text-xs text-gray-500">{slot.album}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 active:text-gray-700 p-1"><X size={20} /></button>
        </div>

        {slot.status === 'Falta' && relevantInv.length === 0 && (
          <div className="space-y-2">
            <span className="chip-falta">Falta</span>
            <p className="text-sm text-gray-500 mt-2">Todavía no tienes esta mona.</p>
          </div>
        )}

        {slot.status === 'Falta' && relevantInv.length > 0 && (
          <div className="space-y-3">
            <span className="chip-tengo">Tengo (sin pegar)</span>
            {relevantInv.map((inv: { id: string; owner: Owner }) => (
              <div key={inv.id} className="flex items-center justify-between mt-2">
                <p className="text-sm text-gray-600">
                  <span className={cn('font-semibold', inv.owner === 'Simon' ? 'text-simon' : 'text-paul')}>{inv.owner}</span>{' '}tiene una copia
                </p>
                <button onClick={() => handlePaste(inv.id)} className="btn-primary text-sm py-2 px-4">Pegar ✓</button>
              </div>
            ))}
          </div>
        )}

        {slot.status === 'Pegada' && (
          <div className="space-y-3">
            <span className="chip-pegada">Pegada</span>
            <p className="text-sm text-gray-500 mt-2">
              Pegada por{' '}
              <span className={cn('font-semibold', slot.pegada_by === 'Simon' ? 'text-simon' : 'text-paul')}>{slot.pegada_by}</span>
              {slot.pegada_at && <> el {new Date(slot.pegada_at).toLocaleDateString('es-CO', { day:'numeric', month:'long', year:'numeric' })}</>}
            </p>
            <button onClick={handleUnpaste}
              className="w-full border border-red-200 text-red-500 rounded-xl py-3 text-sm font-semibold active:bg-red-50 transition-colors">
              ↩ Deshacer pegada
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section grid ──────────────────────────────────────────────────────────────

function SectionGrid({ sectionCode, album, slots, onBack }: {
  sectionCode: string; album: Album; slots: SlotRow[]; onBack: () => void
}) {
  const [selectedSlot, setSelectedSlot] = useState<SlotRow | null>(null)
  const { currentUser } = useAppStore()
  const otherUser: Owner = currentUser === 'Simon' ? 'Paul' : 'Simon'

  const sectionSlots = slots.filter(s => s.stickers?.section === sectionCode)
    .sort((a, b) => a.stickers.number - b.stickers.number)

  const sectionCodes = sectionSlots.map(s => s.sticker_code)
  const { data: invMap = {} } = useInventoryForSection(sectionCodes, album)

  const section = SECTIONS.find(s => s.code === sectionCode)

  return (
    <div className="flex flex-col min-h-screen">
      <div className="bg-primary px-4 py-3 flex items-center gap-2">
        <button onClick={onBack} className="text-white/70 active:text-white">‹ Álbum</button>
        <span className="text-white font-bold">{section?.label ?? sectionCode}</span>
      </div>

      {/* Legend */}
      <div className="flex gap-3 px-4 py-2 bg-gray-50 border-b border-gray-100 text-[11px] font-medium text-gray-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-200 border border-green-400 inline-block"/>Pegada</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-violet-200 border border-violet-400 inline-block"/>Tú la tienes</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-200 border border-slate-400 inline-block"/>El otro la tiene</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border border-gray-300 inline-block"/>Falta</span>
      </div>

      <div className="p-4 grid grid-cols-5 gap-2">
        {sectionSlots.map((slot) => {
          const isPegada = slot.status === 'Pegada'
          const owners   = invMap[slot.sticker_code] ?? []
          const activeHas = currentUser ? owners.includes(currentUser) : false
          const otherHas  = owners.includes(otherUser)
          const displayNum = slot.stickers.number === 0 ? '00' : String(slot.stickers.number)

          const cellClass = isPegada
            ? 'bg-green-100 border-green-400 text-green-700'
            : activeHas
            ? 'bg-violet-100 border-violet-400 text-violet-700'
            : otherHas
            ? 'bg-slate-200 border-slate-400 text-slate-600'
            : 'bg-white border-gray-200 text-gray-400'

          return (
            <button key={slot.sticker_code} onClick={() => setSelectedSlot(slot)}
              className={cn('aspect-square rounded-xl flex flex-col items-center justify-center',
                'border-2 transition-all active:scale-95 relative', cellClass)}>
              <span className="text-sm font-bold">{isPegada ? '✓' : displayNum}</span>
              {slot.stickers?.is_foil && !isPegada && (
                <span className="text-[7px] text-amber-500 absolute top-0.5 right-1">✦</span>
              )}
              {/* Both users have it: show small dot for the other */}
              {activeHas && otherHas && (
                <span className="absolute bottom-0.5 right-1 w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"/>
              )}
            </button>
          )
        })}
      </div>

      {selectedSlot && <CellSheet slot={selectedSlot} onClose={() => setSelectedSlot(null)} />}
    </div>
  )
}

// ── Main Album Page ───────────────────────────────────────────────────────────

export default function AlbumPage() {
  const [album, setAlbum] = useState<Album>('Principal')
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const { data: slots, isLoading } = useAlbumSlots(album)

  // Build section progress map
  const sectionProgress = SECTIONS.reduce<Record<string, { pegada: number; total: number }>>((acc, s) => {
    const sectionSlots = slots?.filter(r => r.stickers?.section === s.code) ?? []
    acc[s.code] = { pegada: sectionSlots.filter(r => r.status === 'Pegada').length, total: sectionSlots.length }
    return acc
  }, {})

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-primary px-4 pt-safe-top pb-0">
          <h1 className="text-white font-bold text-lg pt-4 pb-2">Álbum</h1>
          <div className="flex">
            {(['Principal','Secundario'] as Album[]).map(a => (
              <button key={a} onClick={() => { setAlbum(a); setSelectedSection(null) }}
                className={cn('flex-1 py-3 text-sm font-semibold border-b-2 transition-colors',
                  album === a ? 'text-white border-white' : 'text-white/50 border-transparent')}>
                {a === 'Principal' ? '🅐 Principal' : '🅑 Secundario'}
              </button>
            ))}
          </div>
        </header>

        {selectedSection ? (
          <SectionGrid
            sectionCode={selectedSection}
            album={album}
            slots={slots ?? []}
            onBack={() => setSelectedSection(null)}
          />
        ) : (
          <div className="px-4 py-4 max-w-lg mx-auto space-y-5">
            {isLoading ? (
              [...Array(8)].map((_, i) => <div key={i} className="card h-14 animate-pulse bg-gray-200" />)
            ) : (
              WC_GROUP_ORDER.map(groupId => {
                const secs = sectionsByGroup[groupId]
                if (!secs?.length) return null
                const groupTotal = secs.reduce((sum, s) => sum + (sectionProgress[s.code]?.total ?? 0), 0)
                const groupPegada = secs.reduce((sum, s) => sum + (sectionProgress[s.code]?.pegada ?? 0), 0)
                return (
                  <div key={groupId}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                        {WC_GROUP_LABELS[groupId]}
                      </p>
                      <span className="text-xs text-gray-400 font-medium tabular-nums">{groupPegada}/{groupTotal}</span>
                    </div>
                    <div className="space-y-1.5">
                      {secs.map(s => {
                        const prog = sectionProgress[s.code] ?? { pegada: 0, total: 0 }
                        const complete = prog.total > 0 && prog.pegada === prog.total
                        return (
                          <button key={s.code} onClick={() => setSelectedSection(s.code)}
                            className="card w-full text-left active:bg-gray-50 transition-colors py-3">
                            <div className="flex items-center justify-between mb-1.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-gray-400 w-8">{s.code}</span>
                                <span className="text-sm font-semibold text-gray-800">{s.label}</span>
                                {s.code === 'COC' && <span className="text-amber-500 text-xs">⭐</span>}
                              </div>
                              <span className={cn('text-xs font-bold tabular-nums', complete ? 'text-pegada' : 'text-primary')}>
                                {prog.pegada}/{prog.total}
                              </span>
                            </div>
                            <ProgressBar value={prog.pegada} max={prog.total}
                              color={complete ? '#16A34A' : '#4A1A3B'} />
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
