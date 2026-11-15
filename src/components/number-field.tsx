"use client";

import { useState, type ComponentProps } from "react";
import { Input } from "@kivora/nextjs";

type Props = Omit<ComponentProps<typeof Input>, "type" | "value" | "onChange" | "min" | "max"> & {
  value: number;
  min?: number;
  max?: number;
  integer?: boolean;
  onValueChange: (value: number) => void;
};

// Keeps the typed text while editing so intermediate values outside the range (e.g. "5" on the way to "500") are not reverted.
export function NumberField({ value, min = -Infinity, max = Infinity, integer = false, onValueChange, onFocus, onBlur, ...props }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const valid = (next: number) => Number.isFinite(next) && next >= min && next <= max && (!integer || Number.isInteger(next));
  return <Input {...props} type="number" min={Number.isFinite(min) ? min : undefined} max={Number.isFinite(max) ? max : undefined}
    value={draft ?? String(value)}
    onFocus={(event) => { setDraft(String(value)); onFocus?.(event); }}
    onChange={(event) => {
      setDraft(event.target.value);
      const next = event.target.valueAsNumber;
      if (event.target.value !== "" && valid(next)) onValueChange(next);
    }}
    onBlur={(event) => {
      const next = event.target.valueAsNumber;
      if (event.target.value !== "" && Number.isFinite(next)) {
        const clamped = Math.min(max, Math.max(min, integer ? Math.round(next) : next));
        if (clamped !== value) onValueChange(clamped);
      }
      setDraft(null);
      onBlur?.(event);
    }} />;
}
