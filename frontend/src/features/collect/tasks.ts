export const COLLECTION_TASKS = [
  { id: "focused",   label: "focused",    seconds: 20, prompt: "Look at the screen and read normally, as if taking an exam." },
  { id: "eyes_off",  label: "distracted", seconds: 15, prompt: "Keep your head still but move ONLY your eyes off the screen." },
  { id: "neck_turn", label: "distracted", seconds: 15, prompt: "Turn your neck/head away from the screen a few times." },
  { id: "look_up",   label: "distracted", seconds: 15, prompt: "Look ABOVE the camera / at the ceiling repeatedly." },
  { id: "look_down", label: "distracted", seconds: 15, prompt: "Look DOWN at your lap/desk." },
  { id: "drowsy",    label: "drowsy",     seconds: 20, prompt: "Act sleepy: slow blinks, half-closed eyes, head dropping." },
  { id: "no_face",   label: "absent",     seconds: 12, prompt: "Move fully out of frame." },
  { id: "lean_away", label: "distracted", seconds: 15, prompt: "Lean far back / to the side, face partly out of frame." },
] as const;
