import { create } from "zustand";
import type { WeightsState } from "@/lib/forma";

type ModelsState = {
  open: boolean;
  weights: WeightsState[];
  checking: boolean;
  setOpen: (open: boolean) => void;
};

export const useModelsStore = create<ModelsState>()((set) => ({
  open: false,
  weights: [],
  checking: false,
  setOpen: (open) => set({ open }),
}));

export function upsertWeights(state: WeightsState) {
  useModelsStore.setState((s) => ({ weights: s.weights.map((w) => (w.id === state.id ? state : w)) }));
}

export async function loadWeights() {
  const weights = await window.forma?.weights.list();
  if (weights) useModelsStore.setState({ weights });
}

export async function checkUpdates() {
  if (!window.forma) return;
  useModelsStore.setState({ checking: true });
  try {
    useModelsStore.setState({ weights: await window.forma.weights.checkUpdates() });
  } finally {
    useModelsStore.setState({ checking: false });
  }
}

export function formatBytes(bytes: number, language: string) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: unit < 2 ? 0 : 1 }).format(value)} ${units[unit]}`;
}
