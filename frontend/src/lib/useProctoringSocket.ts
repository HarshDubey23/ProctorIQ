import { useCallback, useRef } from 'react';
import type { DetectionResult } from '../workers/detection.worker';
import { WSClient, type WSStatus } from './ws';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const WS_BASE = API_BASE.replace(/^http/, 'ws');

export const NON_FOCUSED_STATES = new Set(['distracted', 'absent', 'drowsy', 'multi']);

export interface ProctoringSocketOptions {
  roomId?: string;
  onStatus?: (status: WSStatus) => void;
  onMessage?: (msg: unknown) => void;
}

export function useProctoringSocket() {
  const wsRef = useRef<WSClient | null>(null);
  const startTimeRef = useRef<number>(0);
  const sessionIdRef = useRef<string>('');
  const prevAttentionRef = useRef<string>('focused');
  const lastFlagTimeRef = useRef<number>(0);

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

  const connect = useCallback((sessionId: string, options?: ProctoringSocketOptions) => {
    startTimeRef.current = Date.now();
    sessionIdRef.current = sessionId;
    prevAttentionRef.current = 'focused';
    lastFlagTimeRef.current = 0;

    const params = new URLSearchParams();
    if (options?.roomId) params.set('room_id', options.roomId);
    const displayName = options?.roomId ? sessionStorage.getItem('exam_display_name') : null;
    if (displayName) params.set('display_name', displayName);
    const qs = params.toString();
    const wsUrl = `${WS_BASE}/ws/${sessionId}${qs ? `?${qs}` : ''}`;
    const ws = new WSClient(wsUrl);

    ws.onStatus((status) => {
      options?.onStatus?.(status);
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

    if (options?.onMessage) {
      ws.onMessage(options.onMessage);
    }

    ws.connect();
    wsRef.current = ws;
  }, []);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.disconnect();
      wsRef.current = null;
    }
  }, []);

  const tick = useCallback((result: DetectionResult | null) => {
    const ws = wsRef.current;
    if (!ws || ws.getStatus() !== 'connected') return;

    const attention = result?.attention ?? 'focused';

    const stateMsg = {
      type: 'state',
      attention_state: attention,
      ear: result?.ear ?? 0,
      head_pose: result?.headPose ?? { yaw: 0, pitch: 0, roll: 0 },
      face_count: result?.faceCount ?? 0,
    };
    ws.sendRaw(stateMsg);

    const prev = prevAttentionRef.current;
    const now = Date.now();
    if (attention !== prev) {
      if (NON_FOCUSED_STATES.has(attention)) {
        sendFlag(attention, result?.confidence ?? null, {
          previous_state: prev,
          ear: result?.ear ?? null,
        });
        lastFlagTimeRef.current = now;
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
  }, [sendFlag]);

  const getSessionId = useCallback(() => sessionIdRef.current, []);

  return { connect, disconnect, tick, sendFlag, getSessionId };
}
