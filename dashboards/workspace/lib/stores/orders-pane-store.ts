import { create } from "zustand"
import { devtools, persist } from "zustand/middleware"

type OrdersPaneState = {
  /**
   * Desktop detail pane visibility. When the pane is hidden the list takes the
   * full width; when it is shown the list is pinned to a fixed rail and the
   * detail absorbs the remaining space.
   */
  showDetailPane: boolean
  setShowDetailPane: (showDetailPane: boolean) => void
}

/**
 * Only this boolean is persisted. Selection, filters, search and page stay
 * session-only so returning to the page never restores a stale filter set.
 */
export const useOrdersPaneStore = create<OrdersPaneState>()(
  devtools(
    persist(
      (set) => ({
        showDetailPane: true,
        setShowDetailPane: (showDetailPane) => set({ showDetailPane }),
      }),
      {
        name: "zayos-orders-panes",
        version: 1,
        partialize: (state) => ({ showDetailPane: state.showDetailPane }),
        // Corrupt or foreign stored JSON falls back to the landing default
        // instead of wedging the layout with a non-boolean value.
        merge: (persisted, current) => {
          const stored = (persisted ?? {}) as Partial<
            Pick<OrdersPaneState, "showDetailPane">
          >
          return {
            ...current,
            showDetailPane:
              typeof stored.showDetailPane === "boolean"
                ? stored.showDetailPane
                : current.showDetailPane,
          }
        },
      },
    ),
    { name: "OrdersPaneStore" },
  ),
)