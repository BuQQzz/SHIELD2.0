import { create } from "zustand";

/**
 * Which summary step the header's summaries menu asked to show. The step
 * with that id scrolls itself into view, opens and flashes, then clears it.
 */
interface SummaryFocusStore {
  focusedId: string | null;
  focus: (id: string | null) => void;
}

export const useSummaryFocus = create<SummaryFocusStore>((set) => ({
  focusedId: null,
  focus: (id) => set({ focusedId: id }),
}));
