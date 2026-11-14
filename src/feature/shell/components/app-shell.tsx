"use client";

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@kivora/nextjs";
import { ConfigPanel } from "./config-panel";
import { SideMenu } from "./side-menu";
import { Viewport } from "./viewport";

export function AppShell() {
  return (
    <div style={{ height: "100dvh" }}>
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={16} minSize={12} maxSize={26}>
          <SideMenu />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={60} minSize={30}>
          <Viewport />
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={24} minSize={16} maxSize={40}>
          <ConfigPanel />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
