import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// Database types matching our schema
export type Album = 'Principal' | 'Secundario'
export type SlotStatus = 'Falta' | 'Pegada'
export type Owner = 'Simon' | 'Paul'
export type Assignment = 'Principal' | 'Secundario' | 'Repetida'
export type EventKind = 'add' | 'paste' | 'unpaste' | 'move' | 'trade_away'

export interface DbSticker {
  code: string
  section: string
  number: number
  section_label: string
  is_foil: boolean
  is_team_photo: boolean
  is_bonus: boolean
  display_name: string
}

export interface DbAlbumSlot {
  id: string
  sticker_code: string
  album: Album
  status: SlotStatus
  pegada_at: string | null
  pegada_by: Owner | null
}

export interface DbInventory {
  id: string
  sticker_code: string
  owner: Owner
  assignment: Assignment
  added_at: string
  added_by: Owner
}

export interface DbEvent {
  id: string
  at: string
  actor: Owner
  kind: EventKind
  payload: Record<string, unknown>
}
