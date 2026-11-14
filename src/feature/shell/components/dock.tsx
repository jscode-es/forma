"use client";

import { Badge, Icon, Tabs, TabsContent, TabsList, TabsTrigger } from "@kivora/nextjs";
import { Clock, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ACTIVE, JobsPanel, ProcessPanel, useJobsStore } from "@/feature/jobs";
import { VersionsPanel } from "@/feature/versions";
import { useWorkspaceStore, type DockTab } from "@/stores/workspace-store";
import styles from "../shell.module.css";

const TABS: DockTab[] = ["session", "jobs", "process", "timeline"];

function Placeholder({ id, icon, phase }: { id: "timeline"; icon: LucideIcon; phase?: number }) {
  const { t } = useTranslation();
  return (
    <div className={styles.dockEmpty}>
      <span className={styles.iconTile}>
        <Icon icon={icon} size={18} />
      </span>
      <div style={{ display: "grid", gap: "0.25rem", flex: 1 }}>
        <strong style={{ fontSize: "0.875rem" }}>{t(`dock.${id}.title`)}</strong>
        <span className={styles.hint}>{t(`dock.${id}.description`)}</span>
      </div>
      {phase && <Badge variant="outline">{t("common.phase", { phase })}</Badge>}
    </div>
  );
}

export function Dock() {
  const { t } = useTranslation();
  const dockTab = useWorkspaceStore((s) => s.dockTab);
  const setDockTab = useWorkspaceStore((s) => s.setDockTab);
  const active = useJobsStore((s) => s.jobs.filter((j) => ACTIVE.has(j.status)).length);

  return (
    <Tabs value={dockTab} onValueChange={(v) => setDockTab(v as DockTab)} className={styles.dock}>
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
        <Placeholder id="timeline" icon={Clock} phase={15} />
      </TabsContent>
    </Tabs>
  );
}
