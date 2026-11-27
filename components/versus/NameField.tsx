"use client";

import { NAME_MAX, NAME_PATTERN } from "@/lib/player";

export const nameOk = (name: string) => NAME_PATTERN.test(name.trim().replace(/\s+/g, " "));

export default function NameField({
  value,
  onChange,
  onEnter,
  showError,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  showError?: boolean;
  autoFocus?: boolean;
}) {
  const bad = showError && !nameOk(value);
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor="vs-name" className="font-display text-lg font-extrabold italic uppercase text-maize">
          Name
        </label>
        {bad && <span className="font-display text-sm font-bold italic uppercase text-destructive">2–20 letters or numbers</span>}
      </div>
      <input
        id="vs-name"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, NAME_MAX))}
        onKeyDown={(e) => {
          if (e.key === "Enter") onEnter?.();
        }}
        maxLength={NAME_MAX}
        autoComplete="nickname"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint="go"
        autoFocus={autoFocus}
        aria-invalid={bad || undefined}
        className={`h-12 w-full rounded-xl border-2 bg-mblue-deep/80 px-4 font-display text-2xl font-bold italic tracking-wide text-foreground outline-none transition placeholder:text-foreground/25 focus:border-maize focus:bg-mblue ${
          bad ? "border-destructive/80" : "border-maize/25"
        }`}
        placeholder="Wolverine"
      />
    </div>
  );
}
