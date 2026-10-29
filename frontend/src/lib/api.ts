export const API_BASE: string = import.meta.env.VITE_API_URL ?? '';

/** WebSocket origin: same host as the API, or this page's host when the API is proxied. */
export function wsBase(): string {
  if (API_BASE) return API_BASE.replace(/^http/, 'ws');
  return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
}

export const HOST_ACCOUNT_KEY = 'proctoriq_host_account';

export interface HostAccount {
  host_id: string;
  host_token: string;
}

export function getHostAccount(): HostAccount | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOST_ACCOUNT_KEY) ?? 'null') as HostAccount | null;
    return parsed?.host_id && parsed.host_token ? parsed : null;
  } catch {
    return null;
  }
}

export async function getOrCreateHostAccount(): Promise<HostAccount> {
  const existing = getHostAccount();
  if (existing) return existing;
  const response = await fetch(`${API_BASE}/api/hosts`, { method: 'POST' });
  if (!response.ok) throw new Error('Failed to create host account');
  const account = (await response.json()) as HostAccount;
  localStorage.setItem(HOST_ACCOUNT_KEY, JSON.stringify(account));
  return account;
}

/**
 * POST as this browser's teacher account. If the server no longer knows the account
 * (its database was reset), make a fresh one and retry once instead of failing.
 * Throws with the server's own error message.
 */
export async function hostPost<T>(path: string, body: unknown, failure: string): Promise<T> {
  const send = async () => {
    const account = await getOrCreateHostAccount();
    return fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Host-Token': account.host_token },
      body: JSON.stringify(body),
    });
  };
  let resp = await send();
  if (resp.status === 403 && path === '/api/papers') {
    localStorage.removeItem(HOST_ACCOUNT_KEY);
    resp = await send();
  }
  if (!resp.ok) {
    const detail = await resp.json().catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${resp.status}`;
    throw new Error(`${failure}: ${msg}`);
  }
  return resp.json() as Promise<T>;
}

/** Creates a live exam room for a paper and remembers its host token in this browser. */
export async function createLiveRoom(
  paperId: string,
  opts: { title?: string; duration_minutes?: number; max_participants?: number } = {},
): Promise<{ room_id: string; host_token: string; join_url: string }> {
  const data = await hostPost<{ room_id: string; host_token: string; join_url: string }>(
    '/api/rooms', { paper_id: paperId, ...opts }, 'Could not start the exam',
  );
  localStorage.setItem(`host_token_${data.room_id}`, data.host_token);
  return data;
}

export const EXAM_KEYS = {
  roomId: 'exam_room_id',
  sessionId: 'exam_session_id',
  studentToken: 'exam_student_token',
  displayName: 'exam_display_name',
} as const;
