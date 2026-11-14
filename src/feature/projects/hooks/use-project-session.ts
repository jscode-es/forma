import { useEffect } from "react";
import { useProjectStore } from "@/stores/project-store";
import { hasPaintChanges, resetPaintSession, usePaintStore } from "@/feature/paint";
import { hasAnimationChanges, resetAnimationSession, useAnimationStore } from "@/feature/animation";
import { requestClose, saveProject } from "../project-flow";

export function useProjectSession() {
  useEffect(() => {
    const api = window.forma;
    if (!api) return;

    let lastDirty: boolean | undefined;
    const updateDirty = () => {
      const dirty = useProjectStore.getState().dirty || hasPaintChanges() || hasAnimationChanges();
      if (dirty === lastDirty) return;
      lastDirty = dirty;
      api.app.setDirty(dirty);
    };
    updateDirty();
    const unsubscribeDirty = useProjectStore.subscribe((state, prev) => {
      if (state.sessionId !== prev.sessionId) { resetPaintSession(); resetAnimationSession(); }
      if (state.dirty !== prev.dirty || state.sessionId !== prev.sessionId) updateDirty();
    });
    const unsubscribePaint = usePaintStore.subscribe(updateDirty);
    const unsubscribeAnimation = useAnimationStore.subscribe(updateDirty);
    const unsubscribeClose = api.app.onCloseRequested(() => requestClose());

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveProject();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      unsubscribeDirty();
      unsubscribePaint();
      unsubscribeAnimation();
      unsubscribeClose();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
