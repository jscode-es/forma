"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useJobsStore } from "@/feature/jobs";
import type { SystemInfo } from "@/lib/forma";
import styles from "../shell.module.css";

export function StatusBar() {
  const { t, i18n } = useTranslation();
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const hardware = useJobsStore((s) => s.hardware);
  const available = useJobsStore(
    (s) => s.engines.filter((e) => e.available && !e.demo && e.tasks.some((t) => t === "image-to-3d" || t === "text-to-3d")).length,
  );
  const demo = useJobsStore((s) => s.engines.some((e) => e.demo && e.available));

  useEffect(() => {
    window.forma?.system.info().then(setInfo);
  }, []);

  const gpu = hardware?.gpu ?? info?.gpu;
  const vram = hardware?.vramMb
    ? ` · ${new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 }).format(hardware.vramMb / 1024)} GB`
    : "";

  return (
    <footer className={styles.statusBar}>
      <span className={styles.statusItem}>
        <span className={`${styles.statusDot} ${gpu ? "" : styles.statusDotMuted}`} />
        {gpu ? `${gpu}${vram}` : t("status.noGpu")}
      </span>
      <span className={styles.statusItem}>
        {available > 0 ? t("status.engines", { count: available }) : t("status.noEngines")}
        {demo ? ` · ${t("status.demoAvailable")}` : ""}
      </span>
      <span className={styles.spacer} />
      <span className={styles.statusItem}>{t("status.local")}</span>
      <span className={styles.statusItem}>FORMA v{info?.version ?? "-"}</span>
    </footer>
  );
}
