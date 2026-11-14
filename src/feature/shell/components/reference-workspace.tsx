"use client";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger, Button, Icon, Tabs, TabsContent, TabsList, TabsTrigger } from "@kivora/nextjs";
import { ArrowRight, ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ACTIVE, generateImages, useJobsStore } from "@/feature/jobs";
import { PromptControl, PromptHistory } from "@/feature/prompt";
import { ReferencePanel, ReferenceReview, ViewSlots } from "@/feature/references";
import { useProjectStore } from "@/stores/project-store";
import { useWorkspaceStore, type ReferenceTab } from "@/stores/workspace-store";
import styles from "../shell.module.css";
import { HelpHint } from "./help-hint";

function ReferenceFooter() {
  const { t } = useTranslation();
  const prompt = useProjectStore((s) => s.prompt.trim());
  const sessionId = useProjectStore((s) => s.sessionId);
  const engineId = useProjectStore((s) => s.imageEngine.id);
  const engine = useJobsStore((s) => s.engines.find((e) => e.id === engineId && e.tasks.includes("text-to-image")));
  const job = useJobsStore((s) => s.jobs.find((j) => ACTIVE.has(j.status) && j.task === "text-to-image"));
  const picked = useJobsStore((s) => s.candidates?.sessionId === sessionId && s.candidates.picked !== null);
  const error = useJobsStore((s) => s.enqueueError);
  const ready = Boolean(engine?.available) && prompt.length > 0 && !job;
  const hint = error
    ? t(`errors.${error}`, { defaultValue: error })
    : job
      ? t("prompt.generating", { percent: Math.round(job.progress * 100) })
      : !engine?.available
        ? t("prompt.noEngine")
        : !prompt
          ? t("prompt.writeHint")
          : picked
            ? t("prompt.pickedHint")
            : t("prompt.readyHint");

  return (
    <div className={styles.inspectorFooter}>
      <Button size="lg" disabled={!ready} onClick={() => generateImages()}>
        <Icon icon={ImageIcon} size={16} />
        {t("prompt.generate")}
      </Button>
      {picked && !job && (
        <Button variant="outline" onClick={() => useWorkspaceStore.getState().setSection("create3d")}>
          {t("prompt.continue")}
          <Icon icon={ArrowRight} size={15} />
        </Button>
      )}
      <span className={styles.hint} style={{ textAlign: "center", color: error ? "var(--color-destructive)" : undefined }}>
        {hint}
      </span>
    </div>
  );
}

export function ReferenceWorkspace() {
  const { t } = useTranslation();
  const tab = useWorkspaceStore((s) => s.referenceTab);
  const setTab = useWorkspaceStore((s) => s.setReferenceTab);
  return <section className={styles.block} aria-labelledby="references-title">
    <div className={styles.blockHeader}>
      <span id="references-title" className={styles.referenceTitle}>
        {t("references.title")}
        <HelpHint text={t("references.help")} />
      </span>
    </div>
    <Tabs value={tab} onValueChange={(value) => setTab(value as ReferenceTab)} className={styles.referenceWorkspace}>
      <TabsList fullWidth size="sm" aria-label={t("references.title")} className={styles.referenceTabs}>
        {(["text", "single", "multi"] as const).map((value) => <TabsTrigger key={value} value={value} size="sm" className={styles.referenceTab}>
          {t(`references.tabs.${value}`)}
        </TabsTrigger>)}
      </TabsList>
      <TabsContent value="text" className={styles.referenceContent}>
        <PromptControl />
        <ReferenceFooter />
        <Accordion type="multiple" defaultValue={["history"]}>
          <AccordionItem value="history">
            <AccordionTrigger>{t("inspector.sections.promptHistory.title")}</AccordionTrigger>
            <AccordionContent><PromptHistory /></AccordionContent>
          </AccordionItem>
        </Accordion>
      </TabsContent>
      <TabsContent value="single" className={styles.referenceContent}><ReferencePanel /></TabsContent>
      <TabsContent value="multi" className={styles.referenceContent}>
        <ViewSlots />
        <Accordion type="multiple" defaultValue={["review"]}>
          <AccordionItem value="review">
            <AccordionTrigger>{t("inspector.sections.referenceReview.title")}</AccordionTrigger>
            <AccordionContent><ReferenceReview /></AccordionContent>
          </AccordionItem>
        </Accordion>
      </TabsContent>
    </Tabs>
  </section>;
}

