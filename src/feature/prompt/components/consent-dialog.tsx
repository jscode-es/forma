"use client";

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { generateImages, useJobsStore } from "@/feature/jobs";
import { useProjectStore } from "@/stores/project-store";

const useConsentStore = create<{ pending: { multiview: boolean; engineName: string } | null }>(() => ({ pending: null }));

export function requestImages(multiview: boolean) {
  const project = useProjectStore.getState();
  const id = multiview ? project.multiviewEngine.id : project.imageEngine.id;
  const engine = useJobsStore.getState().engines.find((e) => e.id === id);
  if (!engine?.network) return void generateImages(multiview);
  useConsentStore.setState({ pending: { multiview, engineName: engine.name } });
}

export function ConsentDialog() {
  const { t } = useTranslation();
  const pending = useConsentStore((s) => s.pending);
  const close = () => useConsentStore.setState({ pending: null });

  function accept() {
    if (!pending) return;
    const project = useProjectStore.getState();
    (pending.multiview ? project.setMultiviewEngineParameter : project.setImageEngineParameter)("consent", true);
    close();
    void generateImages(pending.multiview);
  }

  return <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) close(); }}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("prompt.consentTitle")}</DialogTitle>
        <DialogDescription>{t("prompt.consentText", { engine: pending?.engineName ?? "" })}</DialogDescription>
      </DialogHeader>
      {pending?.multiview && <p style={{ margin: 0, fontSize: "0.875rem" }}>{t("prompt.consentViews")}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={close}>{t("common.cancel")}</Button>
        <Button onClick={accept}>{t("prompt.consentAccept")}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
