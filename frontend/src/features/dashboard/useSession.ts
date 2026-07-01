import { useState, useCallback, useRef, useEffect } from 'react';
import type { DetectionResult } from '../../workers/detection.worker';
import { saveSession } from '../../lib/db';
import type { StoredSession, StoredEvent } from '../../lib/db';
import { WSClient, type WSStatus } from '../../lib/ws';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

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

const NON_FOCUSED_STATES = new Set(['distracted', 'absent', 'drowsy', 'multi']);

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
  const wsRef = useRef<WSClient | null>(null);
  const sessionIdRef = useRef<string>('');
  const prevAttentionRef = useRef<string>('focused');
  const lastFlagTimeRef = useRef<number>(0);
  const lastAttentionChangeTimeRef = useRef<number>(0);

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

  const sendFlag = useCallback((eventType: string, confidence: number | null, details: Record<string, unknown> | null) => {
    const ws = wsRef.current;
    if (!ws || ws.getStatus() !== 'connected') return;
    const msg = {
      type: 'flag',
      event_type: eventType,
      timestamp_s: Math.floor((Date.now() - startTimeRef.current) / 1000),
      confidence,
      details,
    };
    ws.sendRaw(msg);
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

    const ws = wsRef.current;
    if (ws && ws.getStatus() === 'connected') {
      const stateMsg = {
        type: 'state',
        attention_state: attention,
        ear: result?.ear ?? 0,
        head_pose: result?.headPose ?? { yaw: 0, pitch: 0, roll: 0 },
        face_count: result?.faceCount ?? 0,
      };
      ws.sendRaw(stateMsg);

      const prev = prevAttentionRef.current;
      if (attention !== prev) {
        if (NON_FOCUSED_STATES.has(attention)) {
          sendFlag(attention, result?.confidence ?? null, {
            previous_state: prev,
            ear: result?.ear ?? null,
          });
          lastFlagTimeRef.current = now;
          lastAttentionChangeTimeRef.current = now;
        }
        prevAttentionRef.current = attention;
      } else if (NON_FOCUSED_STATES.has(attention) && now - lastFlagTimeRef.current >= 5000) {
        sendFlag(attention, result?.confidence ?? null, {
          previous_state: prev,
          heartbeat: true,
          ear: result?.ear ?? null,
        });
        lastFlagTimeRef.current = now;
      }
    }
  }, [getResult, computeScore, sendFlag]);

  const start = useCallback(() => {
    startTimeRef.current = Date.now();
    gazeCountRef.current = 0;
    blinkCountRef.current = 0;
    historyRef.current = [];
    prevAttentionRef.current = 'focused';
    lastFlagTimeRef.current = 0;
    lastAttentionChangeTimeRef.current = 0;
    setHistory([]);
    setState('running');

    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;

    const wsUrl = `${WS_BASE}/ws/${sessionId}${roomId ? `?room_id=${roomId}` : ''}`;
    const ws = new WSClient(wsUrl);
    wsRef.current = ws;

    ws.onStatus((status) => {
      setWsStatus(status);
      if (status === 'connected') {
        ws.sendRaw({
          type: 'state',
          attention_state: 'focused',
          ear: 0,
          head_pose: { yaw: 0, pitch: 0, roll: 0 },
          face_count: 0,
        });
      }
    });

    ws.connect();

    tickRef.current = setInterval(tick, 1000);
  }, [tick, roomId]);

  const stop = useCallback(async () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }
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
      if (wsRef.current) {
        wsRef.current.disconnect();
        wsRef.current = null;
      }
    };
  }, []);

  return { state, history, metrics, wsStatus, start, stop };
}
