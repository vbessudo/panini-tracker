import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import type { Owner } from '@/lib/supabase'

export function useAlbumStats() {
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['album-stats'],
    queryFn: async () => {
      // album_slots counts
      const { data: slots, error: slotsErr } = await supabase
        .from('album_slots')
        .select('album, status, sticker_code, stickers!inner(is_bonus)')

      if (slotsErr) throw slotsErr

      // inventory counts
      const { data: inv, error: invErr } = await supabase
        .from('inventory')
        .select('owner, assignment')

      if (invErr) throw invErr

      // Parse
      type SlotRow = { album: string; status: string; sticker_code: string; stickers: { is_bonus: boolean } }
      const typedSlots = slots as SlotRow[]
      const principal = typedSlots.filter(s => s.album === 'Principal')
      const secundario = typedSlots.filter(s => s.album === 'Secundario')

      const count = (rows: SlotRow[], status: string, bonus: boolean) =>
        rows.filter(r => r.status === status && r.stickers.is_bonus === bonus).length

      const principalBase   = { pegada: count(principal, 'Pegada', false),   total: principal.filter(r => !r.stickers.is_bonus).length }
      const principalBonus  = { pegada: count(principal, 'Pegada', true),    total: principal.filter(r => r.stickers.is_bonus).length }
      const secundarioBase  = { pegada: count(secundario, 'Pegada', false),  total: secundario.filter(r => !r.stickers.is_bonus).length }
      const secundarioBonus = { pegada: count(secundario, 'Pegada', true),   total: secundario.filter(r => r.stickers.is_bonus).length }

      // Inventory breakdown
      type InvRow = { owner: Owner; assignment: string }
      const typedInv = inv as InvRow[]
      const forPasting = typedInv.filter(r => r.assignment === 'Principal' || r.assignment === 'Secundario')
      const repetidas   = typedInv.filter(r => r.assignment === 'Repetida')

      return {
        principal:   { base: principalBase,  bonus: principalBonus  },
        secundario:  { base: secundarioBase, bonus: secundarioBonus },
        forPasting: {
          simon: forPasting.filter(r => r.owner === 'Simon').length,
          paul:  forPasting.filter(r => r.owner === 'Paul').length,
        },
        repetidas: {
          simon: repetidas.filter(r => r.owner === 'Simon').length,
          paul:  repetidas.filter(r => r.owner === 'Paul').length,
        },
      }
    },
  })

  // Realtime subscriptions — invalidate on any change to relevant tables
  useEffect(() => {
    const channel = supabase
      .channel('stats-realtime')
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
        .from('events')
        .select('*')
        .order('at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    const channel = supabase
      .channel('events-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events' }, () => {
        qc.invalidateQueries({ queryKey: ['recent-events'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [qc])

  return query
}
