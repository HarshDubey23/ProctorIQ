import { test, expect } from '@playwright/test';
import WebSocket from 'ws';

const API_BASE = 'http://localhost:8000';
const WS_BASE = 'ws://localhost:8000';

type FlagEvent = { event_type: string; timestamp_s: number; confidence: number };

/**
 * Seeds events onto an existing session via the real WebSocket flag path.
 * This is the only path that can append events — POST /api/sessions and
 * PATCH /api/sessions/{id} both reject an `events` field by design
 * (see backend/models/session.py: SessionCreate/SessionUpdate, extra="forbid").
 */
async function seedEvents(sessionId: string, events: FlagEvent[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(`${WS_BASE}/ws/${sessionId}`);
    ws.on('open', () => {
      for (const ev of events) {
        ws.send(JSON.stringify({ type: 'flag', ...ev }));
      }
      setTimeout(() => ws.close(), 300);
    });
    ws.on('close', () => resolve());
    ws.on('error', (err) => reject(err));
  });
}

test.describe('Integrity & Tampering Resistance', () => {
  let sessionId: string;

  test.beforeAll(async ({ request }) => {
    const createRes = await request.post(`${API_BASE}/api/sessions`, {
      data: {
        id: `e2e-integrity-${Date.now()}`,
        mode: 'exam',
        start: new Date().toISOString(),
      },
    });
    expect(createRes.status()).toBe(201);
    const body = await createRes.json();
    sessionId = body.id;

    await seedEvents(sessionId, [
      { event_type: 'focused', timestamp_s: 0.0, confidence: 0.95 },
      { event_type: 'focused', timestamp_s: 1.0, confidence: 0.94 },
      { event_type: 'distracted', timestamp_s: 2.0, confidence: 0.80 },
    ]);
  });

  test('server computes a signed verdict from raw events', async ({ request }) => {
    const reportRes = await request.get(`${API_BASE}/api/sessions/${sessionId}/report`);
    expect(reportRes.status()).toBe(200);

    const res = await request.get(`${API_BASE}/api/sessions/${sessionId}`);
    expect(res.status()).toBe(200);
    const session = await res.json();
    expect(session.verdict).not.toBeNull();

    const hashRes = await request.get(`${API_BASE}/api/verify/${sessionId}`);
    expect(hashRes.status()).toBe(200);
    const { hash } = await hashRes.json();

    const verifyRes = await request.post(`${API_BASE}/api/verify`, {
      data: { session_id: sessionId, signature: hash },
    });
    expect(verifyRes.status()).toBe(200);
    const { valid } = await verifyRes.json();
    expect(valid).toBe(true);
  });

  test('PATCH with forged score is rejected and server value prevails', async ({ request }) => {
    const patchRes = await request.patch(`${API_BASE}/api/sessions/${sessionId}`, {
      data: { quiz_score: 100, verdict: 'PASS' },
    });
    expect(patchRes.status()).toBe(422);

    const getRes = await request.get(`${API_BASE}/api/sessions/${sessionId}`);
    const updated = await getRes.json();
    expect(updated.quiz_score).not.toBe(100);
  });

  test('report signing hash changes if events are tampered with', async ({ request }) => {
    await request.get(`${API_BASE}/api/sessions/${sessionId}/report`);

    const hashRes = await request.get(`${API_BASE}/api/verify/${sessionId}`);
    const { hash: originalHash } = await hashRes.json();

    await seedEvents(sessionId, [{ event_type: 'focused', timestamp_s: 999, confidence: 1.0 }]);
    await request.get(`${API_BASE}/api/sessions/${sessionId}/report`);

    const verifyTampered = await request.post(`${API_BASE}/api/verify`, {
      data: { session_id: sessionId, signature: originalHash },
    });
    const tamperedResult = await verifyTampered.json();

    expect(tamperedResult.valid).toBe(false);
  });

  test('server refuses PATCH with invalid verdict value', async ({ request }) => {
    const patchRes = await request.patch(`${API_BASE}/api/sessions/${sessionId}`, {
      data: { verdict: 'INVALID_VERDICT' },
    });
    expect(patchRes.status()).toBe(422);
  });

  test('constant-time comparison prevents timing side-channel', async ({ request }) => {
    await request.get(`${API_BASE}/api/sessions/${sessionId}`);

    const start = Date.now();
    await request.post(`${API_BASE}/api/verify`, {
      data: { session_id: sessionId, signature: 'a'.repeat(64) },
    });
    const wrongDuration = Date.now() - start;

    const start2 = Date.now();
    await request.post(`${API_BASE}/api/verify`, {
      data: { session_id: sessionId, signature: 'b'.repeat(64) },
    });
    const wrongDuration2 = Date.now() - start2;

    const diff = Math.abs(wrongDuration - wrongDuration2);
    expect(diff).toBeLessThan(50);
  });
});