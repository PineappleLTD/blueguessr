"use client";

import { TriangleAlert } from "lucide-react";
import { setMapSetting, useMapSetting, type MapSetting } from "@/lib/map-settings";

const OPTIONS: { key: MapSetting; label: string }[] = [
  { key: "landmarks", label: "Landmarks" },
  { key: "labels", label: "Map labels" },
  { key: "outlines", label: "Campus outlines" },
];

const SIZES = {
  sm: { pill: "h-8 gap-1.5 rounded-xl px-2.5 text-xs", box: "size-3.5", warn: "text-[11px] px-2 py-1" },
  lg: { pill: "h-11 gap-2.5 rounded-2xl px-4 text-sm", box: "size-4", warn: "text-xs px-3 py-1.5" },
};

function Toggle({ setting, label, size }: { setting: MapSetting; label: string; size: "sm" | "lg" }) {
  const on = useMapSetting(setting);
  return (
    <label
      className={`flex cursor-pointer items-center border border-maize/30 bg-night/80 font-bold tracking-wide whitespace-nowrap text-maize uppercase backdrop-blur select-none hover:bg-mblue ${SIZES[size].pill}`}
    >
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => setMapSetting(setting, e.target.checked)}
        className={`accent-maize ${SIZES[size].box}`}
      />
      {label}
    </label>
  );
}

/** The map's checkboxes, picked before a game starts, with a warning while labels are off. */
export default function MapOptions({
  size = "sm",
  align = "end",
  className = "",
}: {
  size?: "sm" | "lg";
  align?: "end" | "center";
  className?: string;
}) {
  const labels = useMapSetting("labels");
  return (
    <div className={`flex flex-col gap-1.5 ${align === "end" ? "items-end" : "items-center"} ${className}`}>
      <div className={`flex flex-wrap gap-1.5 ${align === "end" ? "justify-end" : "justify-center"}`}>
        {OPTIONS.map((o) => (
          <Toggle key={o.key} setting={o.key} label={o.label} size={size} />
        ))}
      </div>
      {!labels && (
        <p
          role="status"
          className={`flex items-center gap-1.5 rounded-lg border border-[#FF9F43]/40 bg-[#2B1600]/90 font-bold text-[#FFB347] backdrop-blur ${SIZES[size].warn}`}
        >
          <TriangleAlert className="size-3.5 shrink-0" strokeWidth={2.6} aria-hidden />
          No street or stop names: much harder
        </p>
      )}
    </div>
  );
}
