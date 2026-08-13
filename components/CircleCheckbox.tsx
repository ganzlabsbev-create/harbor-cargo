"use client";

import { Check } from "lucide-react";

type CircleCheckboxColor = "blue" | "green" | "orange" | "red";

const COLOR_MAP: Record<CircleCheckboxColor, { border: string; bg: string; ring: string }> = {
  blue: { border: "border-harbor-blue", bg: "bg-harbor-blue", ring: "shadow-glow-blue" },
  green: { border: "border-accent-green", bg: "bg-accent-green", ring: "shadow-glow-green" },
  orange: { border: "border-harbor-orange", bg: "bg-harbor-orange", ring: "shadow-glow-orange" },
  red: { border: "border-accent-red", bg: "bg-accent-red", ring: "shadow-glow-red" },
};

export default function CircleCheckbox({
  checked,
  onChange,
  color = "blue",
  size = 20,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  color?: CircleCheckboxColor;
  size?: number;
  "aria-label"?: string;
}) {
  const c = COLOR_MAP[color];

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onChange();
      }}
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full border-[1.5px] transition active:scale-90 ${
        checked ? `${c.bg} ${c.border} ${c.ring}` : "border-base-border bg-base-surface2 hover:border-ink-faint"
      }`}
    >
      {checked && <Check size={size * 0.65} strokeWidth={3} className="text-white" />}
    </button>
  );
}
