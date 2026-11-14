"use client";

import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { ACTIVE, JobsPanel, ProcessPanel, useJobsStore } from "@/feature/jobs";
import { VersionsPanel } from "@/feature/versions";
import { AnimationTimeline } from "@/feature/animation";
import { useWorkspaceStore, type DockTab } from "@/stores/workspace-store";
import styles from "../shell.module.css";

const TABS: DockTab[] = ["session", "jobs", "process", "timeline"];

export function Dock() {
  const { t } = useTranslation();
  const dockTab = useWorkspaceStore((s) => s.dockTab);
  const setDockTab = useWorkspaceStore((s) => s.setDockTab);
  const active = useJobsStore((s) => s.jobs.filter((j) => ACTIVE.has(j.status)).length);

  return (
    <Tabs value={dockTab} onValueChange={(v) => setDockTab(v as DockTab)} className={styles.dock} asChild>
      <section aria-label={t("dock.label")}>
      <TabsList variant="underline" size="sm" style={{ paddingInline: "0.75rem", justifyContent: "flex-start" }}>
        {TABS.map((id) => (
          <TabsTrigger key={id} value={id} variant="underline" size="sm">
            {t(`dock.${id}.label`)}
            {id === "jobs" && (
              <Badge variant={active ? "default" : "secondary"} style={{ marginLeft: "0.375rem" }}>
                {active}
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent value="session" className={styles.dockBody}>
        <VersionsPanel />
      </TabsContent>
      <TabsContent value="jobs" className={styles.dockBody}>
        <JobsPanel />
      </TabsContent>
      <TabsContent value="process" className={styles.dockBody}>
        <ProcessPanel />
      </TabsContent>
      <TabsContent value="timeline" className={styles.dockBody}>
        <AnimationTimeline />
      </TabsContent>
      </section>
    </Tabs>
  );
}
