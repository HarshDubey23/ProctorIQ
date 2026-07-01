import { create } from 'zustand';
import { listSessions, getBenchmarks, type StoredSession, type StoredBenchmark } from '../lib/db';

export interface TrendData {
  sessions: StoredSession[];
  benchmarks: StoredBenchmark[];
  medianScore: number;
  pctFocused: number;
  distractedRate: number;
}

interface HistoryState {
  trendData: TrendData | null;
  loading: boolean;
  loadHistory: () => Promise<void>;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function computePctFocused(session: StoredSession): number {
  if (session.events.length === 0) return 100;
  const focused = session.events.filter((e) => e.eventType === 'focused' || e.eventType === 'unknown').length;
  return Math.round((focused / session.events.length) * 100);
}

function computeDistractedRate(session: StoredSession): number {
  const start = session.start;
  const end = session.end ?? Date.now();
  const durationMin = Math.max(1, (end - start) / 60000);
  const distractedCount = session.events.filter((e) =>
    ['distracted', 'gaze_away', 'tab_switch'].includes(e.eventType)
  ).length;
  return Math.round((distractedCount / durationMin) * 10) / 10;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  trendData: null,
  loading: false,
  loadHistory: async () => {
    set({ loading: true });
    const sessions = await listSessions();
    const benchmarks = await getBenchmarks();

    const scores = sessions.map((s) => s.finalScore ?? 0).filter((s) => s > 0);
    const medianScore = scores.length > 0 ? median(scores) : 0;

    const last5 = sessions.slice(0, 5);
    const pctFocused = last5.length > 0
      ? Math.round(last5.reduce((sum, s) => sum + computePctFocused(s), 0) / last5.length)
      : 0;

    const distractedRate = last5.length > 0
      ? last5.reduce((sum, s) => sum + computeDistractedRate(s), 0) / last5.length
      : 0;

    set({
      trendData: { sessions, benchmarks, medianScore, pctFocused, distractedRate },
      loading: false,
    });
  },
}));
