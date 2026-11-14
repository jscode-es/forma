import { useEffect } from "react";
import { refreshEngines } from "@/feature/jobs";
import { loadWeights, upsertWeights, useModelsStore } from "../models-store";

const SETTLED = new Set(["installed", "missing", "partial", "corrupt"]);

export function useWeightsSync() {
  useEffect(() => {
    const api = window.forma;
    if (!api) return;
    loadWeights();
    return api.weights.onUpdate((state) => {
      const previous = useModelsStore.getState().weights.find((w) => w.id === state.id);
      upsertWeights(state);
      if (SETTLED.has(state.status) && previous?.status !== state.status) refreshEngines();
    });
  }, []);
}
