"use client";

import { Spinner, TypographyH1 } from "@kivora/nextjs";

export function Splash() {
  return (
    <div
      style={{ height: "100dvh", display: "grid", placeContent: "center", justifyItems: "center", gap: "1.25rem" }}
    >
      <TypographyH1>Forma</TypographyH1>
      <Spinner size="lg" label="Loading" />
    </div>
  );
}
