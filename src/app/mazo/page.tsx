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
import type { Owner, Assignment } from '@/lib/supabase'
import { Search, X, ChevronDown } from 'lucide-react'

// ── WC Group structure ────────────────────────────────────────────────────────




// ── Types ─────────────────────────────────────────────────────────────────────

type InvRow = {
  id: string
  sticker_code: string
  owner: Owner
  assignment: Assignment
  added_at: string
  stickers: {
    code: string
    section: string
    section_label: string
    display_name: string
    number: number
    is_foil: boolean
    is_bonus: boolean
  }
}

// A deduplicated code entry (may represent multiple inventory rows)
type DedupeEntry = {
  sticker_code: string
  display_name: string
  number: number
  is_foil: boolean
  rows: InvRow[]           // all inventory rows for this code (in this filter)
  count: number            // total copies
  assignments: Assignment[] // distinct assignments present
}

// ── Data hook ─────────────────────────────────────────────────────────────────

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
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [qc])

  return query
}

// ── Deduplication ─────────────────────────────────────────────────────────────

function dedupeRows(rows: InvRow[]): DedupeEntry[] {
  const map = new Map<string, DedupeEntry>()
  for (const r of rows) {
    const existing = map.get(r.sticker_code)
    if (existing) {
      existing.rows.push(r)
      existing.count++
      if (!existing.assignments.includes(r.assignment)) existing.assignments.push(r.assignment)
    } else {
      map.set(r.sticker_code, {
        sticker_code: r.sticker_code,
        display_name: r.stickers?.display_name ?? r.sticker_code,
        number: r.stickers?.number ?? 0,
        is_foil: r.stickers?.is_foil ?? false,
        rows: [r],
        count: 1,
        assignments: [r.assignment],
      })
    }
  }
  // Sort by number within each section
  return Array.from(map.values()).sort((a, b) => a.number - b.number)
}

// ── Build WC-grouped structure ────────────────────────────────────────────────

type CountryBlock = {
  sectionCode: string
  sectionLabel: string
  entries: DedupeEntry[]
  totalCopies: number     // all inventory rows
  uniqueCodes: number     // distinct sticker codes
  withDupes: number       // codes that appear more than once
}

type WCGroup = {
  groupId: string
  groupLabel: string
  countries: CountryBlock[]
}

function buildStructure(rows: InvRow[], groupingMode: import('@/lib/grouping').GroupingMode): WCGroup[] {
  const bySec: Record<string, InvRow[]> = {}
  rows.forEach(r => {
    const sec = r.stickers?.section ?? '??'
    if (!bySec[sec]) bySec[sec] = []
    bySec[sec].push(r)
  })

  const sectionGroups = buildSectionGroups(groupingMode)

  return sectionGroups.flatMap(({ groupId, groupLabel, sections }) => {
    const groupSections = sections.filter(s => bySec[s.code])
    if (!groupSections.length) return []

    const countries: CountryBlock[] = groupSections.map(s => {
      const secRows = bySec[s.code]
      const entries = dedupeRows(secRows)
      return {
        sectionCode: s.code,
        sectionLabel: s.label,
        entries,
        totalCopies: secRows.length,
        uniqueCodes: entries.length,
        withDupes: entries.filter(e => e.count > 1).length,
      }
    })

    return [{ groupId, groupLabel, countries }]
  })
}

// ── Action sheet ──────────────────────────────────────────────────────────────

function ActionSheet({ entry, tab, slots, onClose }: {
  entry: DedupeEntry
  tab: 'pegar' | 'mis' | 'otro'
  slots: Record<string, string>
  onClose: () => void
}) {
  const { currentUser } = useAppStore()
  const qc = useQueryClient()
  const actor = currentUser!

  // Act on the first (or specific) row
  const firstRow = entry.rows[0]

  const canPaste = (row: InvRow) => row.assignment === 'Principal' || row.assignment === 'Secundario'
  const canMovePrincipal = (row: InvRow) =>
    row.assignment !== 'Principal' && slots[`${row.sticker_code}-Principal`] !== 'Pegada'
  const canMoveSecundario = (row: InvRow) =>
    row.assignment !== 'Secundario' && slots[`${row.sticker_code}-Secundario`] !== 'Pegada'

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
    toast(`🤝 ${row.sticker_code} marcada como intercambiada`)
    qc.invalidateQueries({ queryKey: ['inventory-mazo'] })
    qc.invalidateQueries({ queryKey: ['album-stats'] })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl p-6 shadow-2xl max-w-lg mx-auto" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
        <p className="font-bold text-gray-900">{entry.sticker_code}</p>
        <p className="text-sm text-gray-400 mb-1">{entry.display_name}</p>
        {entry.count > 1 && (
          <p className="text-xs text-amber-600 font-semibold mb-4">Tienes {entry.count} copias · actuando sobre 1</p>
        )}

        {/* If multiple rows (e.g. Principal + Secundario), show each as a sub-header */}
        <div className="space-y-3 mb-2">
          {entry.rows.map((row, i) => (
            <div key={row.id}>
              {entry.rows.length > 1 && (
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-1.5">
                  Copia {i + 1} — {row.assignment} · de {row.owner}
                </p>
              )}
              <div className="space-y-2">
                {canPaste(row) && (
                  <button onClick={() => pasteRow(row)}
                    className="w-full bg-pegada text-white font-semibold rounded-xl py-3 active:scale-95 transition-transform text-sm">
                    ✅ Pegar en {row.assignment}
                  </button>
                )}
                {canMovePrincipal(row) && (
                  <button onClick={() => moveRow(row, 'Principal')}
                    className="w-full bg-gray-100 text-gray-800 font-semibold rounded-xl py-2.5 active:scale-95 transition-transform text-sm">
                    🅐 Mover a Principal
                  </button>
                )}
                {canMoveSecundario(row) && (
                  <button onClick={() => moveRow(row, 'Secundario')}
                    className="w-full bg-gray-100 text-gray-800 font-semibold rounded-xl py-2.5 active:scale-95 transition-transform text-sm">
                    🅑 Mover a Secundario
                  </button>
                )}
                {row.assignment !== 'Repetida' && (
                  <button onClick={() => moveRow(row, 'Repetida')}
                    className="w-full bg-gray-100 text-gray-800 font-semibold rounded-xl py-2.5 active:scale-95 transition-transform text-sm">
                    🔄 Mover a Repetidas
                  </button>
                )}
                <button onClick={() => tradeRow(row)}
                  className="w-full border border-red-200 text-red-500 font-semibold rounded-xl py-2.5 active:scale-95 transition-transform text-sm">
                  🤝 Quitar (intercambiada)
                </button>
              </div>
              {i < entry.rows.length - 1 && <hr className="my-2 border-gray-100" />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Country block (collapsible) ───────────────────────────────────────────────

function CountryBlock({ country, tab, slots, isExpanded, onToggle, onSelect }: {
  country: CountryBlock
  tab: 'pegar' | 'mis' | 'otro'
  slots: Record<string, string>
  isExpanded: boolean
  onToggle: () => void
  onSelect: (entry: DedupeEntry) => void
}) {
  const { uniqueCodes, withDupes, totalCopies, sectionCode, sectionLabel, entries } = country

  return (
    <div className={cn('rounded-2xl overflow-hidden border transition-all',
      isExpanded ? 'border-primary/30 shadow-sm' : 'border-gray-100 bg-white')}>

      {/* Country header row */}
      <button onClick={onToggle}
        className={cn('w-full flex items-center justify-between px-4 py-3 transition-colors',
          isExpanded ? 'bg-primary/5' : 'bg-white active:bg-gray-50')}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-mono font-bold text-xs text-gray-400 shrink-0">{sectionCode}</span>
          <span className="font-semibold text-sm text-gray-800 truncate">{sectionLabel}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {uniqueCodes > 0 ? (
            <>
              <span className="text-xs font-semibold text-gray-500 tabular-nums">
                {uniqueCodes} mona{uniqueCodes !== 1 ? 's' : ''}
              </span>
              {withDupes > 0 && (
                <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                  {withDupes} rep.
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-gray-300">—</span>
          )}
          <ChevronDown size={15} className={cn('text-gray-400 transition-transform duration-200',
            isExpanded && 'rotate-180')} />
        </div>
      </button>

      {/* Expanded mona list */}
      {isExpanded && (
        <div className="border-t border-primary/10 bg-white divide-y divide-gray-50">
          {entries.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">No hay monas de {sectionLabel}</p>
          ) : (
            entries.map(entry => (
              <button key={entry.sticker_code} onClick={() => onSelect(entry)}
                className="w-full flex items-center justify-between px-4 py-2.5 active:bg-primary/5 transition-colors text-left">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono font-bold text-xs text-gray-500 shrink-0 w-12">
                    {entry.sticker_code}
                  </span>
                  <span className="text-xs text-gray-600 truncate">{entry.display_name}</span>
                  {entry.is_foil && <span className="text-[9px] text-amber-500 shrink-0">✦</span>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {/* Assignment chips */}
                  {entry.assignments.includes('Principal') && (
                    <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">🅐</span>
                  )}
                  {entry.assignments.includes('Secundario') && (
                    <span className="text-[10px] font-bold bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">🅑</span>
                  )}
                  {entry.assignments.includes('Repetida') && (
                    <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">🔄</span>
                  )}
                  {/* Count badge */}
                  {entry.count > 1 && (
                    <span className="text-[11px] font-bold bg-amber-500 text-white px-1.5 py-0.5 rounded-full min-w-[22px] text-center">
                      ×{entry.count}
                    </span>
                  )}
                  <span className="text-gray-300 text-sm">›</span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Mazo Page ────────────────────────────────────────────────────────────

export default function MazoPage() {
  const { currentUser, groupingMode } = useAppStore()
  const [tab, setTab] = useState<'pegar' | 'mis' | 'otro'>('pegar')
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedEntry, setSelectedEntry] = useState<DedupeEntry | null>(null)
  const { data: inventory = [], isLoading } = useInventory()

  const otherUser: Owner = currentUser === 'Simon' ? 'Paul' : 'Simon'

  // Album slots for action validation
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

  // Filter inventory by tab
  const tabRows: InvRow[] = (() => {
    if (tab === 'pegar')
      return inventory.filter(r => r.assignment === 'Principal' || r.assignment === 'Secundario')
    if (tab === 'mis')
      return inventory.filter(r => r.assignment === 'Repetida' && r.owner === currentUser)
    return inventory.filter(r => r.assignment === 'Repetida' && r.owner === otherUser)
  })()

  // Apply search
  const filtered = tabRows.filter(r =>
    !search ||
    r.sticker_code.toLowerCase().includes(search.toLowerCase()) ||
    r.stickers?.section_label?.toLowerCase().includes(search.toLowerCase()) ||
    r.stickers?.display_name?.toLowerCase().includes(search.toLowerCase())
  )

  const structure = buildStructure(filtered, groupingMode)

  const toggleExpand = (code: string) =>
    setExpanded(prev => { const s = new Set(prev); s.has(code) ? s.delete(code) : s.add(code); return s })

  const expandAll  = () => setExpanded(new Set(structure.flatMap(g => g.countries.map(c => c.sectionCode))))
  const collapseAll = () => setExpanded(new Set())

  // Totals for tab header
  const totalUnique  = structure.reduce((sum, g) => sum + g.countries.reduce((s2, c) => s2 + c.uniqueCodes, 0), 0)
  const totalCopies  = tabRows.length
  const totalDupes   = structure.reduce((sum, g) => sum + g.countries.reduce((s2, c) => s2 + c.withDupes, 0), 0)

  const tabConfig = [
    { key: 'pegar', label: `Para pegar` },
    { key: 'mis',   label: `Mis repetidas` },
    { key: 'otro',  label: `De ${otherUser}` },
  ]

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-primary px-4 pt-safe-top pb-0">
          <div className="flex items-center justify-between pt-4 pb-2">
            <h1 className="text-white font-bold text-lg">Mazo</h1>
            <GroupingToggle />
          </div>
          <div className="flex overflow-x-auto scrollbar-hide">
            {tabConfig.map(({ key, label }) => (
              <button key={key} onClick={() => { setTab(key as typeof tab); setSearch(''); setExpanded(new Set()) }}
                className={cn('shrink-0 py-3 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap',
                  tab === key ? 'text-white border-white' : 'text-white/50 border-transparent')}>
                {label}
              </button>
            ))}
          </div>
        </header>

        {/* Search + summary bar */}
        <div className="sticky top-0 z-10 bg-gray-50 px-4 pt-3 pb-2 space-y-2 border-b border-gray-100">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar mona, jugador o selección..."
              className="w-full pl-9 pr-9 py-2.5 bg-white border border-gray-200 rounded-xl text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary/30" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <X size={14} />
              </button>
            )}
          </div>

          {totalUnique > 0 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {totalUnique} código{totalUnique !== 1 ? 's' : ''} · {totalCopies} copia{totalCopies !== 1 ? 's' : ''}
                {totalDupes > 0 && ` · ${totalDupes} con dupes`}
              </p>
              <div className="flex gap-2">
                <button onClick={expandAll} className="text-[11px] text-primary font-semibold active:opacity-70">
                  Abrir todo
                </button>
                <span className="text-gray-300">·</span>
                <button onClick={collapseAll} className="text-[11px] text-gray-400 font-semibold active:opacity-70">
                  Cerrar todo
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 max-w-lg mx-auto w-full space-y-5 pb-6">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="card h-12 animate-pulse bg-gray-200" />
              ))}
            </div>
          ) : structure.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm">
                {search ? 'Sin resultados para tu búsqueda.' :
                  tab === 'pegar' ? 'Mazo vacío — ¡agrega monas!' :
                  tab === 'mis' ? 'No tienes repetidas.' :
                  `${otherUser} no tiene repetidas.`}
              </p>
            </div>
          ) : (
            structure.map(({ groupId, groupLabel, countries }) => (
              <div key={groupId}>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  {groupLabel}
                </p>
                <div className="space-y-1.5">
                  {countries.map(country => (
                    <CountryBlock
                      key={country.sectionCode}
                      country={country}
                      tab={tab}
                      slots={slots}
                      isExpanded={expanded.has(country.sectionCode)}
                      onToggle={() => toggleExpand(country.sectionCode)}
                      onSelect={setSelectedEntry}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {selectedEntry && (
        <ActionSheet
          entry={selectedEntry}
          tab={tab}
          slots={slots}
          onClose={() => setSelectedEntry(null)}
        />
      )}
    </AppShell>
  )
}
