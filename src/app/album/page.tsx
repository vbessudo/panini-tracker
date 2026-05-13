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

// ── Hooks ────────────────────────────────────────────────────────────────────

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
      return data
    },
  })

  useEffect(() => {
    const ch = supabase
      .channel(`slots-${album}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'album_slots' }, () => {
        qc.invalidateQueries({ queryKey: ['album-slots', album] })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [album, qc])

  return query
}

function useInventoryForSlot(stickerCode: string | null) {
  return useQuery({
    queryKey: ['inventory-slot', stickerCode],
    queryFn: async () => {
      if (!stickerCode) return []
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .eq('sticker_code', stickerCode)
      if (error) throw error
      return data
    },
    enabled: !!stickerCode,
  })
}

// ── Cell bottom sheet ─────────────────────────────────────────────────────────

type SlotRow = {
  id: string
  sticker_code: string
  album: Album
  status: string
  pegada_at: string | null
  pegada_by: Owner | null
  stickers: { code: string; section: string; number: number; display_name: string; is_foil: boolean; is_bonus: boolean }
}

function CellSheet({
  slot,
  onClose,
}: {
  slot: SlotRow
  onClose: () => void
}) {
  const { currentUser } = useAppStore()
  const qc = useQueryClient()
  const { data: inventory } = useInventoryForSlot(slot.sticker_code)
  const relevantInv = inventory?.filter(r => r.assignment === slot.album) ?? []

  const handlePaste = async (invId: string) => {
    // paste: update album_slot, delete inventory row, log event
    const { error } = await supabase
      .from('album_slots')
      .update({ status: 'Pegada', pegada_at: new Date().toISOString(), pegada_by: currentUser })
      .eq('sticker_code', slot.sticker_code)
      .eq('album', slot.album)

    if (error) { toast.error('Error al pegar'); return }

    await supabase.from('inventory').delete().eq('id', invId)
    await supabase.from('events').insert({
      actor: currentUser,
      kind: 'paste',
      payload: { code: slot.sticker_code, album: slot.album, actor: currentUser },
    })

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(30)
    toast.success(`✅ ${slot.sticker_code} pegada en ${slot.album}`)
    qc.invalidateQueries({ queryKey: ['album-slots'] })
    qc.invalidateQueries({ queryKey: ['album-stats'] })
    qc.invalidateQueries({ queryKey: ['inventory-slot'] })
    qc.invalidateQueries({ queryKey: ['recent-events'] })
    onClose()
  }

  const handleUnpaste = async () => {
    await supabase
      .from('album_slots')
      .update({ status: 'Falta', pegada_at: null, pegada_by: null })
      .eq('sticker_code', slot.sticker_code)
      .eq('album', slot.album)
    await supabase.from('events').insert({
      actor: currentUser,
      kind: 'unpaste',
      payload: { code: slot.sticker_code, album: slot.album, actor: currentUser },
    })
    toast('↩ Pegada deshecha')
    qc.invalidateQueries({ queryKey: ['album-slots'] })
    qc.invalidateQueries({ queryKey: ['album-stats'] })
    onClose()
  }

  const sticker = slot.stickers

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-3xl p-6 shadow-2xl max-w-lg mx-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-gray-400 font-mono mb-0.5">{slot.sticker_code}</p>
            <h3 className="font-bold text-gray-900 text-lg">{sticker?.display_name}</h3>
            <p className="text-xs text-gray-500">{slot.album}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 active:text-gray-700 p-1">
            <X size={20} />
          </button>
        </div>

        {slot.status === 'Falta' && relevantInv.length === 0 && (
          <div className="space-y-3">
            <div className="chip-falta inline-block">Falta</div>
            <p className="text-sm text-gray-500">Todavía no tienes esta mona.</p>
          </div>
        )}

        {slot.status === 'Falta' && relevantInv.length > 0 && (
          <div className="space-y-3">
            <div className="chip-tengo inline-block">Tengo (sin pegar)</div>
            {relevantInv.map((inv: { id: string; owner: Owner; assignment: string }) => (
              <div key={inv.id} className="flex items-center justify-between">
                <p className="text-sm text-gray-600">
                  <span className={cn('font-semibold', inv.owner === 'Simon' ? 'text-simon' : 'text-paul')}>
                    {inv.owner}
                  </span>
                  {' '}tiene una copia
                </p>
                <button
                  onClick={() => handlePaste(inv.id)}
                  className="btn-primary text-sm py-2 px-4"
                >
                  Pegar ✓
                </button>
              </div>
            ))}
          </div>
        )}

        {slot.status === 'Pegada' && (
          <div className="space-y-3">
            <div className="chip-pegada inline-block">Pegada</div>
            <p className="text-sm text-gray-500">
              Pegada por{' '}
              <span className={cn('font-semibold', slot.pegada_by === 'Simon' ? 'text-simon' : 'text-paul')}>
                {slot.pegada_by}
              </span>
              {slot.pegada_at && (
                <> el {new Date(slot.pegada_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</>
              )}
            </p>
            <button
              onClick={handleUnpaste}
              className="w-full border border-red-200 text-red-500 rounded-xl py-3 text-sm font-semibold
                         active:bg-red-50 transition-colors"
            >
              ↩ Deshacer pegada
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section grid ──────────────────────────────────────────────────────────────

function SectionGrid({
  sectionCode,
  album,
  slots,
  onBack,
}: {
  sectionCode: string
  album: Album
  slots: SlotRow[]
  onBack: () => void
}) {
  const [selectedSlot, setSelectedSlot] = useState<SlotRow | null>(null)
  const sectionSlots = slots.filter(s => s.stickers?.section === sectionCode)

  // Sort by number
  sectionSlots.sort((a, b) => a.stickers.number - b.stickers.number)

  const section = SECTIONS.find(s => s.code === sectionCode)

  return (
    <div className="flex flex-col min-h-screen">
      <div className="bg-primary px-4 py-3 flex items-center gap-2">
        <button onClick={onBack} className="text-white/70 active:text-white text-sm">‹ Álbum</button>
        <span className="text-white font-bold">{section?.label ?? sectionCode}</span>
      </div>

      <div className="p-4 grid grid-cols-4 gap-2">
        {sectionSlots.map((slot) => {
          const isPegada = slot.status === 'Pegada'
          const sticker = STICKERS.find(s => s.code === slot.sticker_code)
          const displayNum = slot.stickers.number === 0 ? '00' : String(slot.stickers.number)

          return (
            <button
              key={slot.sticker_code}
              onClick={() => setSelectedSlot(slot)}
              className={cn(
                'aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5',
                'text-xs font-bold border-2 transition-colors active:scale-95',
                isPegada
                  ? 'bg-green-100 border-green-400 text-green-700'
                  : 'bg-gray-100 border-gray-200 text-gray-500'
              )}
            >
              <span className="text-base">{isPegada ? '✓' : displayNum}</span>
              {!isPegada && <span className="text-[9px] font-mono">{displayNum}</span>}
              {sticker?.is_foil && !isPegada && <span className="text-[8px] text-amber-500">✦</span>}
            </button>
          )
        })}
      </div>

      {selectedSlot && (
        <CellSheet slot={selectedSlot} onClose={() => setSelectedSlot(null)} />
      )}
    </div>
  )
}

// ── Main Album Page ───────────────────────────────────────────────────────────

export default function AlbumPage() {
  const [album, setAlbum] = useState<Album>('Principal')
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const { data: slots, isLoading } = useAlbumSlots(album)

  // Section progress
  const sectionProgress = SECTIONS.map((s) => {
    const sectionSlots = slots?.filter(r => r.stickers?.section === s.code) ?? []
    const pegada = sectionSlots.filter(r => r.status === 'Pegada').length
    return { ...s, pegada, total: sectionSlots.length }
  })

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50">
        {/* Top tabs */}
        <header className="bg-primary px-4 pt-safe-top pb-0">
          <h1 className="text-white font-bold text-lg pt-4 pb-2">Álbum</h1>
          <div className="flex">
            {(['Principal', 'Secundario'] as Album[]).map((a) => (
              <button
                key={a}
                onClick={() => { setAlbum(a); setSelectedSection(null) }}
                className={cn(
                  'flex-1 py-3 text-sm font-semibold border-b-2 transition-colors',
                  album === a
                    ? 'text-white border-white'
                    : 'text-white/50 border-transparent'
                )}
              >
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
          <div className="px-4 py-4 space-y-2 max-w-lg mx-auto">
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <div key={i} className="card h-16 animate-pulse bg-gray-200" />
              ))
            ) : (
              sectionProgress.map((s) => (
                <button
                  key={s.code}
                  onClick={() => setSelectedSection(s.code)}
                  className="card w-full text-left active:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-xs font-mono font-bold text-gray-400 mr-2">{s.code}</span>
                      <span className="text-sm font-semibold text-gray-800">{s.label}</span>
                      {s.code === 'COC' && <span className="text-amber-500 ml-1">⭐</span>}
                    </div>
                    <span className="text-xs font-bold text-primary tabular-nums">
                      {s.pegada}/{s.total}
                    </span>
                  </div>
                  <ProgressBar
                    value={s.pegada}
                    max={s.total}
                    color={s.pegada === s.total && s.total > 0 ? '#16A34A' : '#4A1A3B'}
                  />
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
