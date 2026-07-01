import { useState, useEffect, useCallback } from 'react';
import { getSession, listSessions, type StoredSession } from '../../lib/db';
import { computeSessionHash } from '../../lib/signing';

export interface ReportData {
  session: StoredSession;
  durationSec: number;
  eventCounts: Record<string, number>;
  hash: string;
}

export function useReport(sessionId?: string) {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionList, setSessionList] = useState<StoredSession[]>([]);

  const loadReport = useCallback(async (id: string) => {
    setLoading(true);
    const session = await getSession(id);
    if (!session) {
      setReport(null);
      setLoading(false);
      return;
    }

    const start = session.start;
    const end = session.end ?? Date.now();
    const durationSec = Math.max(1, Math.floor((end - start) / 1000));

    const eventCounts: Record<string, number> = {};
    for (const ev of session.events) {
      eventCounts[ev.eventType] = (eventCounts[ev.eventType] ?? 0) + 1;
    }

    const hash = await computeSessionHash(session);

    setReport({ session, durationSec, eventCounts, hash });
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
      // Push session to backend first (in case it's only stored locally)
      await fetch(`${baseUrl}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: session.id,
          start: new Date(session.start).toISOString(),
          end: session.end ? new Date(session.end).toISOString() : null,
          mode: session.mode,
          final_score: session.finalScore,
          pct_focused: session.pctFocused,
          verdict: session.verdict,
          events: session.events.map((e) => ({
            id: crypto.randomUUID(),
            session_id: session.id,
            event_type: e.eventType,
            timestamp_s: e.timestampS,
            confidence: e.confidence,
            details: e.details,
          })),
          benchmark: session.benchmark
            ? {
                model_latency_ms: session.benchmark.modelLatencyMs,
                inference_count: session.benchmark.inferenceCount,
                pca_latency_ms: session.benchmark.pcaLatencyMs,
                total_events: 0,
              }
            : null,
        }),
      });
    } catch {
      // Backend unreachable — will fall through to JSON export
    }

    try {
      const res = await fetch(`${baseUrl}/api/sessions/${session.id}/report`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proctoriq-${session.id.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    } catch {
      // Backend PDF unavailable — export as JSON fallback
    }

    // Fallback: export session data as JSON
    const fallbackData = {
      id: session.id,
      mode: session.mode,
      start: new Date(session.start).toISOString(),
      end: session.end ? new Date(session.end).toISOString() : null,
      finalScore: session.finalScore,
      pctFocused: session.pctFocused,
      verdict: session.verdict,
      events: session.events,
      note: 'PDF generation requires the backend to be running. This JSON contains the same session data.',
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
