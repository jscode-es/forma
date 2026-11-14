"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SystemInfo } from "@/lib/forma";
import styles from "../shell.module.css";

export function StatusBar() {
  const { t } = useTranslation();
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    window.forma?.system.info().then(setInfo);
  }, []);

  return (
    <footer className={styles.statusBar}>
      <span className={styles.statusItem}>
        <span className={`${styles.statusDot} ${info?.gpu ? "" : styles.statusDotMuted}`} />
        {info?.gpu ?? t("status.noGpu")}
      </span>
      <span className={styles.statusItem}>{t("status.noEngines")}</span>
      <span className={styles.spacer} />
      <span className={styles.statusItem}>{t("status.local")}</span>
      <span className={styles.statusItem}>FORMA v{info?.version ?? "-"}</span>
    </footer>
  );
}
