"use client";

import { useState } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { cancelSave, dismissError, resolveGuard, saveProjectAs, useProjectFlow } from "../project-flow";

export function ProjectDialogs() {
  const saveOpen = useProjectFlow((s) => s.saveOpen);
  const guard = useProjectFlow((s) => s.guard);
  const error = useProjectFlow((s) => s.error);

  return (
    <>
      <Dialog open={saveOpen} onOpenChange={(open) => !open && cancelSave()}>
        {saveOpen && <SaveContent />}
      </Dialog>
      <Dialog open={guard !== null} onOpenChange={(open) => !open && resolveGuard("cancel")}>
        <GuardContent />
      </Dialog>
      <Dialog open={error !== null} onOpenChange={(open) => !open && dismissError()}>
        <ErrorContent message={error ?? ""} />
      </Dialog>
    </>
  );
}

function SaveContent() {
  const { t } = useTranslation();
  const [name, setName] = useState(t("topBar.untitled"));
  const valid = name.trim().length > 0 && name.trim().length <= 120;

  return (
    <DialogContent>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) saveProjectAs(name.trim());
        }}
        style={{ display: "grid", gap: "1rem" }}
      >
        <DialogHeader>
          <DialogTitle>{t("project.saveTitle")}</DialogTitle>
          <DialogDescription>{t("project.saveDescription")}</DialogDescription>
        </DialogHeader>
        <div style={{ display: "grid", gap: "0.5rem" }}>
          <Label htmlFor="project-name">{t("project.name")}</Label>
          <Input
            id="project-name"
            value={name}
            maxLength={120}
            autoFocus
            onFocus={(e) => e.target.select()}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={cancelSave}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!valid}>
            {t("topBar.save")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function GuardContent() {
  const { t } = useTranslation();
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("project.guardTitle")}</DialogTitle>
        <DialogDescription>{t("project.guardDescription")}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button variant="ghost" onClick={() => resolveGuard("cancel")}>
          {t("common.cancel")}
        </Button>
        <Button variant="outline" onClick={() => resolveGuard("discard")}>
          {t("project.discard")}
        </Button>
        <Button onClick={() => resolveGuard("save")}>{t("project.saveAndContinue")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ErrorContent({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("project.errorTitle")}</DialogTitle>
      </DialogHeader>
      <Alert variant="destructive">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <DialogFooter>
        <Button onClick={dismissError}>{t("common.close")}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
