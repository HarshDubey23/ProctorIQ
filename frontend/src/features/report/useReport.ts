import { useState, useEffect, useCallback } from 'react';
import { getSession, listSessions, type StoredSession } from '../../lib/db';
import { computeSessionHash, fetchSessionHash } from '../../lib/signing';

export interface ReportData {
  session: StoredSession;
  durationSec: number;
  eventCounts: Record<string, number>;
  hash: string;
  serverVerified: boolean;
}

export function useReport(sessionId?: string) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionList, setSessionList] = useState<StoredSession[]>([]);

  const loadReport = useCallback(async (id: string) => {
    setLoading(true);

    const baseUrl = import.meta.env.VITE_API_URL ?? '';

    let session: StoredSession | null = null;
    let serverVerified = false;

    try {
      const res = await fetch(`${baseUrl}/api/sessions/${id}`);
      if (res.ok) {
        const serverSession = await res.json();
        session = {
          id: serverSession.id,
          start: new Date(serverSession.start).getTime(),
          end: serverSession.end ? new Date(serverSession.end).getTime() : null,
          mode: serverSession.mode ?? 'selftest',
          quizScore: serverSession.quiz_score ?? null,
          finalScore: serverSession.final_score,
          pctFocused: serverSession.pct_focused,
          verdict: serverSession.verdict,
          events: (serverSession.events ?? []).map((e: Record<string, unknown>) => ({
            eventType: e.event_type as string,
            timestampS: e.timestamp_s as number,
            confidence: e.confidence as number | null,
            details: e.details as Record<string, unknown> | null,
          })),
          benchmark: serverSession.benchmark ? {
            modelLatencyMs: (serverSession.benchmark as Record<string, unknown>).model_latency_ms as number,
            inferenceCount: (serverSession.benchmark as Record<string, unknown>).inference_count as number,
            pcaLatencyMs: (serverSession.benchmark as Record<string, unknown>).pca_latency_ms as number,
          } : null,
        };
        serverVerified = true;
      }
    } catch {
      // Backend unreachable — fall through to local
    }

    if (!session) {
      const localSession = await getSession(id);
      if (!localSession) {
        setReport(null);
        setLoading(false);
        return;
      }
      session = localSession;
    }

    const start = session.start;
    const end = session.end ?? Date.now();
    const durationSec = Math.max(1, Math.floor((end - start) / 1000));

    const eventCounts: Record<string, number> = {};
    for (const ev of session.events) {
      eventCounts[ev.eventType] = (eventCounts[ev.eventType] ?? 0) + 1;
    }

    let hash: string;
    if (serverVerified) {
      const serverHash = await fetchSessionHash(id);
      hash = serverHash ?? (await computeSessionHash(session));
    } else {
      hash = await computeSessionHash(session);
    }

    setReport({ session, durationSec, eventCounts, hash, serverVerified });
    setLoading(false);
  }, []);

  useEffect(() => {
    listSessions().then((all) => {
      setSessionList(all);
      const targetId = sessionId ?? all[0]?.id;
      if (targetId) {
        loadReport(targetId);
      } else {
        setLoading(false);
      }
    });
  }, [sessionId, loadReport]);

  const downloadPDF = useCallback(async () => {
    if (!report) return;
    const baseUrl = import.meta.env.VITE_API_URL ?? '';
    const session = report.session;

    try {
      const res = await fetch(`${baseUrl}/api/sessions/${session.id}/report`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `proctoriq-${session.id.slice(0, 8)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      // Backend PDF unavailable — export as JSON fallback
    }

    const fallbackData = {
      id: session.id,
      mode: session.mode,
      start: new Date(session.start).toISOString(),
      end: session.end ? new Date(session.end).toISOString() : null,
      finalScore: session.finalScore,
      pctFocused: session.pctFocused,
      verdict: session.verdict,
      events: session.events,
      serverVerified: report.serverVerified,
      note: report.serverVerified
        ? 'This report data was fetched from the server.'
        : 'PDF generation requires the backend to be running. This JSON contains the same session data.',
    };
    const blob = new Blob([JSON.stringify(fallbackData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proctoriq-${session.id.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report]);

  return { report, loading, sessionList, loadReport, downloadPDF };
}
