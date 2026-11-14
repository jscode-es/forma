"use client";

import { Badge, Button, Icon, Progress } from "@kivora/nextjs";
import { ListOrdered, RotateCcw, Square } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { JobInfo } from "@/lib/forma";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { ACTIVE, upsertJob, useJobsStore } from "../jobs-store";
import styles from "../jobs.module.css";

const STATUS_VARIANT: Record<JobInfo["status"], "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  running: "default",
  succeeded: "secondary",
  failed: "destructive",
  cancelled: "outline",
};

export function JobsPanel() {
  const { t, i18n } = useTranslation();
  const jobs = useJobsStore((s) => s.jobs);
  const engines = useJobsStore((s) => s.engines);
  const selectedId = useJobsStore((s) => s.selectedId);
  const select = useJobsStore((s) => s.select);
  const setDockTab = useWorkspaceStore((s) => s.setDockTab);
  const time = new Intl.DateTimeFormat(i18n.language, { timeStyle: "short" });

  if (jobs.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.iconTile}>
          <Icon icon={ListOrdered} size={18} />
        </span>
        <div>
          <strong>{t("dock.jobs.title")}</strong>
          <p className={styles.hint}>{t("dock.jobs.description")}</p>
        </div>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {jobs.map((job) => {
        const engine = engines.find((e) => e.id === job.engineId);
        return (
          <li key={job.id} className={`${styles.row} ${job.id === selectedId ? styles.selected : ""}`}>
            <button
              type="button"
              className={styles.rowMain}
              onClick={() => {
                select(job.id);
                setDockTab("process");
              }}
            >
              <span className={styles.rowTitle}>
                {engine?.name ?? job.engineId}
                <Badge variant={STATUS_VARIANT[job.status]}>{t(`jobs.status.${job.status}`)}</Badge>
              </span>
              <span className={styles.hint}>
                {time.format(new Date(job.createdAt))}
                {job.stage && ACTIVE.has(job.status) ? ` · ${t(`jobs.stage.${job.stage}`, { defaultValue: job.stage })}` : ""}
                {job.error ? ` · ${t(`jobs.error.${job.error}`, { defaultValue: job.error })}` : ""}
              </span>
              {ACTIVE.has(job.status) && <Progress value={Math.round(job.progress * 100)} size="sm" />}
            </button>
            <div className={styles.rowActions}>
              {ACTIVE.has(job.status) ? (
                <Button size="sm" variant="ghost" onClick={() => window.forma?.jobs.cancel(job.id)}>
                  <Icon icon={Square} size={14} />
                  {t("jobs.cancel")}
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => window.forma?.jobs.retry(job.id).then(upsertJob)}>
                  <Icon icon={RotateCcw} size={14} />
                  {t("jobs.retry")}
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
