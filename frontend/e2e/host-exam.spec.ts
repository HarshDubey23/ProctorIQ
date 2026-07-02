import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:8000';

test.describe('Host Exam Flow', () => {
  test.describe('Room creation via API', () => {
    test('POST /api/rooms creates a room and returns join_url', async ({ request }) => {
      const res = await request.post(`${API_BASE}/api/rooms`, {
        data: { title: 'E2E Test Exam', duration_minutes: 30, max_participants: 5 },
      });
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body).toHaveProperty('room_id');
      expect(body).toHaveProperty('host_token');
      expect(body).toHaveProperty('join_url');
      expect(body.join_url).toContain('/join/');
    });

    test('GET /api/rooms/{id} returns room details', async ({ request }) => {
      const create = await request.post(`${API_BASE}/api/rooms`, {
        data: { title: 'Room Detail Test', duration_minutes: 15 },
      });
      const { room_id } = await create.json();

      const res = await request.get(`${API_BASE}/api/rooms/${room_id}`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.title).toBe('Room Detail Test');
      expect(body.status).toBe('open');
    });

    test('join-check returns 404 for nonexistent room', async ({ request }) => {
      const res = await request.get(`${API_BASE}/api/rooms/ZZZZZZ/join-check`);
      expect(res.status()).toBe(404);
    });
  });

  test.describe('Host UI flow', () => {
    test('create room form loads on /host', async ({ page }) => {
      await page.goto('/host');
      await expect(page.getByLabel('Exam title')).toBeVisible();
      await expect(page.getByLabel('Duration in minutes')).toBeVisible();
      await expect(page.getByLabel('Max participants')).toBeVisible();
      await expect(page.getByRole('button', { name: /create exam/i })).toBeVisible();
    });

    test('create room form submits and navigates to share screen', async ({ page }) => {
      await page.goto('/host');
      await page.getByLabel('Exam title').fill('E2E Host Test');
      await page.getByLabel('Duration in minutes').fill('30');
      await page.getByLabel('Max participants').fill('3');
      await page.getByRole('button', { name: /create exam/i }).click();

      await expect(page.getByText(/share this link/i).or(page.getByText(/copy/i))).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Join flow', () => {
    test('join page loads for a valid room', async ({ page }) => {
      const create = await (await fetch(`${API_BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Join Test', max_participants: 2 }),
      })).json();

      await page.goto(`/join/${create.room_id}`);
      await expect(page.getByText('Join Test')).toBeVisible();
      await expect(page.getByLabel('Display name')).toBeVisible();
      await expect(page.getByRole('button', { name: /join exam/i })).toBeVisible();
    });

    test('join page shows error for nonexistent room', async ({ page }) => {
      await page.goto('/join/ZZZZZZ');
      await expect(page.getByText(/not found/i).or(page.getByText(/error/i))).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('Multi-participant host-exam flow', () => {
    test('create room, join as participant, host dashboard shows participant', async ({ browser }) => {
      const apiBase = API_BASE;

      const createRes = await (await fetch(`${apiBase}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Multi E2E', max_participants: 2 }),
      })).json();

      const { room_id } = createRes;

      const hostPage = await browser.newPage();
      await hostPage.goto(`/host/${room_id}`);
      await expect(hostPage.getByText(/waiting for participants/i)).toBeVisible({ timeout: 5000 });

      const joinPage = await browser.newPage();
      await joinPage.goto(`/join/${room_id}`);
      await joinPage.getByLabel('Display name').fill('E2E Participant');
      await joinPage.getByRole('button', { name: /join exam/i }).click();

      await expect(hostPage.getByText('E2E Participant')).toBeVisible({ timeout: 10000 });

      const dashboard = await (await fetch(`${apiBase}/api/rooms/${room_id}`, {
        headers: { 'Content-Type': 'application/json' },
      })).json();
      expect(dashboard.member_count).toBeGreaterThanOrEqual(1);
      expect(dashboard.members.some((m: Record<string, unknown>) => m.display_name === 'E2E Participant')).toBe(true);

      await hostPage.close();
      await joinPage.close();
    });

    test('join flow lands participant on exam panel, not landing screen — regression', async ({ browser }) => {
      const apiBase = API_BASE;

      const createRes = await (await fetch(`${apiBase}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Regression E2E', max_participants: 2 }),
      })).json();

      const { room_id } = createRes;

      const joinPage = await browser.newPage();
      await joinPage.goto(`/join/${room_id}`);
      await joinPage.getByLabel('Display name').fill('Regression Participant');
      await joinPage.getByRole('button', { name: /join exam/i }).click();

      await expect(joinPage.getByText('Timed Exam')).toBeVisible({ timeout: 15000 });
      await expect(joinPage.getByRole('button', { name: /begin exam/i })).toBeVisible();

      await joinPage.close();
    });
  });
});