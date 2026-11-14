"use client";

import { Badge, Button, Icon } from "@kivora/nextjs";
import { Check, Columns2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { activeVariant, useProjectStore, variantName } from "@/stores/project-store";

export function VersionControls() {
  const { t } = useTranslation();
  const active = useProjectStore(activeVariant);
  const preview = useProjectStore((s) => s.variants.find((v) => v.id === s.previewVariantId) ?? null);
  const comparing = useProjectStore((s) => s.comparing);
  const { applyVariant, discardVariant, previewVariant, setComparing } = useProjectStore.getState();
  const cube = t("scene.cube");

  if (!preview) {
    return <Badge variant="secondary">{t("versions.activeLabel", { name: variantName(active, cube) })}</Badge>;
  }

  return (
    <>
      <Badge variant="default">
        {comparing ? t("versions.activeLabel", { name: variantName(active, cube) }) : t("versions.previewLabel", { name: variantName(preview, cube) })}
      </Badge>
      <Button
        size="sm"
        variant={comparing ? "secondary" : "ghost"}
        aria-pressed={comparing}
        title={t("versions.compareHint")}
        onClick={() => setComparing(!comparing)}
      >
        <Icon icon={Columns2} size={14} />
        {t("versions.compare")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => (preview.model.type === "staged" ? discardVariant(preview.id) : previewVariant(null))}
      >
        <Icon icon={X} size={14} />
        {preview.model.type === "staged" ? t("versions.discard") : t("versions.close")}
      </Button>
      <Button size="sm" onClick={() => applyVariant(preview.id)}>
        <Icon icon={Check} size={14} />
        {t("versions.apply")}
      </Button>
    </>
  );
}
