import { useState, useCallback, useRef, useEffect } from 'react';
import type { DetectionResult } from '../../workers/detection.worker';
import { saveSession } from '../../lib/db';
import type { StoredSession, StoredEvent } from '../../lib/db';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export type SessionState = 'idle' | 'running';

export interface AttentionSample {
  timestamp: number;
  score: number;
  attention: string;
}

export interface SessionMetrics {
  score: number;
  attentionLabel: string;
  avgScore: number;
  totalBlinks: number;
  blinkRate: number;
  gazeAwayCount: number;
  faceCount: number;
  events: number;
  duration: number;
}

export function useSession(getResult: () => DetectionResult | null, roomId?: string) {
  const [state, setState] = useState<SessionState>('idle');
  const [history, setHistory] = useState<AttentionSample[]>([]);
  const [metrics, setMetrics] = useState<SessionMetrics>({
    score: 0,
    attentionLabel: 'focused',
    avgScore: 0,
    totalBlinks: 0,
    blinkRate: 0,
    gazeAwayCount: 0,
    faceCount: 0,
    events: 0,
    duration: 0,
  });
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const gazeCountRef = useRef(0);
  const blinkCountRef = useRef(0);
  const historyRef = useRef<AttentionSample[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const computeScore = useCallback((result: DetectionResult | null): number => {
    if (!result) return 0;
    switch (result.attention) {
      case 'focused': return Math.round(75 + result.confidence * 25);
      case 'distracted': return Math.round(result.confidence * 60);
      case 'absent': return 0;
      case 'drowsy': return Math.round(result.confidence * 50);
      case 'multi': return Math.round(result.confidence * 35);
    }
  }, []);

  const tick = useCallback(() => {
    const result = getResult();
    const score = computeScore(result);
    const attention = result?.attention ?? 'focused';

    if (result?.gazeAway) gazeCountRef.current++;
    if (result?.blinkRate) blinkCountRef.current = result.blinkRate;

    const now = Date.now();
    const duration = startTimeRef.current > 0 ? Math.floor((now - startTimeRef.current) / 1000) : 0;

    const sample: AttentionSample = { timestamp: now, score, attention };
    historyRef.current = [...historyRef.current, sample];
    if (historyRef.current.length > 60) {
      historyRef.current = historyRef.current.slice(historyRef.current.length - 60);
    }

    const avg = historyRef.current.length > 0
      ? Math.round(historyRef.current.reduce((s, h) => s + h.score, 0) / historyRef.current.length)
      : 0;

    setHistory(historyRef.current);
    setMetrics({
      score,
      attentionLabel: attention,
      avgScore: avg,
      totalBlinks: blinkCountRef.current,
      blinkRate: blinkCountRef.current,
      gazeAwayCount: gazeCountRef.current,
      faceCount: result?.faceCount ?? 0,
      events: gazeCountRef.current,
      duration,
    });

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({
          type: 'state',
          attention_state: attention,
          ear: result?.ear ?? 0,
          head_pose: result?.headPose ?? { yaw: 0, pitch: 0, roll: 0 },
          face_count: result?.faceCount ?? 0,
        }));
      } catch { /* noop */ }
    }
  }, [getResult, computeScore]);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    gazeCountRef.current = 0;
    blinkCountRef.current = 0;
    historyRef.current = [];
    setHistory([]);
    setState('running');

    if (roomId) {
      try {
        const wsUrl = API_BASE.replace(/^http/, 'ws');
        const ws = new WebSocket(`${wsUrl}/ws/${crypto.randomUUID()}?room_id=${roomId}`);
        wsRef.current = ws;
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'state', attention_state: 'focused', ear: 0, head_pose: { yaw: 0, pitch: 0, roll: 0 }, face_count: 0 }));
        };
        ws.onerror = () => { /* noop */ };
        ws.onclose = () => { wsRef.current = null; };
      } catch { /* noop */ }
    }

    tickRef.current = setInterval(tick, 1000);
  }, [tick, roomId]);

  const stop = useCallback(async () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    const lastMetrics = { ...metrics };
    const totalEvents: StoredEvent[] = historyRef.current.map((h) => ({
      eventType: h.attention,
      timestampS: Math.floor((h.timestamp - startTimeRef.current) / 1000),
      confidence: null,
      details: null,
    }));
    const sessionRecord: StoredSession = {
      id: `session-${startTimeRef.current}`,
      start: startTimeRef.current,
      end: Date.now(),
      mode: 'selftest',
      finalScore: lastMetrics.avgScore,
      pctFocused: lastMetrics.avgScore,
      verdict: lastMetrics.avgScore >= 80 ? 'PASS' : lastMetrics.avgScore >= 50 ? 'REVIEW' : 'FLAGGED',
      events: totalEvents,
      benchmark: null,
    };
    try {
      await saveSession(sessionRecord);
    } catch { /* noop */ }
    setState('idle');
  }, [metrics]);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  return { state, history, metrics, start, stop };
}
