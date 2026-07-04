export const SIGNAL = {
  gaze:  { hex: "#3E8E7E", label: "Gaze / Attention" },
  head:  { hex: "#5B6BB0", label: "Head-Pose" },
  audio: { hex: "#A8556E", label: "Audio Anomaly" },
  tab:   { hex: "#C08A2E", label: "Tab-Focus" },
} as const;

export const SIGNAL_ORDER = ["gaze", "head", "audio", "tab"] as const;
