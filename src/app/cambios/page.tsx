'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SECTIONS, STICKERS } from '@/data/panini-stickers'
import { AppShell } from '@/components/AppShell'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Owner, Assignment } from '@/lib/supabase'
import { Search, X, Trash2, ChevronDown } from 'lucide-react'

// ── WC group structure (shared) ───────────────────────────────────────────────

const WC_GROUP_ORDER = ['FIFA','A','B','C','D','E','F','G','H','I','J','K','L','Bonus']
const WC_GROUP_LABELS: Record<string,string> = {
  FIFA:'🏆 FIFA', Bonus:'⭐ Coca-Cola',
  A:'Grupo A',B:'Grupo B',C:'Grupo C',D:'Grupo D',E:'Grupo E',F:'Grupo F',
  G:'Grupo G',H:'Grupo H',I:'Grupo I',J:'Grupo J',K:'Grupo K',L:'Grupo L',
}

type InvRow = {
  id: string; sticker_code: string; owner: Owner; assignment: Assignment
  stickers: { section: string; section_label: string; display_name: string; number: number; is_foil: boolean }
}

function useInventory() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['inventory-cambios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*, stickers(section, section_label, display_name, number, is_foil)')
        .order('sticker_code')
      if (error) throw error
      return data as InvRow[]
    },
  })
}

function groupByWCGroup(rows: InvRow[]) {
  const bySec: Record<string, InvRow[]> = {}
  rows.forEach(r => { const s = r.stickers?.section ?? '??'; if (!bySec[s]) bySec[s] = []; bySec[s].push(r) })
  const result: Array<{ groupId: string; groupLabel: string; sections: Array<{ sec: string; label: string; rows: InvRow[] }> }> = []
  WC_GROUP_ORDER.forEach(groupId => {
    const groupSecs = SECTIONS.filter(s => (s.group ?? (s.code === 'FWC' ? 'FIFA' : 'Bonus')) === groupId)
      .filter(s => bySec[s.code]).map(s => ({ sec: s.code, label: s.label, rows: bySec[s.code] }))
    if (groupSecs.length) result.push({ groupId, groupLabel: WC_GROUP_LABELS[groupId], sections: groupSecs })
  })
  return result
}

// ── Routing algorithm (same as agregar) ──────────────────────────────────────

async function addMona(code: string, owner: Owner, actor: Owner): Promise<Assignment> {
  const { data: slots, error: slotsErr } = await supabase
    .from('album_slots').select('album, status').eq('sticker_code', code)
  if (slotsErr) throw new Error(slotsErr.message)
  const principalPegada  = slots?.find(s => s.album === 'Principal')?.status === 'Pegada'
  const secundarioPegada = slots?.find(s => s.album === 'Secundario')?.status === 'Pegada'
  const { data: inv, error: invErr } = await supabase
    .from('inventory').select('assignment').eq('sticker_code', code)
  if (invErr) throw new Error(invErr.message)
  const principalReserved  = inv?.some(r => r.assignment === 'Principal') ?? false
  const secundarioReserved = inv?.some(r => r.assignment === 'Secundario') ?? false
  const assignment: Assignment = !principalPegada && !principalReserved ? 'Principal'
    : !secundarioPegada && !secundarioReserved ? 'Secundario' : 'Repetida'
  const { error } = await supabase.from('inventory')
    .insert({ sticker_code: code, owner, assignment, added_by: actor })
  if (error) throw new Error(error.message)
  return assignment
}

// ── TAB 1: Transferencias ─────────────────────────────────────────────────────

function Transferencias() {
  const { currentUser } = useAppStore()
  const qc = useQueryClient()
  const { data: inventory = [], isLoading } = useInventory()

  const [fromUser, setFromUser] = useState<Owner>(currentUser ?? 'Simon')
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [search, setSearch]       = useState('')
  const [submitting, setSubmitting] = useState(false)

  const toUser: Owner = fromUser === 'Simon' ? 'Paul' : 'Simon'

  // All monas from the "from" user (any assignment)
  const fromMonas = inventory.filter(r => r.owner === fromUser)
  const filtered  = fromMonas.filter(r =>
    !search || r.sticker_code.toLowerCase().includes(search.toLowerCase()) ||
    r.stickers?.section_label?.toLowerCase().includes(search.toLowerCase())
  )

  const toggle = (id: string) =>
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  const selectAll = () => setSelected(new Set(filtered.map(r => r.id)))
  const clearAll  = () => setSelected(new Set())

  const handleTransfer = async () => {
    if (!selected.size) return
    setSubmitting(true)
    try {
      const ids = Array.from(selected)
      const { error } = await supabase.from('inventory').update({ owner: toUser }).in('id', ids)
      if (error) throw error

      const codes = inventory.filter(r => ids.includes(r.id)).map(r => r.sticker_code)
      await supabase.from('events').insert({
        actor: currentUser, kind: 'move',
        payload: { type: 'owner_transfer', from: fromUser, to: toUser, codes },
      })

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(30)
      toast.success(`✅ ${ids.length} mona${ids.length > 1 ? 's' : ''} transferida${ids.length > 1 ? 's' : ''} a ${toUser}`)
      setSelected(new Set())
      qc.invalidateQueries({ queryKey: ['inventory-cambios'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['album-stats'] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Error en la transferencia', { description: msg })
    } finally { setSubmitting(false) }
  }

  return (
    <div className="flex flex-col h-full">
      {/* From/To selector */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">De (entrega)</p>
            <div className="flex gap-2">
              {(['Simon', 'Paul'] as Owner[]).map(u => (
                <button key={u} onClick={() => { setFromUser(u); setSelected(new Set()) }}
                  className={cn('flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95',
                    fromUser === u
                      ? u === 'Simon' ? 'bg-simon text-white' : 'bg-paul text-white'
                      : 'bg-gray-100 text-gray-500')}>
                  {u === 'Simon' ? '🟦' : '🟩'} {u}
                </button>
              ))}
            </div>
          </div>
          <div className="text-gray-300 font-bold text-2xl pt-4">→</div>
          <div className="flex-1">
            <p className="text-[10px] text-gray-400 font-medium mb-1.5 uppercase tracking-wider">Para (recibe)</p>
            <div className={cn('py-2.5 rounded-xl font-bold text-sm text-center border-2',
              toUser === 'Simon'
                ? 'border-simon/40 bg-simon/10 text-simon'
                : 'border-paul/40 bg-paul/10 text-paul')}>
              {toUser === 'Simon' ? '🟦 Simon' : '🟩 Paul'}
            </div>
          </div>
        </div>
      </div>

      {/* Search + select helpers */}
      <div className="px-4 pt-3 pb-2 space-y-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código o selección..."
            className="w-full pl-9 pr-9 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={14} /></button>}
        </div>
        <div className="flex gap-2 text-xs">
          <button onClick={selectAll} className="text-primary font-semibold bg-primary/10 px-3 py-1.5 rounded-full active:bg-primary/20">
            Seleccionar todas ({filtered.length})
          </button>
          {selected.size > 0 && (
            <button onClick={clearAll} className="text-gray-500 font-semibold bg-gray-100 px-3 py-1.5 rounded-full active:bg-gray-200">
              Limpiar ({selected.size})
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 pb-2">
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_,i) => <div key={i} className="card h-12 animate-pulse bg-gray-200"/>)}</div>
        ) : fromMonas.length === 0 ? (
          <p className="text-center text-gray-400 py-12 text-sm">{fromUser} no tiene monas en el mazo.</p>
        ) : (
          groupByWCGroup(filtered).map(({ groupId, groupLabel, sections }) => (
            <div key={groupId} className="mb-4">
              <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mb-1.5">{groupLabel}</p>
              {sections.map(({ sec, label, rows }) => (
                <div key={sec} className="mb-2">
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
                  <div className="space-y-1">
                    {rows.map(r => {
                      const isSel = selected.has(r.id)
                      return (
                        <button key={r.id} onClick={() => toggle(r.id)}
                          className={cn('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 transition-all active:scale-[0.98]',
                            isSel ? 'bg-primary/5 border-primary/40' : 'bg-white border-gray-100')}>
                          <div className={cn('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                            isSel ? 'bg-primary border-primary' : 'border-gray-300')}>
                            {isSel && <span className="text-white text-[10px] font-bold">✓</span>}
                          </div>
                          <div className="flex-1 text-left">
                            <span className="font-mono font-bold text-sm text-gray-800">{r.sticker_code}</span>
                            <span className="text-xs text-gray-400 ml-2">{r.stickers?.display_name}</span>
                          </div>
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                            r.assignment === 'Principal' ? 'bg-primary/10 text-primary'
                            : r.assignment === 'Secundario' ? 'bg-accent/10 text-accent'
                            : 'bg-gray-100 text-gray-500')}>
                            {r.assignment === 'Principal' ? '🅐' : r.assignment === 'Secundario' ? '🅑' : '🔄'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Confirm bar */}
      <div className="px-4 py-4 border-t border-gray-100 bg-white">
        <button onClick={handleTransfer} disabled={submitting || selected.size === 0}
          className="btn-primary w-full py-4 text-base disabled:opacity-50">
          {submitting ? 'Transfiriendo…'
            : selected.size === 0 ? 'Selecciona monas para transferir'
            : `✓ Transferir ${selected.size} mona${selected.size > 1 ? 's' : ''} a ${toUser}`}
        </button>
      </div>
    </div>
  )
}


// ── TAB 2: Intercambios ───────────────────────────────────────────────────────

type PendingMona = { code: string; display_name: string; section: string }

// Tradeable pool entry (deduplicated by code, may hold multiple inventory rows)
type TradeEntry = {
  sticker_code: string
  display_name: string
  number: number
  is_foil: boolean
  rows: InvRow[]          // all tradeable copies of this code
  count: number
  owners: Owner[]         // who physically owns each copy
  reasons: string[]       // why it's tradeable ('repetida' | 'paul_deck' | 'principal_done')
}

type TradeCountry = {
  sectionCode: string
  sectionLabel: string
  entries: TradeEntry[]
  totalCopies: number
}

type TradeGroup = {
  groupId: string
  groupLabel: string
  countries: TradeCountry[]
}

function buildTradeStructure(
  inventory: InvRow[],
  slots: Record<string, string>,   // "code-album" → status
): TradeGroup[] {
  // Determine which rows are tradeable
  const tradeable = inventory.filter(r => {
    // Rule 1: explicitly a repetida
    if (r.assignment === 'Repetida') return true
    // Rule 2: Paul's deck is always available
    if (r.owner === 'Paul') return true
    // Rule 3: Principal is already pegada — on-hand copies are surplus
    if (slots[`${r.sticker_code}-Principal`] === 'Pegada') return true
    return false
  })

  // Deduplicate by sticker_code
  const byCode = new Map<string, TradeEntry>()
  for (const r of tradeable) {
    const existing = byCode.get(r.sticker_code)
    const reason = r.assignment === 'Repetida' ? 'repetida'
      : r.owner === 'Paul' ? 'paul_deck' : 'principal_done'
    if (existing) {
      existing.rows.push(r)
      existing.count++
      if (!existing.owners.includes(r.owner)) existing.owners.push(r.owner)
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason)
    } else {
      const mona = STICKERS.find(s => s.code === r.sticker_code)
      byCode.set(r.sticker_code, {
        sticker_code: r.sticker_code,
        display_name: r.stickers?.display_name ?? r.sticker_code,
        number: r.stickers?.number ?? 0,
        is_foil: r.stickers?.is_foil ?? false,
        rows: [r],
        count: 1,
        owners: [r.owner],
        reasons: [reason],
      })
    }
  }

  // Group by WC group → country
  const bySec: Record<string, TradeEntry[]> = {}
  for (const entry of Array.from(byCode.values())) {
    const mona = STICKERS.find(s => s.code === entry.sticker_code)
    const sec = mona?.section ?? '??'
    if (!bySec[sec]) bySec[sec] = []
    bySec[sec].push(entry)
  }
  for (const entries of Object.values(bySec)) {
    entries.sort((a, b) => a.number - b.number)
  }

  return WC_GROUP_ORDER.flatMap(groupId => {
    const groupSections = SECTIONS.filter(
      s => (s.group ?? (s.code === 'FWC' ? 'FIFA' : 'Bonus')) === groupId && bySec[s.code]
    )
    if (!groupSections.length) return []
    const countries: TradeCountry[] = groupSections.map(s => ({
      sectionCode: s.code,
      sectionLabel: s.label,
      entries: bySec[s.code],
      totalCopies: bySec[s.code].reduce((sum, e) => sum + e.count, 0),
    }))
    return [{ groupId, groupLabel: WC_GROUP_LABELS[groupId], countries }]
  })
}

// Reason labels
const REASON_LABEL: Record<string, string> = {
  repetida: '🔄 Repetida',
  paul_deck: '🟩 Mazo Paul',
  principal_done: '🅐 Principal ✓',
}

function Intercambios() {
  const { currentUser } = useAppStore()
  const qc = useQueryClient()
  const { data: inventory = [] } = useInventory()

  // Fetch album slots to determine which Principal slots are pegada
  const { data: slotsData } = useQuery({
    queryKey: ['all-slots-status'],
    queryFn: async () => {
      const { data } = await supabase.from('album_slots').select('sticker_code, album, status')
      return (data ?? []).reduce<Record<string, string>>((acc, r) => {
        acc[`${r.sticker_code}-${r.album}`] = r.status; return acc
      }, {})
    },
  })
  const slots = slotsData ?? {}

  const [dasSelected, setDasSelected] = useState<Set<string>>(new Set()) // inventory row IDs
  const [recibesQueue, setRecibesQueue] = useState<PendingMona[]>([])
  const [dasExpanded, setDasExpanded] = useState<Set<string>>(new Set())
  const [addSection, setAddSection] = useState<string | null>(null)
  const [addSearch, setAddSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const tradeStructure = buildTradeStructure(inventory, slots)
  const totalTradeable = tradeStructure.reduce((sum, g) =>
    sum + g.countries.reduce((s2, c) => s2 + c.totalCopies, 0), 0)

  const toggleDasExpand = (code: string) =>
    setDasExpanded(prev => { const s = new Set(prev); s.has(code) ? s.delete(code) : s.add(code); return s })

  // Select/deselect all copies of a code
  const toggleCode = (entry: TradeEntry) => {
    const ids = entry.rows.map(r => r.id)
    const allSelected = ids.every(id => dasSelected.has(id))
    setDasSelected(prev => {
      const s = new Set(prev)
      if (allSelected) ids.forEach(id => s.delete(id))
      else ids.forEach(id => s.add(id))
      return s
    })
  }

  const removeRecibe = (idx: number) => setRecibesQueue(prev => prev.filter((_, i) => i !== idx))

  const filteredSections = SECTIONS.filter(s =>
    !addSearch || s.code.toLowerCase().includes(addSearch.toLowerCase()) ||
    s.label.toLowerCase().includes(addSearch.toLowerCase())
  )

  const handleConfirm = async () => {
    if (dasSelected.size === 0 && recibesQueue.length === 0) return
    setSubmitting(true)
    try {
      const dasIds = Array.from(dasSelected)
      const dasCodes = inventory.filter(r => dasIds.includes(r.id)).map(r => r.sticker_code)

      if (dasIds.length) {
        const { error } = await supabase.from('inventory').delete().in('id', dasIds)
        if (error) throw error
        for (const code of dasCodes) {
          await supabase.from('events').insert({
            actor: currentUser, kind: 'trade_away',
            payload: { code, from: 'trade', actor: currentUser },
          })
        }
      }

      const received: string[] = []
      for (const mona of recibesQueue) {
        try {
          const assignment = await addMona(mona.code, currentUser!, currentUser!)
          const emoji = assignment === 'Principal' ? '🅐' : assignment === 'Secundario' ? '🅑' : '🔄'
          received.push(`${emoji} ${mona.code}`)
        } catch (err) { console.error('Error adding', mona.code, err) }
      }

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([30, 50, 30])

      const summary = []
      if (dasIds.length)    summary.push(`Diste ${dasIds.length} mona${dasIds.length > 1 ? 's' : ''}`)
      if (received.length)  summary.push(`Recibiste ${received.length}: ${received.join(' ')}`)
      toast.success('✅ Intercambio registrado', { description: summary.join(' · ') })

      setDasSelected(new Set())
      setRecibesQueue([])
      setAddSection(null)
      qc.invalidateQueries({ queryKey: ['inventory-cambios'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['inventory-mazo'] })
      qc.invalidateQueries({ queryKey: ['album-stats'] })
      qc.invalidateQueries({ queryKey: ['recent-events'] })
      qc.invalidateQueries({ queryKey: ['all-slots-status'] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Error en el intercambio', { description: msg })
    } finally { setSubmitting(false) }
  }

  const validNums = addSection
    ? STICKERS.filter(s => s.section === addSection).map(s => s.number)
    : []

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* ── DAS section ──────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-bold text-gray-800">
              🤲 Das ({dasSelected.size} seleccionada{dasSelected.size !== 1 ? 's' : ''})
            </h3>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {totalTradeable} disponibles · repetidas + mazo de Paul + principal ya pegada
            </p>
          </div>
          {dasSelected.size > 0 && (
            <button onClick={() => setDasSelected(new Set())}
              className="text-xs text-gray-400 font-semibold active:opacity-70">Limpiar</button>
          )}
        </div>

        {tradeStructure.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-sm text-gray-400">No hay monas disponibles para intercambiar.</p>
            <p className="text-xs text-gray-300 mt-1">Agrega monas o pega las del álbum Principal primero.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {tradeStructure.map(({ groupId, groupLabel, countries }) => (
              <div key={groupId}>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{groupLabel}</p>
                <div className="space-y-1">
                  {countries.map(country => {
                    const isExpanded = dasExpanded.has(country.sectionCode)
                    const selectedInCountry = country.entries.reduce((sum, e) =>
                      sum + e.rows.filter(r => dasSelected.has(r.id)).length, 0)

                    return (
                      <div key={country.sectionCode}
                        className={cn('rounded-2xl overflow-hidden border transition-all',
                          isExpanded ? 'border-primary/30' : 'border-gray-100 bg-white')}>

                        {/* Country header */}
                        <button onClick={() => toggleDasExpand(country.sectionCode)}
                          className={cn('w-full flex items-center justify-between px-4 py-3',
                            isExpanded ? 'bg-primary/5' : 'bg-white active:bg-gray-50')}>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-bold text-xs text-gray-400 shrink-0">{country.sectionCode}</span>
                            <span className="font-semibold text-sm text-gray-800 truncate">{country.sectionLabel}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {selectedInCountry > 0 && (
                              <span className="text-[10px] font-bold bg-primary text-white px-2 py-0.5 rounded-full">
                                {selectedInCountry} sel.
                              </span>
                            )}
                            <span className="text-xs text-gray-400 tabular-nums">{country.totalCopies} disp.</span>
                            <ChevronDown size={14} className={cn('text-gray-400 transition-transform duration-200',
                              isExpanded && 'rotate-180')} />
                          </div>
                        </button>

                        {/* Expanded entries */}
                        {isExpanded && (
                          <div className="border-t border-primary/10 bg-white divide-y divide-gray-50">
                            {country.entries.map(entry => {
                              const allSelected = entry.rows.every(r => dasSelected.has(r.id))
                              const someSelected = entry.rows.some(r => dasSelected.has(r.id))
                              const selectedCount = entry.rows.filter(r => dasSelected.has(r.id)).length

                              return (
                                <button key={entry.sticker_code} onClick={() => toggleCode(entry)}
                                  className={cn('w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left',
                                    allSelected ? 'bg-primary/5' : someSelected ? 'bg-primary/3' : 'active:bg-gray-50')}>
                                  {/* Checkbox */}
                                  <div className={cn('w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                                    allSelected ? 'bg-primary border-primary'
                                    : someSelected ? 'bg-primary/40 border-primary/40'
                                    : 'border-gray-300')}>
                                    {(allSelected || someSelected) && (
                                      <span className="text-white text-[9px] font-bold">✓</span>
                                    )}
                                  </div>

                                  {/* Code + name */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-bold text-sm text-gray-800">{entry.sticker_code}</span>
                                      {entry.is_foil && <span className="text-[9px] text-amber-500">✦</span>}
                                    </div>
                                    <p className="text-xs text-gray-400 truncate">{entry.display_name}</p>
                                  </div>

                                  {/* Right side: reasons + count */}
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {entry.reasons.map(r => (
                                      <span key={r} className="text-[9px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                        {REASON_LABEL[r]}
                                      </span>
                                    ))}
                                    {/* Owner dots */}
                                    {entry.owners.includes('Simon') && (
                                      <span className="w-2 h-2 rounded-full bg-simon inline-block" />
                                    )}
                                    {entry.owners.includes('Paul') && (
                                      <span className="w-2 h-2 rounded-full bg-paul inline-block" />
                                    )}
                                    {/* Count if > 1 */}
                                    {entry.count > 1 && (
                                      <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-full min-w-[22px] text-center',
                                        selectedCount > 0 ? 'bg-primary text-white' : 'bg-amber-100 text-amber-700')}>
                                        {selectedCount > 0 ? `${selectedCount}/${entry.count}` : `×${entry.count}`}
                                      </span>
                                    )}
                                  </div>
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── RECIBES section ───────────────────────────────────────────────── */}
      <div className="px-4 py-3">
        <h3 className="font-bold text-gray-800 mb-2">
          🎁 Recibes ({recibesQueue.length} mona{recibesQueue.length !== 1 ? 's' : ''})
        </h3>

        {/* Queued monas */}
        {recibesQueue.length > 0 && (
          <div className="space-y-1 mb-3">
            {recibesQueue.map((m, i) => (
              <div key={i} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                <div>
                  <span className="font-mono font-bold text-sm text-gray-800">{m.code}</span>
                  <span className="text-xs text-gray-500 ml-2">{m.display_name}</span>
                </div>
                <button onClick={() => removeRecibe(i)} className="text-red-400 active:text-red-600 p-1">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Section picker */}
        {!addSection ? (
          <div className="space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={addSearch} onChange={e => setAddSearch(e.target.value)}
                placeholder="Buscar sección para agregar..."
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto">
              {filteredSections.map(s => (
                <button key={s.code} onClick={() => { setAddSection(s.code); setAddSearch('') }}
                  className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-3 py-2.5 active:bg-primary/5 text-left">
                  <span className="font-mono font-bold text-xs text-gray-400 w-7 shrink-0">{s.code}</span>
                  <span className="text-xs font-medium text-gray-700 truncate">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Number grid for selected section */
          <div className="border border-gray-200 rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-primary/5 border-b border-primary/10">
              <div className="flex items-center gap-2">
                <button onClick={() => setAddSection(null)} className="text-primary text-sm">‹</button>
                <span className="font-bold text-sm text-gray-800">
                  {SECTIONS.find(s => s.code === addSection)?.label}
                </span>
              </div>
              <button onClick={() => setAddSection(null)} className="text-gray-400"><X size={14} /></button>
            </div>
            <div className="p-3 grid grid-cols-5 gap-1.5">
              {validNums.map(n => {
                const displayN = n === 0 ? '00' : String(n)
                const code = addSection === 'FWC' && n === 0 ? 'FWC00' : addSection + String(n)
                const alreadyQueued = recibesQueue.some(m => m.code === code)
                const monaData = STICKERS.find(s => s.code === code)
                return (
                  <button key={n} disabled={alreadyQueued}
                    onClick={() => {
                      if (monaData) {
                        setRecibesQueue(prev => [...prev, {
                          code, display_name: monaData.display_name, section: monaData.section
                        }])
                      }
                    }}
                    className={cn('aspect-square rounded-xl text-xs font-bold border-2 flex items-center justify-center transition-all',
                      alreadyQueued
                        ? 'bg-green-100 border-green-400 text-green-700'
                        : 'bg-gray-100 border-gray-200 text-gray-700 active:bg-primary active:text-white active:border-primary')}>
                    {alreadyQueued ? '✓' : displayN}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Summary + Confirm ─────────────────────────────────────────────── */}
      {(dasSelected.size > 0 || recibesQueue.length > 0) && (
        <div className="px-4 pb-2">
          <div className="card bg-primary/5 border-primary/20 mb-3">
            <p className="text-sm font-bold text-primary mb-0.5">Resumen</p>
            <p className="text-xs text-gray-600">
              {dasSelected.size > 0 && `🤲 Das: ${dasSelected.size} mona${dasSelected.size > 1 ? 's' : ''}`}
              {dasSelected.size > 0 && recibesQueue.length > 0 && '  ·  '}
              {recibesQueue.length > 0 && `🎁 Recibes: ${recibesQueue.length} mona${recibesQueue.length > 1 ? 's' : ''}`}
            </p>
            {dasSelected.size !== recibesQueue.length && dasSelected.size > 0 && recibesQueue.length > 0 && (
              <p className="text-[11px] text-amber-600 mt-1 font-medium">
                Intercambio {dasSelected.size}-por-{recibesQueue.length} ✓
              </p>
            )}
          </div>
          <button onClick={handleConfirm} disabled={submitting}
            className="btn-primary w-full py-4 text-base disabled:opacity-50">
            {submitting ? 'Registrando…' : '✓ Confirmar intercambio'}
          </button>
        </div>
      )}

      <div className="h-6" /> {/* bottom padding */}
    </div>
  )
}

// ── Main Cambios Page ─────────────────────────────────────────────────────────

export default function CambiosPage() {
  const [tab, setTab] = useState<'transferencias' | 'intercambios'>('transferencias')

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-primary px-4 pt-safe-top pb-0">
          <h1 className="text-white font-bold text-lg pt-4 pb-2">Cambios</h1>
          <div className="flex">
            {[
              { key: 'transferencias', label: '⇄ Internas' },
              { key: 'intercambios',   label: '🤝 Con otras personas' },
            ].map(({ key, label }) => (
              <button key={key} onClick={() => setTab(key as typeof tab)}
                className={cn('flex-1 py-3 text-xs font-semibold border-b-2 transition-colors',
                  tab === key ? 'text-white border-white' : 'text-white/50 border-transparent')}>
                {label}
              </button>
            ))}
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex flex-col">
          {tab === 'transferencias' ? <Transferencias /> : <Intercambios />}
        </div>
      </div>
    </AppShell>
  )
}
