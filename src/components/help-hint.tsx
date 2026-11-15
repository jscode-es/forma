"use client";

import { Icon, Popover, PopoverContent, PopoverTrigger } from "@kivora/nextjs";
import { CircleHelp } from "lucide-react";
import { useTranslation } from "react-i18next";

export function HelpHint({ text, label }: { text: string; label?: string }) {
  const { t } = useTranslation();

  return (
    <Popover>
      <PopoverTrigger
        aria-label={label ?? t("common.help")}
        style={{ display: "inline-grid", placeItems: "center", padding: "0.25rem", flex: "none", border: 0, background: "none", color: "inherit", cursor: "pointer" }}
      >
        <Icon icon={CircleHelp} size={15} />
      </PopoverTrigger>
      <PopoverContent aria-label={label ?? t("common.help")} style={{ maxWidth: "min(22rem, calc(100vw - 2rem))", maxHeight: "min(24rem, calc(100dvh - 4rem))", overflowY: "auto", whiteSpace: "pre-line", fontSize: "0.8125rem", lineHeight: 1.5 }}>{text}</PopoverContent>
    </Popover>
  );
}
