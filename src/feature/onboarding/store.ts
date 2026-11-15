import { create } from "zustand";

type Step = "hardware" | "engines" | "install" | "done";

type OnboardingState = {
  open: boolean;
  step: Step;
  queue: string[];
  current: string | null;
  failed: string[];
  setOpen: (open: boolean) => void;
  setStep: (step: Step) => void;
};

export const useOnboardingStore = create<OnboardingState>()((set) => ({
  open: false,
  step: "hardware",
  queue: [],
  current: null,
  failed: [],
  setOpen: (open) => set(open ? { open, step: "hardware" } : { open }),
  setStep: (step) => set({ step }),
}));

async function waitWhileInstalling(id: string) {
  for (;;) {
    const plugin = (await window.forma!.plugins.list()).find((entry) => entry.id === id);
    if (!plugin || plugin.status !== "installing") return plugin;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

export async function installSelected(ids: string[]) {
  if (!window.forma || useOnboardingStore.getState().current) return;
  useOnboardingStore.setState({ queue: ids, failed: [], step: "install" });
  for (const id of ids) {
    useOnboardingStore.setState({ current: id });
    try {
      await window.forma.plugins.install(id, null);
      const plugin = await waitWhileInstalling(id);
      if (plugin?.status !== "installed") useOnboardingStore.setState((s) => ({ failed: [...s.failed, id] }));
    } catch {
      useOnboardingStore.setState((s) => ({ failed: [...s.failed, id] }));
    }
  }
  useOnboardingStore.setState({ current: null, step: "done" });
}
