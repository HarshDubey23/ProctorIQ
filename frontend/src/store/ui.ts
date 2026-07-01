import { create } from 'zustand';

export type PanelId = 'landing' | 'exam' | 'session' | 'report' | 'trends' | 'settings';

export const PANEL_ORDER: PanelId[] = [
  'landing',
  'exam',
  'session',
  'report',
  'trends',
  'settings',
];

export type Mode = 'exam' | 'selftest';

interface UISettings {
  camera: boolean;
  microphone: boolean;
  notifications: boolean;
}

interface UIState {
  activePanel: PanelId;
  mode: Mode;
  settings: UISettings;
  setActivePanel: (panel: PanelId) => void;
  nextPanel: () => void;
  prevPanel: () => void;
  setMode: (mode: Mode) => void;
  updateSettings: (patch: Partial<UISettings>) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activePanel: 'landing',
  mode: 'exam',
  settings: {
    camera: true,
    microphone: false,
    notifications: true,
  },
  setActivePanel: (panel) => set({ activePanel: panel }),
  nextPanel: () =>
    set((state) => {
      const idx = PANEL_ORDER.indexOf(state.activePanel);
      const next = idx < PANEL_ORDER.length - 1 ? idx + 1 : 0;
      return { activePanel: PANEL_ORDER[next] };
    }),
  prevPanel: () =>
    set((state) => {
      const idx = PANEL_ORDER.indexOf(state.activePanel);
      const prev = idx > 0 ? idx - 1 : PANEL_ORDER.length - 1;
      return { activePanel: PANEL_ORDER[prev] };
    }),
  setMode: (mode) => set({ mode }),
  updateSettings: (patch) =>
    set((state) => ({ settings: { ...state.settings, ...patch } })),
}));
