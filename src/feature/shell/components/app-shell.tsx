"use client";

import { useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  Sheet,
  SheetContent,
  SheetTitle,
} from "@kivora/nextjs";
import { useTranslation } from "react-i18next";
import { useMediaQuery } from "@/hooks/use-media-query";
import styles from "../shell.module.css";
import { Dock } from "./dock";
import { Inspector } from "./inspector";
import { ShellDialogs } from "./shell-dialogs";
import { SideMenu, type ShellDialog } from "./side-menu";
import { StatusBar } from "./status-bar";
import { TopBar } from "./top-bar";
import { Viewport } from "./viewport";

export function AppShell() {
  const { t } = useTranslation();
  const narrow = useMediaQuery("(max-width: 1100px)");
  const [dialog, setDialog] = useState<ShellDialog | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  return (
    <div className={styles.app}>
      <TopBar onOpenInspector={narrow ? () => setInspectorOpen(true) : undefined} />

      <ResizablePanelGroup
        key={narrow ? "narrow" : "wide"}
        direction="horizontal"
        autoSaveId={narrow ? "forma-layout-narrow" : "forma-layout"}
      >
        <ResizablePanel id="menu" order={1} defaultSize={narrow ? 26 : 15} minSize={narrow ? 20 : 12} maxSize={30}>
          <SideMenu onOpenDialog={setDialog} />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="center" order={2} defaultSize={narrow ? 74 : 62} minSize={35}>
          <ResizablePanelGroup direction="vertical" autoSaveId="forma-center">
            <ResizablePanel id="viewport" order={1} defaultSize={74} minSize={35}>
              <Viewport />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel id="dock" order={2} defaultSize={26} minSize={12} maxSize={55}>
              <Dock />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        {!narrow && (
          <>
            <ResizableHandle />
            <ResizablePanel id="inspector" order={3} defaultSize={23} minSize={18} maxSize={36}>
              <Inspector />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      <StatusBar />

      {narrow && (
        <Sheet open={inspectorOpen} onOpenChange={setInspectorOpen}>
          <SheetContent side="right" closeLabel={t("common.close")} style={{ padding: 0, width: "min(26rem, 90vw)" }}>
            <SheetTitle style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              {t("inspector.title")}
            </SheetTitle>
            <Inspector inSheet />
          </SheetContent>
        </Sheet>
      )}

      <ShellDialogs open={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
