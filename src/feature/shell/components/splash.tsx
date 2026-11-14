"use client";

import { Spinner } from "@kivora/nextjs";
import styles from "../shell.module.css";
import { BrandMark } from "./brand-mark";

export function Splash() {
  return (
    <div className={styles.splash}>
      <BrandMark size={72} />
      <div className={styles.splashBrand}>
        forma<span className={styles.brandDot}>.</span>
      </div>
      <Spinner size="md" label="Loading" />
    </div>
  );
}
