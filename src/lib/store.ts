import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Owner } from './supabase'

interface RecentAdd {
  inventoryId: string
  code: string
  assignment: string
  owner: Owner
  addedAt: number // timestamp
}

interface AppState {
  // Auth / identity
  isAuthenticated: boolean
  currentUser: Owner | null
  sectionPickerScrollY: number

  // Recent additions (for the undo stack — last 5)
  recentAdds: RecentAdd[]

  // Actions
  authenticate: () => void
  logout: () => void
  setUser: (user: Owner) => void
  setSectionPickerScrollY: (y: number) => void
  pushRecentAdd: (add: RecentAdd) => void
  removeRecentAdd: (inventoryId: string) => void
  clearRecentAdds: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      currentUser: null,
      sectionPickerScrollY: 0,
      recentAdds: [],

      authenticate: () => set({ isAuthenticated: true }),
      logout: () => set({ isAuthenticated: false, currentUser: null }),
      setUser: (user) => set({ currentUser: user }),
      setSectionPickerScrollY: (y) => set({ sectionPickerScrollY: y }),
      pushRecentAdd: (add) =>
        set((state) => ({
          recentAdds: [add, ...state.recentAdds].slice(0, 5),
        })),
      removeRecentAdd: (inventoryId) =>
        set((state) => ({
          recentAdds: state.recentAdds.filter((r) => r.inventoryId !== inventoryId),
        })),
      clearRecentAdds: () => set({ recentAdds: [] }),
    }),
    {
      name: 'panini-app-state',
      // Only persist auth + user; reset scroll/recent on each session
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        currentUser: state.currentUser,
      }),
    }
  )
)
