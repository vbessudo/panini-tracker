'use client'

import { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SECTIONS, STICKERS } from '@/data/panini-stickers'
import { AppShell } from '@/components/AppShell'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Owner, Assignment } from '@/lib/supabase'
import { Search, X, Plus, Trash2 } from 'lucide-react'

// ── WC group structure (shared) ───────────────────────────────────────────────

const WC_GROUP_ORDER = ['FIFA','A','B','C','D','E','F','G','H','I','J','K','L','Bonus']
const WC_GROUP_LABELS: Record<string,string> = {
  FIFA:'🏆 FIFA', Bonus:'⭐ Coca-Cola',
  A:'Grupo A',B:'Grupo B',C:'Grupo C',D:'Grupo D',E:'Grupo E',F:'Grupo F',
  G:'Grupo G',H:'Grupo H',I:'Grupo I',J:'Grupo J',K:'Grupo K',L:'Grupo L',
}

type InvRow = {
  id: string; sticker_code: string; owner: Owner; assignment: Assignment
  stickers: { section: string; section_label: string; display_name: string; number: number }
}

function useInventory() {
  const qc = useQueryClient()
  return useQuery({
    queryKey: ['inventory-cambios'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory')
        .select('*, stickers(section, section_label, display_name, number)')
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
        <p className="text-xs text-gray-400 mb-2 font-medium">Transferir monas de:</p>
        <div className="flex items-center gap-3">
          <button onClick={() => { setFromUser('Simon'); setSelected(new Set()) }}
            className={cn('flex-1 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95',
              fromUser === 'Simon' ? 'bg-simon text-white' : 'bg-gray-100 text-gray-500')}>
            🟦 Simon
          </button>
          <span className="text-gray-300 font-bold text-xl">→</span>
          <div className={cn('flex-1 py-2.5 rounded-xl font-bold text-sm text-center',
            toUser === 'Paul' ? 'bg-paul/20 text-paul border-2 border-paul/30' : 'bg-simon/20 text-simon border-2 border-simon/30')}>
            {toUser === 'Paul' ? '🟧 Paul' : '🟦 Simon'}
          </div>
          <button onClick={() => { setFromUser(toUser); setSelected(new Set()) }}
            className="text-xs text-primary font-bold bg-primary/10 px-3 py-2.5 rounded-xl active:bg-primary/20 whitespace-nowrap">
            ⇄ Invertir
          </button>
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

function MiniSectionPicker({ onPick }: { onPick: (code: string) => void }) {
  const [search, setSearch] = useState('')
  const filtered = SECTIONS.filter(s =>
    !search || s.code.toLowerCase().includes(search.toLowerCase()) || s.label.toLowerCase().includes(search.toLowerCase())
  )
  return (
    <div>
      <div className="relative mb-2">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar sección..."
          className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-xs focus:outline-none" />
      </div>
      <div className="max-h-40 overflow-y-auto space-y-0.5">
        {filtered.map(s => (
          <button key={s.code} onClick={() => onPick(s.code)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg active:bg-primary/10 text-left">
            <span className="font-mono font-bold text-xs text-gray-400 w-7">{s.code}</span>
            <span className="text-sm text-gray-700">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function Intercambios() {
  const { currentUser } = useAppStore()
  const qc = useQueryClient()
  const { data: inventory = [] } = useInventory()

  const [trader, setTrader]       = useState<Owner>(currentUser ?? 'Simon')
  const [dasSelected, setDasSelected] = useState<Set<string>>(new Set()) // inventory IDs to give away
  const [recibesQueue, setRecibesQueue] = useState<PendingMona[]>([])    // monas to receive

  // For the "recibes" mini-adder
  const [addStep, setAddStep]     = useState<'idle' | 'section' | 'number'>('idle')
  const [addSection, setAddSection] = useState<string | null>(null)
  const [addNum, setAddNum]       = useState('')

  const [submitting, setSubmitting] = useState(false)

  const myReps = inventory.filter(r => r.owner === trader && r.assignment === 'Repetida')
  const toggleDas = (id: string) =>
    setDasSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  // Add a mona to the recibes queue
  const handleAddRecibe = () => {
    if (!addSection) return
    const n = parseInt(addNum, 10)
    const validNumbers = STICKERS.filter(s => s.section === addSection).map(s => s.number)
    if (isNaN(n) || !validNumbers.includes(n)) { toast.error('Número inválido'); return }
    const code = addSection === 'FWC' && n === 0 ? 'FWC00' : addSection + String(n)
    const mona = STICKERS.find(s => s.code === code)
    if (!mona) return
    setRecibesQueue(prev => [...prev, { code, display_name: mona.display_name, section: mona.section }])
    setAddNum('')
    setAddStep('number') // stay on number step for quick sequential entry
  }

  const removeRecibe = (idx: number) =>
    setRecibesQueue(prev => prev.filter((_, i) => i !== idx))

  const handleConfirm = async () => {
    if (dasSelected.size === 0 && recibesQueue.length === 0) return
    setSubmitting(true)
    try {
      const dasIds = Array.from(dasSelected)
      const dasCodes = inventory.filter(r => dasIds.includes(r.id)).map(r => r.sticker_code)

      // 1. Remove "das" from inventory
      if (dasIds.length) {
        const { error } = await supabase.from('inventory').delete().in('id', dasIds)
        if (error) throw error
        for (const code of dasCodes) {
          await supabase.from('events').insert({
            actor: currentUser, kind: 'trade_away',
            payload: { code, from: 'Repetida', actor: currentUser, trade_type: 'external' },
          })
        }
      }

      // 2. Add "recibes" via routing algorithm
      const received: string[] = []
      for (const mona of recibesQueue) {
        try {
          const assignment = await addMona(mona.code, trader, currentUser!)
          const emoji = assignment === 'Principal' ? '🅐' : assignment === 'Secundario' ? '🅑' : '🔄'
          received.push(`${emoji} ${mona.code}`)
        } catch (err) {
          console.error('Error adding', mona.code, err)
        }
      }

      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([30, 50, 30])

      const summary = []
      if (dasIds.length) summary.push(`Diste ${dasIds.length} mona${dasIds.length > 1 ? 's' : ''}`)
      if (received.length) summary.push(`Recibiste ${received.length}: ${received.join(' ')}`)
      toast.success('✅ Intercambio registrado', { description: summary.join(' · ') })

      setDasSelected(new Set())
      setRecibesQueue([])
      setAddStep('idle')
      setAddSection(null)
      setAddNum('')
      qc.invalidateQueries({ queryKey: ['inventory-cambios'] })
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['album-stats'] })
      qc.invalidateQueries({ queryKey: ['recent-events'] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Error en el intercambio', { description: msg })
    } finally { setSubmitting(false) }
  }

  const validNums = addSection ? STICKERS.filter(s => s.section === addSection).map(s => s.number) : []
  const minN = validNums.length ? Math.min(...validNums) : 1
  const maxN = validNums.length ? Math.max(...validNums) : 20

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-4 pt-3 pb-2 bg-white border-b border-gray-100">
        <p className="text-xs text-gray-400 mb-2 font-medium">¿Quién intercambia?</p>
        <div className="flex gap-2">
          {(['Simon', 'Paul'] as Owner[]).map(u => (
            <button key={u} onClick={() => { setTrader(u); setDasSelected(new Set()) }}
              className={cn('flex-1 py-2 rounded-xl font-bold text-sm transition-all active:scale-95',
                trader === u ? u === 'Simon' ? 'bg-simon text-white' : 'bg-paul text-white'
                  : 'bg-gray-100 text-gray-500')}>
              {u === 'Simon' ? '🟦' : '🟧'} {u}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* DAS section */}
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-gray-800">🤲 Das ({dasSelected.size} seleccionada{dasSelected.size !== 1 ? 's' : ''})</h3>
            {myReps.length > 0 && (
              <button onClick={() => setDasSelected(new Set(myReps.map(r => r.id)))}
                className="text-xs text-primary font-semibold active:opacity-70">Todas</button>
            )}
          </div>

          {myReps.length === 0 ? (
            <p className="text-sm text-gray-400">{trader} no tiene repetidas para dar.</p>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto">
              {groupByWCGroup(myReps).map(({ groupId, groupLabel, sections }) => (
                <div key={groupId}>
                  <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest py-1">{groupLabel}</p>
                  {sections.map(({ sec, label, rows }) => (
                    <div key={sec} className="mb-1">
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-0.5">{label}</p>
                      {rows.map(r => {
                        const isSel = dasSelected.has(r.id)
                        return (
                          <button key={r.id} onClick={() => toggleDas(r.id)}
                            className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors',
                              isSel ? 'bg-red-50 border border-red-200' : 'active:bg-gray-50')}>
                            <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center shrink-0',
                              isSel ? 'bg-red-500 border-red-500' : 'border-gray-300')}>
                              {isSel && <span className="text-white text-[9px]">✓</span>}
                            </div>
                            <span className="font-mono font-bold text-xs text-gray-800">{r.sticker_code}</span>
                            <span className="text-xs text-gray-400 truncate">{r.stickers?.display_name}</span>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RECIBES section */}
        <div className="card">
          <h3 className="font-bold text-gray-800 mb-3">🎁 Recibes ({recibesQueue.length} mona{recibesQueue.length !== 1 ? 's' : ''})</h3>

          {/* Queued monas */}
          {recibesQueue.length > 0 && (
            <div className="space-y-1 mb-3">
              {recibesQueue.map((m, i) => (
                <div key={i} className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
                  <div>
                    <span className="font-mono font-bold text-sm text-gray-800">{m.code}</span>
                    <span className="text-xs text-gray-500 ml-2">{m.display_name}</span>
                  </div>
                  <button onClick={() => removeRecibe(i)} className="text-red-400 active:text-red-600 p-0.5">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Mini adder */}
          {addStep === 'idle' && (
            <button onClick={() => setAddStep('section')}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200
                         rounded-xl py-3 text-sm text-gray-400 font-semibold active:border-primary active:text-primary transition-colors">
              <Plus size={16} /> Agregar mona recibida
            </button>
          )}

          {addStep === 'section' && (
            <div className="border border-gray-200 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-600">Elige la sección</p>
                <button onClick={() => setAddStep('idle')} className="text-gray-400"><X size={14} /></button>
              </div>
              <MiniSectionPicker onPick={(code) => { setAddSection(code); setAddNum(''); setAddStep('number') }} />
            </div>
          )}

          {addStep === 'number' && addSection && (
            <div className="border border-gray-200 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-600">
                  <button onClick={() => setAddStep('section')} className="text-primary mr-1">‹</button>
                  {SECTIONS.find(s => s.code === addSection)?.label} · #{' '}
                  <span className="text-primary">{addNum || '?'}</span>
                  <span className="text-gray-400 ml-1">({minN}–{maxN})</span>
                </p>
                <button onClick={() => { setAddStep('idle'); setAddSection(null); setAddNum('') }} className="text-gray-400"><X size={14} /></button>
              </div>
              <div className="grid grid-cols-5 gap-1">
                {validNums.map(n => {
                  const displayN = n === 0 ? '00' : String(n)
                  const code = addSection === 'FWC' && n === 0 ? 'FWC00' : addSection + String(n)
                  const alreadyQueued = recibesQueue.some(m => m.code === code)
                  return (
                    <button key={n} disabled={alreadyQueued}
                      onClick={() => {
                        setAddNum(displayN)
                        const mona = STICKERS.find(s => s.code === code)
                        if (mona) {
                          setRecibesQueue(prev => [...prev, { code, display_name: mona.display_name, section: mona.section }])
                          setAddNum('')
                        }
                      }}
                      className={cn('aspect-square rounded-lg text-xs font-bold border transition-all',
                        alreadyQueued ? 'bg-green-100 border-green-300 text-green-600 cursor-default'
                          : 'bg-gray-100 border-gray-200 text-gray-700 active:bg-primary active:text-white active:border-primary')}>
                      {displayN}
                    </button>
                  )
                })}
              </div>
              <button onClick={() => setAddStep('section')}
                className="w-full text-xs text-primary font-semibold py-1.5 active:opacity-70">
                + Agregar otra sección
              </button>
            </div>
          )}
        </div>

        {/* Summary + confirm */}
        {(dasSelected.size > 0 || recibesQueue.length > 0) && (
          <div className="card bg-primary/5 border-primary/20">
            <p className="text-sm font-bold text-primary mb-1">Resumen del intercambio</p>
            <p className="text-xs text-gray-600">
              {dasSelected.size > 0 && `🤲 Das: ${dasSelected.size} mona${dasSelected.size > 1 ? 's' : ''}`}
              {dasSelected.size > 0 && recibesQueue.length > 0 && ' · '}
              {recibesQueue.length > 0 && `🎁 Recibes: ${recibesQueue.length} mona${recibesQueue.length > 1 ? 's' : ''}`}
            </p>
            {dasSelected.size > 0 && recibesQueue.length > 0 && dasSelected.size !== recibesQueue.length && (
              <p className="text-[11px] text-amber-600 mt-1 font-medium">
                Intercambio {dasSelected.size}-por-{recibesQueue.length} — OK ✓
              </p>
            )}
          </div>
        )}

        <button onClick={handleConfirm}
          disabled={submitting || (dasSelected.size === 0 && recibesQueue.length === 0)}
          className="btn-primary w-full py-4 text-base disabled:opacity-50 mb-4">
          {submitting ? 'Registrando…' : '✓ Confirmar intercambio'}
        </button>
      </div>
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
              { key: 'transferencias', label: '⇄ Entre Simon y Paul' },
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
