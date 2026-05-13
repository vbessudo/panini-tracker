import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { STICKERS } from '@/data/panini-stickers'
import type { Owner } from '@/lib/supabase'

export function useAlbumStats() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['album-stats'],
    queryFn: async () => {
      const { data: slots, error: slotsErr } = await supabase
        .from('album_slots')
        .select('album, status, sticker_code, stickers!inner(is_bonus)')
      if (slotsErr) throw slotsErr

      const { data: inv, error: invErr } = await supabase
        .from('inventory')
        .select('owner, assignment, sticker_code')
      if (invErr) throw invErr

      type SlotRow = { album: string; status: string; sticker_code: string; stickers: { is_bonus: boolean } }
      const typedSlots = slots as unknown as SlotRow[]
      const principal  = typedSlots.filter(s => s.album === 'Principal')
      const secundario = typedSlots.filter(s => s.album === 'Secundario')

      const countPeg = (rows: SlotRow[], bonus: boolean) =>
        rows.filter(r => r.status === 'Pegada' && r.stickers.is_bonus === bonus).length

      type InvRow = { owner: Owner; assignment: string; sticker_code: string }
      const typedInv = inv as InvRow[]
      const forPasting = typedInv.filter(r => r.assignment === 'Principal' || r.assignment === 'Secundario')
      const repetidas  = typedInv.filter(r => r.assignment === 'Repetida')

      // ── 4 collection states ──────────────────────────────────────────────
      const slotStatus: Record<string, string> = {}
      typedSlots.forEach(s => { slotStatus[`${s.sticker_code}-${s.album}`] = s.status })
      const invSet = new Set<string>()
      typedInv.forEach(r => invSet.add(`${r.sticker_code}-${r.assignment}`))

      const computeStates = (stickers: typeof STICKERS) => {
        let bothPegada = 0, onePegadaOneHand = 0, bothHand = 0, oneHand = 0
        for (const s of stickers) {
          const pPegada = slotStatus[`${s.code}-Principal`]  === 'Pegada'
          const sPegada = slotStatus[`${s.code}-Secundario`] === 'Pegada'
          const pHand   = invSet.has(`${s.code}-Principal`)
          const sHand   = invSet.has(`${s.code}-Secundario`)
          if (pPegada && sPegada) { bothPegada++; continue }
          const pCovered = pPegada || pHand
          const sCovered = sPegada || sHand
          if (pCovered && sCovered) { (pPegada || sPegada) ? onePegadaOneHand++ : bothHand++; continue }
          if (pCovered || sCovered) { oneHand++; continue }
        }
        return { bothPegada, onePegadaOneHand, bothHand, oneHand }
      }

      return {
        principal:  { base: { pegada: countPeg(principal, false),  total: principal.filter(r => !r.stickers.is_bonus).length },
                      bonus: { pegada: countPeg(principal, true),   total: principal.filter(r => r.stickers.is_bonus).length } },
        secundario: { base: { pegada: countPeg(secundario, false), total: secundario.filter(r => !r.stickers.is_bonus).length },
                      bonus: { pegada: countPeg(secundario, true),  total: secundario.filter(r => r.stickers.is_bonus).length } },
        forPasting: {
          Simon: forPasting.filter(r => r.owner === 'Simon').length,
          Paul:  forPasting.filter(r => r.owner === 'Paul').length,
        },
        repetidas: {
          Simon: repetidas.filter(r => r.owner === 'Simon').length,
          Paul:  repetidas.filter(r => r.owner === 'Paul').length,
        },
        states: {
          base:  computeStates(STICKERS.filter(s => !s.is_bonus)),
          bonus: computeStates(STICKERS.filter(s => s.is_bonus)),
        },
      }
    },
  })

  useEffect(() => {
    const channel = supabase.channel('stats-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'album_slots' }, () => {
        qc.invalidateQueries({ queryKey: ['album-stats'] })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => {
        qc.invalidateQueries({ queryKey: ['album-stats'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [qc])

  return query
}

export function useRecentEvents(limit = 10) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['recent-events', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events').select('*').order('at', { ascending: false }).limit(limit)
      if (error) throw error
      return data
    },
  })
  useEffect(() => {
    const channel = supabase.channel('events-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, () => {
        qc.invalidateQueries({ queryKey: ['recent-events'] })
      }).subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [qc])
  return query
}
