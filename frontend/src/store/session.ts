import { create } from 'zustand';

export interface EventRecord {
  id: string;
  eventType: string;
  timestampS: number;
  confidence: number | null;
  details: Record<string, unknown> | null;
}

export interface SessionState {
  id: string | null;
  start: number | null;
  end: number | null;
  mode: 'exam' | 'selftest';
  finalScore: number | null;
  pctFocused: number | null;
  verdict: string | null;
  events: EventRecord[];
  running: boolean;
}

interface SessionActions {
  startSession: (mode: 'exam' | 'selftest') => string;
  stopSession: (finalScore?: number, pctFocused?: number, verdict?: string) => void;
  addEvent: (event: Omit<EventRecord, 'id'>) => void;
  resetSession: () => void;
}

function generateId(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 32; i++) result += chars[Math.floor(Math.random() * 16)];
  return result;
}

const initialState: SessionState = {
  id: null,
  start: null,
  end: null,
  mode: 'selftest',
  finalScore: null,
  pctFocused: null,
  verdict: null,
  events: [],
  running: false,
};

export const useSessionStore = create<SessionState & SessionActions>((set) => ({
  ...initialState,

  startSession: (mode) => {
    const id = generateId();
    set({
      id,
      start: Date.now(),
      end: null,
      mode,
      finalScore: null,
      pctFocused: null,
      verdict: null,
      events: [],
      running: true,
    });
    return id;
  },

  stopSession: (finalScore, pctFocused, verdict) => {
    set({
      end: Date.now(),
      running: false,
      finalScore: finalScore ?? null,
      pctFocused: pctFocused ?? null,
      verdict: verdict ?? null,
    });
  },

  addEvent: (event) => {
    const id = generateId();
    set((state) => ({
      events: [...state.events, { ...event, id }],
    }));
  },

  resetSession: () => {
    set(initialState);
  },
}));
