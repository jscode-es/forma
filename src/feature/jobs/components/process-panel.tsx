"use client";

import { useEffect, useState } from "react";
import { Badge, Icon, Progress } from "@kivora/nextjs";
import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ACTIVE, useJobsStore } from "../jobs-store";
import styles from "../jobs.module.css";

export function ProcessPanel() {
  const { t, i18n } = useTranslation();
  const job = useJobsStore((s) => s.jobs.find((j) => j.id === s.selectedId) ?? s.jobs[0] ?? null);
  const engine = useJobsStore((s) => s.engines.find((e) => e.id === job?.engineId));
  const [logs, setLogs] = useState("");

  useEffect(() => {
    if (!job) return;
    let active = true;
    window.forma?.jobs.logs(job.id).then((text) => active && setLogs(text));
    return () => {
      active = false;
    };
  }, [job?.id, job?.status, job?.stage, job?.intermediates.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!job) {
    return (
      <div className={styles.empty}>
        <span className={styles.iconTile}>
          <Icon icon={Activity} size={18} />
        </span>
        <div>
          <strong>{t("dock.process.title")}</strong>
          <p className={styles.hint}>{t("dock.process.description")}</p>
        </div>
      </div>
    );
  }

  const time = new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "medium" });
  const duration =
    job.startedAt && job.finishedAt ? ((Date.parse(job.finishedAt) - Date.parse(job.startedAt)) / 1000).toFixed(1) : null;

  return (
    <div className={styles.process}>
      <div className={styles.processHeader}>
        <strong>{engine?.name ?? job.engineId}</strong>
        <Badge variant="outline">{t(`jobs.status.${job.status}`)}</Badge>
        <span className={styles.hint}>
          {time.format(new Date(job.createdAt))}
          {duration ? ` · ${t("jobs.duration", { seconds: duration })}` : ""}
        </span>
      </div>
      {ACTIVE.has(job.status) && <Progress value={Math.round(job.progress * 100)} size="sm" />}
      {job.error && <p className={styles.error}>{t(`jobs.error.${job.error}`, { defaultValue: job.error })}</p>}

      <div className={styles.columns}>
        <section>
          <h4 className={styles.sectionTitle}>{t("jobs.parameters")}</h4>
          <dl className={styles.params}>
            {Object.entries(job.parameters).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{String(value)}</dd>
              </div>
            ))}
          </dl>
          <h4 className={styles.sectionTitle}>{t("jobs.files")}</h4>
          <ul className={styles.files}>
            {[...job.intermediates, ...job.results].map((file) => (
              <li key={file.path}>
                {file.label || file.path} <span className={styles.hint}>{file.path}</span>
              </li>
            ))}
            {job.intermediates.length + job.results.length === 0 && <li className={styles.hint}>-</li>}
          </ul>
        </section>
        <section>
          <h4 className={styles.sectionTitle}>{t("jobs.log")}</h4>
          <pre className={styles.log}>{logs || "-"}</pre>
        </section>
      </div>
    </div>
  );
}
