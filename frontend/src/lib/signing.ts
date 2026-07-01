function canonicalJson(obj: unknown, sortedKeys?: string[]): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) {
    const items = obj.map((v) => canonicalJson(v));
    return '[' + items.join(',') + ']';
  }
  if (typeof obj === 'object') {
    const keys = sortedKeys ?? Object.keys(obj as Record<string, unknown>).sort();
    const pairs = keys
      .filter((k) => (obj as Record<string, unknown>)[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k]));
    return '{' + pairs.join(',') + '}';
  }
  return String(obj);
}

async function computeSHA256(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function toISO(t: number | null): string | null {
  return t ? new Date(t).toISOString() : null;
}

export async function computeSessionHash(session: {
  id: string;
  start: number | null;
  end: number | null;
  mode: string;
  finalScore: number | null;
  pctFocused: number | null;
  verdict: string | null;
  events: Array<{
    eventType: string;
    timestampS: number;
    confidence: number | null;
  }>;
}): Promise<string> {
  const eventsSorted = (session.events ?? [])
    .map((e) => ({
      event_type: e.eventType,
      timestamp_s: e.timestampS,
      confidence: e.confidence,
    }))
    .sort((a, b) => {
      const tDiff = a.timestamp_s - b.timestamp_s;
      return tDiff !== 0 ? tDiff : a.event_type.localeCompare(b.event_type);
    });

  const payload: Record<string, unknown> = {
    session_id: session.id,
    start: toISO(session.start),
    end: toISO(session.end),
    mode: session.mode,
    final_score: session.finalScore,
    pct_focused: session.pctFocused,
    verdict: session.verdict,
    events: eventsSorted,
  };

  const sortedKeys = Object.keys(payload).sort();
  const canonical = canonicalJson(payload, sortedKeys);
  return computeSHA256(canonical);
}

interface VerifyResponse {
  valid: boolean;
}

export async function verifySessionHash(
  sessionId: string,
  signature: string,
): Promise<boolean> {
  const baseUrl = import.meta.env.VITE_API_URL ?? '';
  try {
    const res = await fetch(`${baseUrl}/api/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, signature }),
    });
    if (!res.ok) return false;
    const data: VerifyResponse = await res.json();
    return data.valid;
  } catch {
    return false;
  }
}

export async function fetchSessionHash(
  sessionId: string,
): Promise<string | null> {
  const baseUrl = import.meta.env.VITE_API_URL ?? '';
  try {
    const res = await fetch(`${baseUrl}/api/verify/${sessionId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.hash as string;
  } catch {
    return null;
  }
}
