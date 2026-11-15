import { useEffect } from "react";
import { useProjectStore } from "@/stores/project-store";
import { applyFinishedJob, refreshEngines, selectDefaultEngines, upsertJob, useJobsStore } from "../jobs-store";

export function useJobsSync() {
  useEffect(() => {
    const api = window.forma;
    if (!api) return;
    let active = true;

    const unsubscribeEngines = useJobsStore.subscribe((state, previous) => {
      if (state.engines !== previous.engines) selectDefaultEngines();
    });
    const unsubscribeProject = useProjectStore.subscribe((state, previous) => {
      if (state.sessionId !== previous.sessionId || state.engine !== previous.engine || state.imageEngine !== previous.imageEngine || state.textureEngine !== previous.textureEngine) selectDefaultEngines();
    });
    selectDefaultEngines();

    api.jobs.list().then((jobs) => active && useJobsStore.setState({ jobs }));
    refreshEngines();
    const unsubscribe = api.jobs.onUpdate((job) => {
      upsertJob(job);
      applyFinishedJob(job).catch((error) =>
        useJobsStore.setState({ enqueueError: error instanceof Error ? error.message : String(error) }),
      );
    });

    return () => {
      active = false;
      unsubscribe();
      unsubscribeEngines();
      unsubscribeProject();
    };
  }, []);
}
