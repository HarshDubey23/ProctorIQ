export type StatusState = "focused" | "distracted" | "absent" | "drowsy" | "multi" | "demo" | "waiting";

interface StatusPillProps {
  state: StatusState;
}

const PILL_CONFIG: Record<StatusState, { icon: string; label: string; borderColor: string; textColor: string }> = {
  focused:   { icon: "\u25CF", label: "Focused",    borderColor: "#2F5D50", textColor: "#2F5D50" },
  distracted:{ icon: "\u25C8", label: "Distracted", borderColor: "#B57A1E", textColor: "#B57A1E" },
  absent:    { icon: "\u25CB", label: "No Face",    borderColor: "#B57A1E", textColor: "#B57A1E" },
  drowsy:    { icon: "\u263C", label: "Drowsy",     borderColor: "#3E8E7E", textColor: "#3E8E7E" },
  multi:     { icon: "\u25C9", label: "Multiple",   borderColor: "#B57A1E", textColor: "#B57A1E" },
  demo:      { icon: "\u25A1", label: "Demo Mode",  borderColor: "#B57A1E", textColor: "#B57A1E" },
  waiting:   { icon: "\u25CC", label: "Waiting",    borderColor: "#5B6BB0", textColor: "#5B6BB0" },
};

export function StatusPill({ state }: StatusPillProps) {
  const cfg = PILL_CONFIG[state];

  return (
    <span
      className="chip"
      style={{ borderColor: cfg.borderColor, color: cfg.textColor }}
      role="status"
      aria-live="polite"
      aria-label={`Attention status: ${cfg.label}`}
    >
      <span aria-hidden="true">{cfg.icon} </span>
      {cfg.label}
    </span>
  );
}
