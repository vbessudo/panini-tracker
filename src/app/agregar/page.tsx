'use client'

import { useState, useCallback } from 'react'
import { AppShell } from '@/components/AppShell'
import { useAppStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { SECTIONS, STICKERS } from '@/data/panini-stickers'
import { buildSectionGroups } from '@/lib/grouping'
import { GroupingToggle } from '@/components/GroupingToggle'
import type { Owner, Assignment } from '@/lib/supabase'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { Grid, Hash } from 'lucide-react'

// ── Routing algorithm ─────────────────────────────────────────────────────────

async function addMona(code: string, owner: Owner, actor: Owner): Promise<Assignment> {
  const { data: slots, error: slotsErr } = await supabase
    .from('album_slots').select('album, status').eq('sticker_code', code)
  if (slotsErr) throw new Error(`Error leyendo álbum: ${slotsErr.message}`)

  const principalPegada  = slots?.find(s => s.album === 'Principal')?.status === 'Pegada'
  const secundarioPegada = slots?.find(s => s.album === 'Secundario')?.status === 'Pegada'

  const { data: inv, error: invReadErr } = await supabase
    .from('inventory').select('assignment').eq('sticker_code', code)
  if (invReadErr) throw new Error(`Error leyendo inventario: ${invReadErr.message}`)

  const principalReserved  = inv?.some(r => r.assignment === 'Principal') ?? false
  const secundarioReserved = inv?.some(r => r.assignment === 'Secundario') ?? false

  const assignment: Assignment =
    !principalPegada && !principalReserved ? 'Principal' :
    !secundarioPegada && !secundarioReserved ? 'Secundario' : 'Repetida'

  const { error: invErr } = await supabase
    .from('inventory').insert({ sticker_code: code, owner, assignment, added_by: actor })
  if (invErr) throw new Error(`Error guardando mona: ${invErr.message} (code: ${invErr.code})`)

  await supabase.from('events').insert({ actor, kind: 'add', payload: { code, owner, assignment } })
  return assignment
}

// ── Section Picker ────────────────────────────────────────────────────────────

function SectionPicker({ onPick }: { onPick: (code: string) => void }) {
  const { groupingMode } = useAppStore()
  const groups = buildSectionGroups(groupingMode)

  return (
    <div className="px-4 py-4 space-y-6">
      {groups.map(({ groupId, groupLabel, sections }) => (
        <div key={groupId}>
          <p className="group-header">{groupLabel}</p>
          <div className="space-y-1.5">
            {sections.map((s) => (
              <button key={s.code} onClick={() => onPick(s.code)}
                className="w-full flex items-center justify-between bg-white rounded-2xl px-4 py-3
                           border border-[#EEEEEE] active:bg-blushLight/60 active:border-blush
                           transition-colors shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-[11px] font-bold bg-blushLight text-accent px-2 py-0.5 rounded-lg font-mono">
                    {s.code}
                  </span>
                  <span className="text-sm font-semibold text-gray-800">{s.label}</span>
                  {s.code === 'COC' && <span className="text-amber-500 text-xs">⭐</span>}
                </div>
                <span className="text-rose font-bold text-sm">›</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Number Entry (single mode) ────────────────────────────────────────────────

const DIGIT_KEYS = ['1','2','3','4','5','6','7','8','9','','0','del']

function SingleInput({ sectionCode, currentUser, onBack, onAdded, onSwitchBatch }: {
  sectionCode: string; currentUser: Owner
  onBack: () => void
  onAdded: (code: string, assignment: Assignment, owner: Owner) => void
  onSwitchBatch: () => void
}) {
  const [numStr, setNumStr]         = useState('')
  const [owner, setOwner]           = useState<Owner>(currentUser)
  const [submitting, setSubmitting] = useState(false)
  const [shake, setShake]           = useState(false)

  const section      = SECTIONS.find(s => s.code === sectionCode)!
  const validNumbers = STICKERS.filter(s => s.section === sectionCode).map(s => s.number)
  const minN = Math.min(...validNumbers)
  const maxN = Math.max(...validNumbers)

  const handleSubmit = async () => {
    const n = parseInt(numStr, 10)
    if (isNaN(n) || !validNumbers.includes(n)) {
      setShake(true); setTimeout(() => setShake(false), 600)
      toast.error(`Número inválido para ${sectionCode} (${minN}–${maxN})`); return
    }
    const code = sectionCode === 'FWC' && n === 0 ? 'FWC00' : sectionCode + String(n)
    const mona = STICKERS.find(s => s.code === code)
    if (!mona) { toast.error(`Mona ${code} no encontrada`); return }

    setSubmitting(true)
    try {
      const assignment = await addMona(code, owner, currentUser)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(20)
      const emoji = assignment === 'Principal' ? '🅐' : assignment === 'Secundario' ? '🅑' : '🔄'
      toast.success(`${emoji} ${code} → ${assignment} (${owner})`, { description: mona.display_name })
      onAdded(code, assignment, owner)
      setNumStr('')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error('Error al agregar la mona', { description: msg })
    } finally { setSubmitting(false) }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-primary px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-white/70 active:text-white">‹</button>
          <span className="text-white font-bold">{section.code} — {section.label}</span>
        </div>
        <button onClick={onSwitchBatch}
          className="flex items-center gap-1.5 bg-white/15 text-white text-xs font-semibold px-3 py-1.5 rounded-full active:bg-white/25">
          <Grid size={13} /> Selección múltiple
        </button>
      </div>

      <div className={cn('flex-1 flex flex-col items-center justify-center gap-2 px-4', shake && 'shake-anim')}>
        <p className="text-gray-400 text-sm">Número de la mona</p>
        <div className={cn('text-6xl font-bold tabular-nums min-h-[80px] flex items-center',
          numStr ? 'text-primary' : 'text-gray-200', shake && 'text-red-500')}>
          {numStr || '__'}
        </div>
        <p className="text-xs text-gray-400">Rango válido: {minN}–{maxN}</p>
        <div className="flex gap-2 mt-2">
          {(['Simon','Paul'] as Owner[]).map((u) => (
            <button key={u} onClick={() => setOwner(u)}
              className={cn('px-5 py-2 rounded-full font-semibold text-sm transition-all',
                owner === u ? u === 'Simon' ? 'bg-simon text-white' : 'bg-paul text-white'
                  : 'bg-gray-100 text-gray-500')}>
              {u === 'Simon' ? '🟦' : '🟩'} {u}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="grid grid-cols-3 gap-2 mb-3">
          {DIGIT_KEYS.map((key) => {
            if (key === '') return <div key="empty" />
            if (key === 'del') return (
              <button key="del" onPointerDown={() => setNumStr(p => p.slice(0,-1))}
                className="bg-gray-100 text-gray-700 rounded-2xl h-14 flex items-center justify-center text-xl active:bg-gray-200">⌫</button>
            )
            return (
              <button key={key} onPointerDown={() => setNumStr(p => p.length >= 2 ? p : p + key)}
                className="bg-gray-100 text-gray-800 rounded-2xl h-14 flex items-center justify-center text-2xl font-semibold active:bg-gray-200">
                {key}
              </button>
            )
          })}
        </div>
        <button onClick={handleSubmit} disabled={submitting || numStr.length === 0}
          className="btn-primary w-full text-lg py-4 disabled:opacity-50">
          {submitting ? 'Guardando…' : '✓ Agregar mona'}
        </button>
      </div>

      <style>{`
        @keyframes panini-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-8px)}40%{transform:translateX(8px)}60%{transform:translateX(-8px)}80%{transform:translateX(8px)}}
        .shake-anim{animation:panini-shake 0.5s ease-in-out}
      `}</style>
    </div>
  )
}

// ── Batch Grid (multi-select mode) ────────────────────────────────────────────

function BatchGrid({ sectionCode, currentUser, onBack, onAdded, onSwitchSingle }: {
  sectionCode: string; currentUser: Owner
  onBack: () => void
  onAdded: (code: string, assignment: Assignment, owner: Owner) => void
  onSwitchSingle: () => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [owner, setOwner]       = useState<Owner>(currentUser)
  const [submitting, setSubmitting] = useState(false)

  const section      = SECTIONS.find(s => s.code === sectionCode)!
  const sectionMonas = STICKERS.filter(s => s.section === sectionCode)
    .sort((a, b) => a.number - b.number)

  const toggle = (n: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s })

  const handleSubmitAll = async () => {
    if (selected.size === 0) return
    setSubmitting(true)
    const results: string[] = []
    let errors = 0

    for (const n of Array.from(selected).sort((a,b) => a-b)) {
      const code = sectionCode === 'FWC' && n === 0 ? 'FWC00' : sectionCode + String(n)
      try {
        const assignment = await addMona(code, owner, currentUser)
        const emoji = assignment === 'Principal' ? '🅐' : assignment === 'Secundario' ? '🅑' : '🔄'
        results.push(`${emoji} ${code}`)
        onAdded(code, assignment, owner)
      } catch (err) {
        errors++
        console.error(`Error adding ${code}:`, err)
      }
    }

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(30)

    if (errors === 0) {
      toast.success(`✅ ${results.length} monas agregadas`, { description: results.join(' · ') })
    } else {
      toast.error(`${results.length} ok, ${errors} con error`)
    }

    setSelected(new Set())
    setSubmitting(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-primary px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-white/70 active:text-white">‹</button>
          <span className="text-white font-bold">{section.code} — {section.label}</span>
        </div>
        <button onClick={onSwitchSingle}
          className="flex items-center gap-1.5 bg-white/15 text-white text-xs font-semibold px-3 py-1.5 rounded-full active:bg-white/25">
          <Hash size={13} /> Una por una
        </button>
      </div>

      {/* Owner + instructions */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {selected.size === 0 ? 'Toca las monas que tienes' : `${selected.size} seleccionada${selected.size > 1 ? 's' : ''}`}
        </p>
        <div className="flex gap-1.5">
          {(['Simon','Paul'] as Owner[]).map((u) => (
            <button key={u} onClick={() => setOwner(u)}
              className={cn('px-3 py-1 rounded-full font-semibold text-xs transition-all',
                owner === u ? u === 'Simon' ? 'bg-simon text-white' : 'bg-paul text-white'
                  : 'bg-gray-100 text-gray-500')}>
              {u === 'Simon' ? '🟦' : '🟩'} {u}
            </button>
          ))}
        </div>
      </div>

      {/* Number grid */}
      <div className="flex-1 overflow-y-auto px-4 pb-2">
        <div className="grid grid-cols-5 gap-2">
          {sectionMonas.map((mona) => {
            const isSelected = selected.has(mona.number)
            const displayNum = mona.number === 0 ? '00' : String(mona.number)
            return (
              <button key={mona.number} onClick={() => toggle(mona.number)}
                className={cn(
                  'aspect-square rounded-xl flex flex-col items-center justify-center gap-0.5',
                  'border-2 transition-all active:scale-95 text-xs font-bold',
                  isSelected
                    ? 'bg-primary border-primary text-white shadow-md scale-105'
                    : mona.is_foil
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-gray-100 border-gray-200 text-gray-600'
                )}>
                <span className="text-sm font-bold">{displayNum}</span>
                {mona.is_foil && !isSelected && <span className="text-[8px] text-amber-500">✦</span>}
                {isSelected && <span className="text-[10px]">✓</span>}
              </button>
            )
          })}
        </div>

        {/* Quick select helpers */}
        <div className="flex gap-2 mt-3 flex-wrap">
          <button onClick={() => setSelected(new Set(sectionMonas.map(m => m.number)))}
            className="text-xs text-primary font-semibold bg-primary/10 px-3 py-1.5 rounded-full active:bg-primary/20">
            Seleccionar todas
          </button>
          <button onClick={() => setSelected(new Set())}
            className="text-xs text-gray-500 font-semibold bg-gray-100 px-3 py-1.5 rounded-full active:bg-gray-200">
            Limpiar
          </button>
        </div>
      </div>

      {/* Submit bar */}
      <div className="px-4 py-4 border-t border-gray-100 bg-white">
        <button onClick={handleSubmitAll}
          disabled={submitting || selected.size === 0}
          className="btn-primary w-full text-base py-4 disabled:opacity-50">
          {submitting
            ? 'Guardando…'
            : selected.size === 0
            ? 'Selecciona monas para agregar'
            : `✓ Agregar ${selected.size} mona${selected.size > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AgregarPage() {
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [mode, setMode] = useState<'single' | 'batch'>('single')
  const { currentUser, pushRecentAdd } = useAppStore()
  const qc = useQueryClient()

  const handleAdded = useCallback((code: string, assignment: Assignment, owner: Owner) => {
    qc.invalidateQueries({ queryKey: ['album-stats'] })
    qc.invalidateQueries({ queryKey: ['recent-events'] })
    pushRecentAdd({ inventoryId: '', code, assignment, owner, addedAt: Date.now() })
  }, [qc, pushRecentAdd])

  const handleBack = () => { setSelectedSection(null); setMode('single') }

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {!selectedSection ? (
          <>
            <header className="bg-primary px-4 pt-safe pb-4">
              <div className="flex items-center justify-between mb-1">
                <h1 className="text-white font-bold text-lg">Agregar monas</h1>
                <GroupingToggle />
              </div>
              <p className="text-white/70 text-sm">Elige la sección</p>
            </header>
            <div className="overflow-y-auto flex-1">
              <SectionPicker onPick={(code) => { setSelectedSection(code); setMode('single') }} />
            </div>
          </>
        ) : mode === 'single' ? (
          <SingleInput
            sectionCode={selectedSection}
            currentUser={currentUser!}
            onBack={handleBack}
            onAdded={handleAdded}
            onSwitchBatch={() => setMode('batch')}
          />
        ) : (
          <BatchGrid
            sectionCode={selectedSection}
            currentUser={currentUser!}
            onBack={handleBack}
            onAdded={handleAdded}
            onSwitchSingle={() => setMode('single')}
          />
        )}
      </div>
    </AppShell>
  )
}
