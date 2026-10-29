import { afterEach, describe, expect, it, vi } from 'vitest';
import { HOST_ACCOUNT_KEY, hostPost } from './api';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('hostPost', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('replaces a teacher account the server forgot and retries once', async () => {
    localStorage.setItem(HOST_ACCOUNT_KEY, JSON.stringify({ host_id: 'h_old', host_token: 'stale' }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(403, { detail: 'Invalid host token' }))
      .mockResolvedValueOnce(json(201, { host_id: 'h_new', host_token: 'fresh' }))
      .mockResolvedValueOnce(json(201, { id: 'p_1' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(hostPost('/api/papers', { title: 't' }, "Couldn't publish")).resolves.toEqual({ id: 'p_1' });
    expect(fetchMock.mock.calls[2][1].headers['X-Host-Token']).toBe('fresh');
    expect(JSON.parse(localStorage.getItem(HOST_ACCOUNT_KEY)!).host_token).toBe('fresh');
  });

  it("reports the server's reason instead of a generic failure", async () => {
    localStorage.setItem(HOST_ACCOUNT_KEY, JSON.stringify({ host_id: 'h', host_token: 't' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(404, { detail: 'Paper not found' })));
    await expect(hostPost('/api/rooms', {}, 'Could not start the exam'))
      .rejects.toThrow('Could not start the exam: Paper not found');
  });
});
