'use client'

import { useState, useCallback } from 'react'
import { AppShell } from '@/components/AppShell'
import { useAppStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { SECTIONS, STICKERS } from '@/data/panini-stickers'
import type { Owner, Assignment } from '@/lib/supabase'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '@/lib/utils'

// ── Routing algorithm (spec §6) ──────────────────────────────────────────────

async function addMona(code: string, owner: Owner, actor: Owner): Promise<Assignment> {
  const { data: slots, error: slotsErr } = await supabase
    .from('album_slots')
    .select('album, status')
    .eq('sticker_code', code)

  if (slotsErr) throw new Error(`Error leyendo álbum: ${slotsErr.message}`)

  const principalSlot    = slots?.find(s => s.album === 'Principal')
  const secundarioSlot   = slots?.find(s => s.album === 'Secundario')
  const principalPegada  = principalSlot?.status === 'Pegada'
  const secundarioPegada = secundarioSlot?.status === 'Pegada'

  const { data: inv, error: invReadErr } = await supabase
    .from('inventory')
    .select('assignment')
    .eq('sticker_code', code)

  if (invReadErr) throw new Error(`Error leyendo inventario: ${invReadErr.message}`)

  const principalReserved  = inv?.some(r => r.assignment === 'Principal') ?? false
  const secundarioReserved = inv?.some(r => r.assignment === 'Secundario') ?? false

  let assignment: Assignment
  if (!principalPegada && !principalReserved) {
    assignment = 'Principal'
  } else if (!secundarioPegada && !secundarioReserved) {
    assignment = 'Secundario'
  } else {
    assignment = 'Repetida'
  }

  const { error: invErr } = await supabase
    .from('inventory')
    .insert({ sticker_code: code, owner, assignment, added_by: actor })

  if (invErr) throw new Error(`Error guardando mona: ${invErr.message} (code: ${invErr.code})`)

  const { error: evtErr } = await supabase.from('events').insert({
    actor,
    kind: 'add',
    payload: { code, owner, assignment },
  })

  if (evtErr) console.warn('Event log failed (non-critical):', evtErr.message)

  return assignment
}

// ── Step 1: Section Picker ───────────────────────────────────────────────────

const GROUPS = ['FIFA', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'Bonus']

function SectionPicker({ onPick }: { onPick: (code: string) => void }) {
  const byGroup = SECTIONS.reduce<Record<string, typeof SECTIONS>>((acc, s) => {
    const g = s.group ?? (s.code === 'FWC' ? 'FIFA' : 'Bonus')
    if (!acc[g]) acc[g] = []
    acc[g].push(s)
    return acc
  }, {})

  return (
    <div className="px-4 py-4 space-y-5">
      {GROUPS.map((g) => {
        const secs = byGroup[g]
        if (!secs || secs.length === 0) return null
        return (
          <div key={g}>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
              {g === 'FIFA' ? 'FIFA World Cup' : g === 'Bonus' ? 'Bonus Coca-Cola' : `Grupo ${g}`}
            </p>
            <div className="space-y-1">
              {secs.map((s) => (
                <button
                  key={s.code}
                  onClick={() => onPick(s.code)}
                  className="w-full flex items-center justify-between bg-white rounded-xl px-4 py-3
                             border border-gray-100 active:bg-primary/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono font-bold text-gray-400 w-8">{s.code}</span>
                    <span className="text-sm font-medium text-gray-800">{s.label}</span>
                    {s.code === 'COC' && <span className="text-amber-500">⭐</span>}
                  </div>
                  <span className="text-xs text-gray-400 font-medium">›</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Step 2: Number Input ─────────────────────────────────────────────────────

const DIGIT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']

function NumberInput({
  sectionCode,
  currentUser,
  onBack,
  onAdded,
}: {
  sectionCode: string
  currentUser: Owner
  onBack: () => void
  onAdded: (code: string, assignment: Assignment, owner: Owner) => void
}) {
  const [numStr, setNumStr]         = useState('')
  const [owner, setOwner]           = useState<Owner>(currentUser)
  const [submitting, setSubmitting] = useState(false)
  const [shake, setShake]           = useState(false)

  const section      = SECTIONS.find(s => s.code === sectionCode)!
  const validNumbers = STICKERS.filter(s => s.section === sectionCode).map(s => s.number)
  const minN = Math.min(...validNumbers)
  const maxN = Math.max(...validNumbers)

  const handleDigit  = (d: string) => { if (numStr.length >= 2) return; setNumStr(prev => prev + d) }
  const handleDelete = () => setNumStr(prev => prev.slice(0, -1))

  const handleSubmit = async () => {
    const n = parseInt(numStr, 10)
    if (isNaN(n) || !validNumbers.includes(n)) {
      setShake(true)
      setTimeout(() => setShake(false), 600)
      toast.error(`Número inválido para ${sectionCode} (${minN}–${maxN})`)
      return
    }

    const code = sectionCode === 'FWC' && n === 0 ? 'FWC00' : sectionCode + String(n)
    const mona = STICKERS.find(s => s.code === code)
    if (!mona) {
      toast.error(`Mona ${code} no encontrada en el dataset`)
      return
    }

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
      console.error('addMona error:', msg)
      toast.error('Error al agregar la mona', { description: msg })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-primary px-4 py-3">
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="text-white/70 active:text-white">‹ Sección</button>
          <span className="text-white font-bold ml-2">{section.code} — {section.label}</span>
        </div>
      </div>

      <div className={cn('flex-1 flex flex-col items-center justify-center gap-2 px-4', shake && 'shake-anim')}>
        <p className="text-gray-400 text-sm">Número de la mona</p>
        <div className={cn(
          'text-6xl font-bold tabular-nums min-h-[80px] flex items-center',
          numStr ? 'text-primary' : 'text-gray-200',
          shake && 'text-red-500'
        )}>
          {numStr || '__'}
        </div>
        <p className="text-xs text-gray-400">Rango válido: {minN}–{maxN}</p>

        <div className="flex gap-2 mt-2">
          {(['Simon', 'Paul'] as Owner[]).map((u) => (
            <button
              key={u}
              onClick={() => setOwner(u)}
              className={cn(
                'px-5 py-2 rounded-full font-semibold text-sm transition-all',
                owner === u
                  ? u === 'Simon' ? 'bg-simon text-white' : 'bg-paul text-white'
                  : 'bg-gray-100 text-gray-500'
              )}
            >
              {u === 'Simon' ? '🟦' : '🟧'} {u}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="grid grid-cols-3 gap-2 mb-3">
          {DIGIT_KEYS.map((key) => {
            if (key === '') return <div key="empty" />
            if (key === 'del') return (
              <button key="del" onPointerDown={handleDelete}
                className="bg-gray-100 text-gray-700 rounded-2xl h-14 flex items-center justify-center text-xl active:bg-gray-200 transition-colors">
                ⌫
              </button>
            )
            return (
              <button key={key} onPointerDown={() => handleDigit(key)}
                className="bg-gray-100 text-gray-800 rounded-2xl h-14 flex items-center justify-center text-2xl font-semibold active:bg-gray-200 transition-colors">
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
        @keyframes panini-shake {
          0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)}
          40%{transform:translateX(8px)} 60%{transform:translateX(-8px)} 80%{transform:translateX(8px)}
        }
        .shake-anim{animation:panini-shake 0.5s ease-in-out}
      `}</style>
    </div>
  )
}

// ── Main Agregar Page ────────────────────────────────────────────────────────

export default function AgregarPage() {
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const { currentUser, pushRecentAdd } = useAppStore()
  const qc = useQueryClient()

  const handleAdded = useCallback(
    (code: string, assignment: Assignment, owner: Owner) => {
      qc.invalidateQueries({ queryKey: ['album-stats'] })
      qc.invalidateQueries({ queryKey: ['recent-events'] })
      pushRecentAdd({ inventoryId: '', code, assignment, owner, addedAt: Date.now() })
    },
    [qc, pushRecentAdd]
  )

  return (
    <AppShell>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {!selectedSection ? (
          <>
            <header className="bg-primary px-4 pt-safe-top pb-4">
              <h1 className="text-white font-bold text-lg">Agregar monas</h1>
              <p className="text-white/70 text-sm">Elige la sección</p>
            </header>
            <div className="overflow-y-auto flex-1">
              <SectionPicker onPick={setSelectedSection} />
            </div>
          </>
        ) : (
          <NumberInput
            sectionCode={selectedSection}
            currentUser={currentUser!}
            onBack={() => setSelectedSection(null)}
            onAdded={handleAdded}
          />
        )}
      </div>
    </AppShell>
  )
}
