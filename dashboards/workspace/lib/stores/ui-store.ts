import { create } from "zustand"
import { persist, createJSONStorage } from "zustand/middleware"

type UIState = {
  dismissedWarningIds: string[]
  dismissWarning: (id: string) => void
  resetDismissed: () => void
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      dismissedWarningIds: [],
      dismissWarning: (id) =>
        set((s) => ({ dismissedWarningIds: [...s.dismissedWarningIds, id] })),
      resetDismissed: () => set({ dismissedWarningIds: [] }),
    }),
    {
      name: "workspace-warnings-dismissed",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ dismissedWarningIds: state.dismissedWarningIds }),
    },
  ),
)
