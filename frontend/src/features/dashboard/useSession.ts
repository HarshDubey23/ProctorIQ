import { useState, useCallback, useRef, useEffect } from 'react';
import type { DetectionResult } from '../../workers/detection.worker';
import { saveSession } from '../../lib/db';
import type { StoredSession, StoredEvent } from '../../lib/db';
import { type WSStatus } from '../../lib/ws';
import { useProctoringSocket } from '../../lib/useProctoringSocket';

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
  const [wsStatus, setWsStatus] = useState<WSStatus>('disconnected');
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
  const sessionIdRef = useRef<string>('');
  const { connect: wsConnect, disconnect: wsDisconnect, tick: wsTick } = useProctoringSocket();

  const computeScore = useCallback((result: DetectionResult | null): number => {
    if (!result) return 0;
    switch (result.attention) {
      case 'focused': return Math.round(75 + result.confidence * 25);
      case 'distracted': return Math.round(result.confidence * 60);
      case 'absent': return 0;
      case 'drowsy': return Math.round(result.confidence * 50);
      case 'multi': return Math.round(result.confidence * 35);
      default:
        console.warn('[useSession] Unknown attention label:', result.attention);
        return 0;
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

    wsTick(result);
  }, [getResult, computeScore, wsTick]);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    gazeCountRef.current = 0;
    blinkCountRef.current = 0;
    historyRef.current = [];
    setHistory([]);
    setState('running');

    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;

    wsConnect(sessionId, {
      roomId,
      onStatus: (status) => setWsStatus(status),
    });

    tickRef.current = setInterval(tick, 1000);
  }, [tick, roomId, wsConnect]);

  const stop = useCallback(async () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    wsDisconnect();
    setWsStatus('disconnected');
    const lastMetrics = { ...metrics };
    const totalEvents: StoredEvent[] = historyRef.current.map((h) => ({
      eventType: h.attention,
      timestampS: Math.floor((h.timestamp - startTimeRef.current) / 1000),
      confidence: null,
      details: null,
    }));
    const sessionRecord: StoredSession = {
      id: sessionIdRef.current || `session-${startTimeRef.current}`,
      start: startTimeRef.current,
      end: Date.now(),
      mode: 'selftest',
      quizScore: null,
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
  }, [metrics, wsDisconnect]);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      wsDisconnect();
    };
  }, [wsDisconnect]);

  return { state, history, metrics, wsStatus, start, stop };
}
