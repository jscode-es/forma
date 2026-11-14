import { useEffect } from "react";
import { useProjectStore } from "@/stores/project-store";
import { requestClose, saveProject } from "../project-flow";

export function useProjectSession() {
  useEffect(() => {
    const api = window.forma;
    if (!api) return;

    api.app.setDirty(useProjectStore.getState().dirty);
    const unsubscribeDirty = useProjectStore.subscribe((state, prev) => {
      if (state.dirty !== prev.dirty) api.app.setDirty(state.dirty);
    });
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
      unsubscribeClose();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);
}
