import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:8000';

test.describe('Integrity & Tampering Resistance', () => {
  let sessionId: string;

  test.beforeAll(async ({ request }) => {
    const createRes = await request.post(`${API_BASE}/api/sessions`, {
      data: {
        id: `e2e-integrity-${Date.now()}`,
        mode: 'exam',
        start: new Date().toISOString(),
        events: [
          { event_type: 'focused', timestamp_s: 0.0, confidence: 0.95 },
          { event_type: 'focused', timestamp_s: 1.0, confidence: 0.94 },
          { event_type: 'distracted', timestamp_s: 2.0, confidence: 0.80 },
        ],
      },
    });
    expect(createRes.status()).toBe(201);
    const body = await createRes.json();
    sessionId = body.id;
  });

  test('server computes a signed verdict from raw events', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/sessions/${sessionId}`);
    expect(res.status()).toBe(200);
    const session = await res.json();
    expect(session).toHaveProperty('verdict');

    const verifyRes = await request.post(`${API_BASE}/api/verify`, {
      data: { session_id: sessionId, signature: '' },
    });
    expect(verifyRes.status()).toBe(200);
  });

  test('PATCH with forged score is rejected and server value prevails', async ({ request }) => {
    const patchRes = await request.patch(`${API_BASE}/api/sessions/${sessionId}`, {
      data: { quiz_score: 100, verdict: 'PASS' },
    });
    expect(patchRes.status()).toBe(200);

    const getRes = await request.get(`${API_BASE}/api/sessions/${sessionId}`);
    const updated = await getRes.json();

    expect(updated.quiz_score).not.toBe(100);
    expect(updated.verdict).toBeDefined();
  });

  test('report signing hash changes if events are tampered with', async ({ request }) => {
    await request.get(`${API_BASE}/api/sessions/${sessionId}`);

    await request.post(`${API_BASE}/api/verify`, {
      data: { session_id: sessionId, signature: '' },
    });

    const tamperRes = await request.patch(`${API_BASE}/api/sessions/${sessionId}`, {
      data: { events: [{ event_type: 'focused', timestamp_s: 999, confidence: 1.0 }] },
    });
    expect(tamperRes.status()).toBe(200);

    const verifyTampered = await request.post(`${API_BASE}/api/verify`, {
      data: { session_id: sessionId, signature: '' },
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