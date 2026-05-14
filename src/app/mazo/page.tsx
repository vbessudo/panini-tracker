'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SECTIONS, STICKERS } from '@/data/panini-stickers'
import { buildSectionGroups } from '@/lib/grouping'
import { GroupingToggle } from '@/components/GroupingToggle'
import { AppShell } from '@/components/AppShell'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Owner, Assignment, Album } from '@/lib/supabase'
import { Search, X, ChevronDown } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type InvRow = {
  id: string; sticker_code: string; owner: Owner; assignment: Assignment; added_at: string
  stickers: { code: string; section: string; section_label: string; display_name: string; number: number; is_foil: boolean; is_bonus: boolean }
}

type DedupeEntry = {
  sticker_code: string; display_name: string; number: number; is_foil: boolean
  rows: InvRow[]; count: number; assignments: Assignment[]
}

type CountryBlock = {
  sectionCode: string; sectionLabel: string
  entries: DedupeEntry[]; totalCopies: number; uniqueCodes: number; withDupes: number
}

type StructureGroup = {
  groupId: string; groupLabel: string; countries: CountryBlock[]
}

type FaltaSlot = {
  sticker_code: string; album: Album
  stickers: { section: string; section_label: string; display_name: string; number: number; is_foil: boolean; is_bonus: boolean }
}

// ── Data hooks ────────────────────────────────────────────────────────────────

function useInventory() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['inventory-mazo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*, stickers(code, section, section_label, display_name, number, is_foil, is_bonus)')
        .order('sticker_code')
      if (error) throw error
      return data as InvRow[]
    },
  })
  useEffect(() => {
    const ch = supabase.channel('inventory-mazo-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        qc.invalidateQueries({ queryKey: ['inventory-mazo'] })
        qc.invalidateQueries({ queryKey: ['album-stats'] })
        qc.invalidateQueries({ queryKey: ['falta-slots'] })
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [qc])
  return query
}

function useFaltaSlots() {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['falta-slots'],
    queryFn: async () => {
      const [slotsRes, invRes] = await Promise.all([
        supabase.from('album_slots')
          .select('sticker_code, album, stickers(section, section_label, display_name, number, is_foil, is_bonus)')
          .eq('status', 'Falta')
          .limit(2000),   // ← Supabase default is 1000; we have up to 1984 falta rows
        supabase.from('inventory').select('sticker_code, assignment'),
      ])
      if (slotsRes.error) throw slotsRes.error
      // A slot is truly missing if no inventory row reserves it for that album
      const reserved = new Set(invRes.data?.map(r => `${r.sticker_code}-${r.assignment}`) ?? [])
      return (slotsRes.data ?? []).filter(s => !reserved.has(`${s.sticker_code}-${s.album}`)) as unknown as FaltaSlot[]
    },
  })
  useEffect(() => {
    const ch = supabase.channel('falta-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'album_slots' }, () => {
        qc.invalidateQueries({ queryKey: ['falta-slots'] })
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [qc])
  return query
}

function useSlotStatus() {
  return useQuery({
    queryKey: ['all-slots-status'],
    queryFn: async () => {
      const { data } = await supabase.from('album_slots').select('sticker_code, album, status')
      return (data ?? []).reduce<Record<string, string>>((acc, r) => {
        acc[`${r.sticker_code}-${r.album}`] = r.status; return acc
      }, {})
    },
  })
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function dedupeRows(rows: InvRow[]): DedupeEntry[] {
  const map = new Map<string, DedupeEntry>()
  for (const r of rows) {
    const ex = map.get(r.sticker_code)
    if (ex) {
      ex.rows.push(r); ex.count++
      if (!ex.assignments.includes(r.assignment)) ex.assignments.push(r.assignment)
    } else {
      map.set(r.sticker_code, {
        sticker_code: r.sticker_code,
        display_name: r.stickers?.display_name ?? r.sticker_code,
        number: r.stickers?.number ?? 0,
        is_foil: r.stickers?.is_foil ?? false,
        rows: [r], count: 1, assignments: [r.assignment],
      })
    }
  }
  return Array.from(map.values()).sort((a, b) => a.number - b.number)
}

function buildStructure(rows: InvRow[], groupingMode: import('@/lib/grouping').GroupingMode): StructureGroup[] {
  const bySec: Record<string, InvRow[]> = {}
  rows.forEach(r => {
    const sec = r.stickers?.section ?? '??'
    if (!bySec[sec]) bySec[sec] = []
    bySec[sec].push(r)
  })
  return buildSectionGroups(groupingMode).flatMap(({ groupId, groupLabel, sections }) => {
    const countries = sections.filter(s => bySec[s.code]).map(s => {
      const secRows = bySec[s.code]
      const entries = dedupeRows(secRows)
      return {
        sectionCode: s.code, sectionLabel: s.label,
        entries, totalCopies: secRows.length,
        uniqueCodes: entries.length, withDupes: entries.filter(e => e.count > 1).length,
      }
    })
    if (!countries.length) return []
    return [{ groupId, groupLabel, countries }]
  })
}

function buildFaltaStructure(
  slots: FaltaSlot[],
  album: Album,
  groupingMode: import('@/lib/grouping').GroupingMode,
) {
  const albumSlots = slots.filter(s => s.album === album)
  const bySec: Record<string, FaltaSlot[]> = {}
  albumSlots.forEach(s => {
    const sec = s.stickers?.section ?? '??'
    if (!bySec[sec]) bySec[sec] = []
    bySec[sec].push(s)
  })
  for (const arr of Object.values(bySec)) arr.sort((a, b) => a.stickers.number - b.stickers.number)

  return buildSectionGroups(groupingMode).flatMap(({ groupId, groupLabel, sections }) => {
    const countries = sections.filter(s => bySec[s.code]).map(s => ({
      sectionCode: s.code, sectionLabel: s.label,
      slots: bySec[s.code], count: bySec[s.code].length,
    }))
    if (!countries.length) return []
    return [{ groupId, groupLabel, countries }]
  })
}

// ── Action sheet ──────────────────────────────────────────────────────────────

function ActionSheet({ entry, slots, onClose }: {
  entry: DedupeEntry; slots: Record<string, string>; onClose: () => void
}) {
  const { currentUser } = useAppStore()
  const qc = useQueryClient()
  const actor = currentUser!

  const pasteRow = async (row: InvRow) => {
    const { error } = await supabase.from('album_slots')
      .update({ status: 'Pegada', pegada_at: new Date().toISOString(), pegada_by: actor })
      .eq('sticker_code', row.sticker_code).eq('album', row.assignment)
    if (error) { toast.error('Error al pegar'); return }
    await supabase.from('inventory').delete().eq('id', row.id)
    await supabase.from('events').insert({ actor, kind: 'paste',
      payload: { code: row.sticker_code, album: row.assignment, actor } })
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(30)
    toast.success(`✅ ${row.sticker_code} pegada en ${row.assignment}`)
    qc.invalidateQueries({ queryKey: ['inventory-mazo'] })
    qc.invalidateQueries({ queryKey: ['album-slots'] })
    qc.invalidateQueries({ queryKey: ['album-stats'] })
    qc.invalidateQueries({ queryKey: ['falta-slots'] })
    onClose()
  }

  const moveRow = async (row: InvRow, newAssignment: Assignment) => {
    await supabase.from('inventory').update({ assignment: newAssignment }).eq('id', row.id)
    await supabase.from('events').insert({ actor, kind: 'move',
      payload: { code: row.sticker_code, from: row.assignment, to: newAssignment, actor } })
    toast(`↕ ${row.sticker_code} → ${newAssignment}`)
    qc.invalidateQueries({ queryKey: ['inventory-mazo'] })
    qc.invalidateQueries({ queryKey: ['album-stats'] })
    onClose()
  }

  const tradeRow = async (row: InvRow) => {
    await supabase.from('inventory').delete().eq('id', row.id)
    await supabase.from('events').insert({ actor, kind: 'trade_away',
      payload: { code: row.sticker_code, from: row.assignment, actor } })
    toast(`🤝 ${row.sticker_code} intercambiada`)
    qc.invalidateQueries({ queryKey: ['inventory-mazo'] })
    qc.invalidateQueries({ queryKey: ['album-stats'] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl p-6 shadow-2xl max-w-lg mx-auto" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <p className="font-bold text-gray-900">{entry.sticker_code}
          {entry.is_foil && <span className="text-amber-500 ml-1.5 text-sm">✦</span>}
        </p>
        <p className="text-sm text-gray-400 mb-1">{entry.display_name}</p>
        {entry.count > 1 && (
          <p className="text-xs font-semibold text-rose mb-4">{entry.count} copias disponibles</p>
        )}
        <div className="space-y-2">
          {entry.rows.map((row, i) => (
            <div key={row.id}>
              {entry.rows.length > 1 && (
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-1.5">
                  Copia {i + 1} — {row.assignment} · {row.owner}
                </p>
              )}
              <div className="space-y-1.5">
                {(row.assignment === 'Principal' || row.assignment === 'Secundario') && (
                  <button onClick={() => pasteRow(row)}
                    className="w-full bg-pegada text-white font-semibold rounded-xl py-3 active:scale-95 transition-transform text-sm">
                    ✅ Pegar en {row.assignment}
                  </button>
                )}
                {row.assignment !== 'Principal' && slots[`${row.sticker_code}-Principal`] !== 'Pegada' && (
                  <button onClick={() => moveRow(row, 'Principal')}
                    className="w-full bg-blushLight text-accent font-semibold rounded-xl py-2.5 active:scale-95 transition-transform text-sm">
                    🅐 Mover a Principal
                  </button>
                )}
                {row.assignment !== 'Secundario' && slots[`${row.sticker_code}-Secundario`] !== 'Pegada' && (
                  <button onClick={() => moveRow(row, 'Secundario')}
                    className="w-full bg-blushLight text-accent font-semibold rounded-xl py-2.5 active:scale-95 transition-transform text-sm">
                    🅑 Mover a Secundario
                  </button>
                )}
                {row.assignment !== 'Repetida' && (
                  <button onClick={() => moveRow(row, 'Repetida')}
                    className="w-full bg-[#EEEEEE] text-gray-700 font-semibold rounded-xl py-2.5 active:scale-95 transition-transform text-sm">
                    🔄 Mover a Repetidas
                  </button>
                )}
                <button onClick={() => tradeRow(row)}
                  className="w-full border border-red-200 text-red-500 font-semibold rounded-xl py-2.5 active:scale-95 transition-transform text-sm">
                  🤝 Quitar (intercambiada)
                </button>
              </div>
              {i < entry.rows.length - 1 && <hr className="my-3 border-[#EEEEEE]" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Country block (collapsible) ───────────────────────────────────────────────

function CountryBlock({ country, isExpanded, onToggle, onSelect, readOnly }: {
  country: CountryBlock; isExpanded: boolean
  onToggle: () => void; onSelect: (e: DedupeEntry) => void; readOnly?: boolean
}) {
  const { uniqueCodes, withDupes, sectionCode, sectionLabel, entries } = country
  return (
    <div className={cn('rounded-2xl overflow-hidden border transition-all',
      isExpanded ? 'border-rose/30 shadow-sm' : 'border-[#EEEEEE] bg-white')}>
      <button onClick={onToggle}
        className={cn('w-full flex items-center justify-between px-4 py-3 transition-colors',
          isExpanded ? 'bg-blushLight/50' : 'bg-white active:bg-[#F5F5F5]')}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono font-bold text-[11px] text-rose shrink-0">{sectionCode}</span>
          <span className="font-semibold text-sm text-gray-800 truncate">{sectionLabel}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {uniqueCodes > 0 && (
            <span className="text-xs font-semibold text-gray-500 tabular-nums">
              {uniqueCodes} mona{uniqueCodes !== 1 ? 's' : ''}
            </span>
          )}
          {withDupes > 0 && (
            <span className="text-[10px] font-bold bg-blush text-accent px-1.5 py-0.5 rounded-full">
              {withDupes} rep.
            </span>
          )}
          <ChevronDown size={15} className={cn('text-gray-400 transition-transform duration-200', isExpanded && 'rotate-180')} />
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-blush/30 bg-white divide-y divide-[#F5F5F5]">
          {entries.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Sin monas</p>
          ) : entries.map(entry => (
            <button key={entry.sticker_code}
              onClick={() => !readOnly && onSelect(entry)}
              className={cn('w-full flex items-center justify-between px-4 py-2.5 text-left',
                readOnly ? 'cursor-default' : 'active:bg-blushLight/40 transition-colors')}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono font-bold text-xs text-accent shrink-0 w-12">{entry.sticker_code}</span>
                <span className="text-xs text-gray-600 truncate">{entry.display_name}</span>
                {entry.is_foil && <span className="text-[9px] text-amber-500 shrink-0">✦</span>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {entry.assignments.includes('Principal')  && <span className="text-[10px] font-bold bg-blushLight text-accent px-1.5 py-0.5 rounded-full">🅐</span>}
                {entry.assignments.includes('Secundario') && <span className="text-[10px] font-bold bg-blushLight text-accent px-1.5 py-0.5 rounded-full">🅑</span>}
                {entry.assignments.includes('Repetida')   && <span className="text-[10px] font-bold bg-[#EEEEEE] text-gray-500 px-1.5 py-0.5 rounded-full">🔄</span>}
                {entry.count > 1 && (
                  <span className="text-[11px] font-bold bg-blush text-accent px-1.5 py-0.5 rounded-full min-w-[22px] text-center">
                    ×{entry.count}
                  </span>
                )}
                {!readOnly && <span className="text-gray-300 text-sm">›</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Inventory list (Mi mano / De otro) ───────────────────────────────────────

function InventoryList({
  rows, isLoading, emptyText, readOnly,
  slots, groupingMode,
}: {
  rows: InvRow[]; isLoading: boolean; emptyText: string; readOnly?: boolean
  slots: Record<string, string>; groupingMode: import('@/lib/grouping').GroupingMode
}) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedEntry, setSelectedEntry] = useState<DedupeEntry | null>(null)

  const filtered = rows.filter(r =>
    !search ||
    r.sticker_code.toLowerCase().includes(search.toLowerCase()) ||
    r.stickers?.section_label?.toLowerCase().includes(search.toLowerCase()) ||
    r.stickers?.display_name?.toLowerCase().includes(search.toLowerCase())
  )

  const structure = buildStructure(filtered, groupingMode)
  const totalCopies  = rows.length
  const totalUnique  = structure.reduce((s, g) => s + g.countries.reduce((s2, c) => s2 + c.uniqueCodes, 0), 0)

  const toggle = (code: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(code) ? s.delete(code) : s.add(code); return s })

  return (
    <div className="flex flex-col h-full">
      {/* Search + stats */}
      <div className="px-4 pt-3 pb-2 space-y-2 bg-[#F9F9F9] border-b border-[#EEEEEE] sticky top-0 z-10">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar mona, jugador o selección…"
            className="w-full pl-9 pr-9 py-2.5 bg-white border border-[#EEEEEE] rounded-xl text-sm
                       focus:outline-none focus:ring-2 focus:ring-rose/30" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={14} /></button>}
        </div>
        {totalCopies > 0 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {totalUnique} código{totalUnique !== 1 ? 's' : ''} · {totalCopies} copia{totalCopies !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setExpanded(new Set(structure.flatMap(g => g.countries.map(c => c.sectionCode))))}
                className="text-[11px] text-rose font-semibold active:opacity-70">Abrir todo</button>
              <button onClick={() => setExpanded(new Set())}
                className="text-[11px] text-gray-400 font-semibold active:opacity-70">Cerrar</button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {isLoading ? (
          [...Array(4)].map((_, i) => <div key={i} className="card h-12 animate-pulse bg-[#EEEEEE]" />)
        ) : structure.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">{emptyText}</p>
        ) : (
          structure.map(({ groupId, groupLabel, countries }) => (
            <div key={groupId}>
              <p className="group-header">{groupLabel}</p>
              <div className="space-y-1.5">
                {countries.map(c => (
                  <CountryBlock key={c.sectionCode} country={c} readOnly={readOnly}
                    isExpanded={expanded.has(c.sectionCode)}
                    onToggle={() => toggle(c.sectionCode)}
                    onSelect={setSelectedEntry} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {selectedEntry && !readOnly && (
        <ActionSheet entry={selectedEntry} slots={slots} onClose={() => setSelectedEntry(null)} />
      )}
    </div>
  )
}

// ── Falta tab ─────────────────────────────────────────────────────────────────

function FaltaTab({ groupingMode }: { groupingMode: import('@/lib/grouping').GroupingMode }) {
  const [album, setAlbum] = useState<Album>('Principal')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const { data: faltaSlots = [], isLoading } = useFaltaSlots()

  const structure = buildFaltaStructure(faltaSlots, album, groupingMode)
  const totalFalta = faltaSlots.filter(s => s.album === album).length

  const toggle = (code: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(code) ? s.delete(code) : s.add(code); return s })

  return (
    <div className="flex flex-col h-full">
      {/* Album sub-tabs */}
      <div className="bg-white border-b border-[#EEEEEE] flex">
        {(['Principal', 'Secundario'] as Album[]).map(a => {
          const count = faltaSlots.filter(s => s.album === a).length
          return (
            <button key={a} onClick={() => { setAlbum(a); setExpanded(new Set()) }}
              className={cn('flex-1 py-3 text-sm font-semibold border-b-2 transition-colors',
                album === a ? 'text-accent border-accent' : 'text-gray-400 border-transparent')}>
              {a === 'Principal' ? '🅐 Principal' : '🅑 Secundario'}
              <span className={cn('ml-1.5 text-xs tabular-nums',
                album === a ? 'text-rose' : 'text-gray-300')}>
                ({count})
              </span>
            </button>
          )
        })}
      </div>

      {totalFalta > 0 && (
        <div className="px-4 py-2 flex items-center justify-between bg-[#F9F9F9] border-b border-[#EEEEEE]">
          <p className="text-xs text-gray-400">{totalFalta} mona{totalFalta !== 1 ? 's' : ''} pendiente{totalFalta !== 1 ? 's' : ''}</p>
          <div className="flex gap-3">
            <button onClick={() => setExpanded(new Set(structure.flatMap(g => g.countries.map(c => c.sectionCode))))}
              className="text-[11px] text-rose font-semibold active:opacity-70">Abrir todo</button>
            <button onClick={() => setExpanded(new Set())}
              className="text-[11px] text-gray-400 font-semibold active:opacity-70">Cerrar</button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
        {isLoading ? (
          [...Array(5)].map((_, i) => <div key={i} className="card h-12 animate-pulse bg-[#EEEEEE]" />)
        ) : totalFalta === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🎉</p>
            <p className="text-gray-800 font-semibold">¡Álbum {album} completo!</p>
            <p className="text-sm text-gray-400 mt-1">Todas las monas están pegadas o en mano.</p>
          </div>
        ) : (
          structure.map(({ groupId, groupLabel, countries }) => (
            <div key={groupId}>
              <p className="group-header">{groupLabel}</p>
              <div className="space-y-1.5">
                {countries.map(({ sectionCode, sectionLabel, slots: secSlots, count }) => {
                  const isExpanded = expanded.has(sectionCode)
                  return (
                    <div key={sectionCode}
                      className={cn('rounded-2xl overflow-hidden border transition-all',
                        isExpanded ? 'border-rose/30 shadow-sm' : 'border-[#EEEEEE] bg-white')}>
                      <button onClick={() => toggle(sectionCode)}
                        className={cn('w-full flex items-center justify-between px-4 py-3',
                          isExpanded ? 'bg-blushLight/50' : 'bg-white active:bg-[#F5F5F5]')}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="font-mono font-bold text-[11px] text-rose shrink-0">{sectionCode}</span>
                          <span className="font-semibold text-sm text-gray-800 truncate">{sectionLabel}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-xs text-gray-500 tabular-nums font-medium">{count} falta{count !== 1 ? 'n' : ''}</span>
                          <ChevronDown size={15} className={cn('text-gray-400 transition-transform duration-200', isExpanded && 'rotate-180')} />
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="border-t border-blush/30 bg-white divide-y divide-[#F5F5F5]">
                          {secSlots.map(slot => {
                            const displayNum = slot.stickers.number === 0 ? '00' : String(slot.stickers.number)
                            return (
                              <div key={slot.sticker_code} className="flex items-center px-4 py-2.5 gap-2">
                                <span className="font-mono font-bold text-xs text-rose w-12 shrink-0">{slot.sticker_code}</span>
                                <span className="text-xs text-gray-600 flex-1 truncate">{slot.stickers.display_name}</span>
                                {slot.stickers.is_foil && <span className="text-[9px] text-amber-500">✦</span>}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Main Mazo Page ────────────────────────────────────────────────────────────

type Tab = 'mia' | 'otro' | 'intercambiar' | 'falta'

export default function MazoPage() {
  const { currentUser, groupingMode } = useAppStore()
  const [tab, setTab] = useState<Tab>('mia')
  const { data: inventory = [], isLoading } = useInventory()
  const { data: slots = {} } = useSlotStatus()

  const otherUser: Owner = currentUser === 'Simon' ? 'Paul' : 'Simon'

  // Tradeable pool (for Intercambiar tab)
  const tradeableRows = inventory.filter(r =>
    r.assignment === 'Repetida' ||
    r.owner === 'Paul' ||
    slots[`${r.sticker_code}-Principal`] === 'Pegada'
  )

  const tabConfig: { key: Tab; label: string }[] = [
    { key: 'mia',          label: `Mi mano` },
    { key: 'otro',         label: `De ${otherUser}` },
    { key: 'intercambiar', label: 'Intercambiar' },
    { key: 'falta',        label: 'Falta' },
  ]

  return (
    <AppShell>
      <div className="min-h-screen bg-[#F9F9F9] flex flex-col">
        <header className="bg-primary pt-safe px-4 pb-4">
          <div className="flex items-center justify-between">
            <h1 className="text-white font-bold text-lg">Mazo</h1>
            <GroupingToggle />
          </div>
        </header>

        {/* Tab bar — separate from primary header */}
        <div className="bg-white border-b border-[#EEEEEE] flex overflow-x-auto scrollbar-hide sticky top-0 z-20 shadow-sm">
          {tabConfig.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn('shrink-0 py-3 px-4 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
                tab === key ? 'text-accent border-accent' : 'text-gray-400 border-transparent')}>
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {tab === 'mia' && (
            <InventoryList
              rows={inventory.filter(r => r.owner === currentUser)}
              isLoading={isLoading}
              emptyText="Tu mazo está vacío — ¡agrega monas!"
              slots={slots} groupingMode={groupingMode}
            />
          )}
          {tab === 'otro' && (
            <InventoryList
              rows={inventory.filter(r => r.owner === otherUser)}
              isLoading={isLoading}
              emptyText={`${otherUser} no tiene monas en el mazo.`}
              readOnly slots={slots} groupingMode={groupingMode}
            />
          )}
          {tab === 'intercambiar' && (
            <InventoryList
              rows={tradeableRows}
              isLoading={isLoading}
              emptyText="No hay monas disponibles para intercambiar."
              readOnly slots={slots} groupingMode={groupingMode}
            />
          )}
          {tab === 'falta' && (
            <FaltaTab groupingMode={groupingMode} />
          )}
        </div>
      </div>
    </AppShell>
  )
}
