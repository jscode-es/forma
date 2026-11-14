"use client";

import type { ReactNode } from "react";
import { KivoraProvider } from "@kivora/nextjs";

export default function KivoraProviders({ children }: { children: ReactNode }) {
  return <KivoraProvider colorMode="system">{children}</KivoraProvider>;
}
