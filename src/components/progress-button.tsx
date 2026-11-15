"use client";

import { Button, type ButtonProps } from "@kivora/nextjs";
import styles from "./progress-button.module.css";

type Props = ButtonProps & { progress?: number };

export function ProgressButton({ progress, disabled, className, children, ...props }: Props) {
  const busy = progress !== undefined;
  const percent = busy ? Math.min(100, Math.max(0, Math.round(progress * 100))) : 0;

  return <Button {...props} className={`${styles.button} ${className ?? ""}`} disabled={disabled || busy} aria-busy={busy} data-progress={busy ? percent : undefined}>
    {busy && <span className={styles.fill} data-slot="progress-fill" aria-hidden="true" style={{ transform: `scaleX(${percent / 100})` }} />}
    <span className={styles.content} aria-live="polite" aria-atomic="true">{children}</span>
  </Button>;
}
