"use client";

import { Badge, Icon, Tabs, TabsContent, TabsList, TabsTrigger } from "@kivora/nextjs";
import { Activity, Clock, Folder, ListOrdered, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore, type DockTab } from "@/stores/workspace-store";
import styles from "../shell.module.css";

const TABS: { id: DockTab; icon: LucideIcon; phase?: number }[] = [
  { id: "session", icon: Folder },
  { id: "jobs", icon: ListOrdered, phase: 4 },
  { id: "process", icon: Activity, phase: 4 },
  { id: "timeline", icon: Clock, phase: 15 },
];

export function Dock() {
  const { t } = useTranslation();
  const dockTab = useWorkspaceStore((s) => s.dockTab);
  const setDockTab = useWorkspaceStore((s) => s.setDockTab);

  return (
    <Tabs value={dockTab} onValueChange={(v) => setDockTab(v as DockTab)} className={styles.dock}>
      <TabsList variant="underline" size="sm" style={{ paddingInline: "0.75rem", justifyContent: "flex-start" }}>
        {TABS.map(({ id }) => (
          <TabsTrigger key={id} value={id} variant="underline" size="sm">
            {t(`dock.${id}.label`)}
            {id === "jobs" && (
              <Badge variant="secondary" style={{ marginLeft: "0.375rem" }}>
                0
              </Badge>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      {TABS.map(({ id, icon, phase }) => (
        <TabsContent key={id} value={id} className={styles.dockBody}>
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
        </TabsContent>
      ))}
    </Tabs>
  );
}
