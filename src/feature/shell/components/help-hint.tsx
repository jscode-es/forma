"use client";

import { Icon, Popover, PopoverContent, PopoverTrigger } from "@kivora/nextjs";
import { CircleHelp } from "lucide-react";
import { useTranslation } from "react-i18next";

export function HelpHint({ text }: { text: string }) {
  const { t } = useTranslation();

  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("common.help")}
        style={{ display: "inline-grid", padding: 0, border: 0, background: "none", color: "inherit", cursor: "pointer" }}
      >
        <Icon icon={CircleHelp} size={15} />
      </PopoverTrigger>
      <PopoverContent style={{ maxWidth: 280, fontSize: "0.8125rem", lineHeight: 1.5 }}>{text}</PopoverContent>
    </Popover>
  );
}
