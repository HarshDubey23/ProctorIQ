import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:8000';

async function createPaper() {
  const res = await fetch(`${API_BASE}/api/papers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'E2E Paper',
      subject: 'Testing',
      duration_minutes: 30,
      questions: [
        { id: 'q1', type: 'mcq-single', title: 'Capital of France?', body: '', marks: 1, options: ['London', 'Paris'], correct_answer: 'Paris' },
        { id: 'q2', type: 'long-answer', title: 'Explain TCP', body: '', marks: 2 },
      ],
    }),
  });
  const body = await res.json();
  return { paperId: body.id as string, ownerToken: body.host_token as string };
}

async function createRoom(paper: { paperId: string; ownerToken: string }, title: string) {
  const res = await fetch(`${API_BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Host-Token': paper.ownerToken },
    body: JSON.stringify({ title, paper_id: paper.paperId, max_participants: 5, duration_minutes: 15 }),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { room_id: string; host_token: string; join_url: string };
}

test.describe('Host Exam Flow', () => {
  let paper: { paperId: string; ownerToken: string };

  test.beforeAll(async () => {
    paper = await createPaper();
  });

  test.describe('Room API', () => {
    test('only the paper owner can start a room', async ({ request }) => {
      const res = await request.post(`${API_BASE}/api/rooms`, { data: { paper_id: paper.paperId } });
      expect(res.status()).toBe(403);
      const room = await createRoom(paper, 'E2E Test Exam');
      expect(room.join_url).toContain('/join/');
    });

    test('room details are host-only', async ({ request }) => {
      const room = await createRoom(paper, 'Room Detail Test');
      expect((await request.get(`${API_BASE}/api/rooms/${room.room_id}`)).status()).toBe(403);
      const res = await request.get(`${API_BASE}/api/rooms/${room.room_id}`, { headers: { 'X-Host-Token': room.host_token } });
      expect(res.status()).toBe(200);
      expect((await res.json()).title).toBe('Room Detail Test');
    });

    test('join-check returns 404 for nonexistent room', async ({ request }) => {
      const res = await request.get(`${API_BASE}/api/rooms/ZZZZZZ/join-check`);
      expect(res.status()).toBe(404);
    });
  });

  test.describe('Join flow', () => {
    test('join by code lands on the room page', async ({ page }) => {
      const room = await createRoom(paper, 'Join Test');
      await page.goto('/join');
      await page.getByLabel('Exam code').fill(room.room_id.toLowerCase());
      await page.getByRole('button', { name: /continue/i }).click();
      await expect(page.getByText('Join Test')).toBeVisible();
      await expect(page.getByLabel('Your full name')).toBeVisible();
    });

    test('join page shows error for nonexistent room', async ({ page }) => {
      await page.goto('/join/ZZZZZZ');
      await expect(page.getByText(/not found/i)).toBeVisible({ timeout: 10000 });
    });
  });

  test('student joins, host dashboard shows them live', async ({ browser }) => {
    const room = await createRoom(paper, 'Multi E2E');

    const hostPage = await browser.newPage();
    await hostPage.addInitScript(([id, token]) => localStorage.setItem(`host_token_${id}`, token), [room.room_id, room.host_token]);
    await hostPage.goto(`/host/${room.room_id}`);
    await expect(hostPage.getByText(/waiting for students/i)).toBeVisible({ timeout: 15000 });

    const joinPage = await browser.newPage();
    await joinPage.goto(`/join/${room.room_id}`);
    await joinPage.getByLabel('Your full name').fill('E2E Participant');
    await joinPage.getByRole('button', { name: /join exam/i }).click();

    // Lands on the exam instructions, not the landing screen.
    await expect(joinPage).toHaveURL(new RegExp(`/exam/${room.room_id}$`));
    await expect(joinPage.getByText(/before you start/i)).toBeVisible({ timeout: 15000 });
    await expect(joinPage.getByRole('button', { name: /begin exam/i })).toBeVisible();

    await expect(hostPage.getByText('E2E Participant')).toBeVisible({ timeout: 15000 });

    await hostPage.close();
    await joinPage.close();
  });
});
