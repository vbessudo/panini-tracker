import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Owner } from './supabase'
import type { GroupingMode } from './grouping'

interface RecentAdd {
  inventoryId: string
  code: string
  assignment: string
  owner: Owner
  addedAt: number
}

interface AppState {
  isAuthenticated: boolean
  currentUser: Owner | null
  sectionPickerScrollY: number
  recentAdds: RecentAdd[]
  groupingMode: GroupingMode

  authenticate: () => void
  logout: () => void
  setUser: (user: Owner) => void
  setSectionPickerScrollY: (y: number) => void
  pushRecentAdd: (add: RecentAdd) => void
  removeRecentAdd: (inventoryId: string) => void
  clearRecentAdds: () => void
  setGroupingMode: (mode: GroupingMode) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      currentUser: null,
      sectionPickerScrollY: 0,
      recentAdds: [],
      groupingMode: 'wc_group' as GroupingMode,

      authenticate: () => set({ isAuthenticated: true }),
      logout: () => set({ isAuthenticated: false, currentUser: null }),
      setUser: (user) => set({ currentUser: user }),
      setSectionPickerScrollY: (y) => set({ sectionPickerScrollY: y }),
      pushRecentAdd: (add) =>
        set((state) => ({ recentAdds: [add, ...state.recentAdds].slice(0, 5) })),
      removeRecentAdd: (inventoryId) =>
        set((state) => ({ recentAdds: state.recentAdds.filter((r) => r.inventoryId !== inventoryId) })),
      clearRecentAdds: () => set({ recentAdds: [] }),
      setGroupingMode: (mode) => set({ groupingMode: mode }),
    }),
    {
      name: 'panini-app-state',
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        currentUser: state.currentUser,
        groupingMode: state.groupingMode,
      }),
    }
  )
)
