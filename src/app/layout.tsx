import type { Metadata } from "next";
import type { ReactNode } from "react";
import Providers from "@/providers/kivora-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forma",
  description: "Local-first AI studio for 3D models, rigs, animation and texture painting.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
