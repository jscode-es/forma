import { useEffect } from "react";
import { applyFinishedJob, refreshEngines, upsertJob, useJobsStore } from "../jobs-store";

export function useJobsSync() {
  useEffect(() => {
    const api = window.forma;
    if (!api) return;
    let active = true;

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
    };
  }, []);
}
