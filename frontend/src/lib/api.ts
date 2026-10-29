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

/** Creates a live exam room for a paper and remembers its host token in this browser. */
export async function createLiveRoom(
  paperId: string,
  opts: { title?: string; duration_minutes?: number; max_participants?: number } = {},
): Promise<{ room_id: string; host_token: string; join_url: string }> {
  const account = await getOrCreateHostAccount();
  const resp = await fetch(`${API_BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Host-Token': account.host_token },
    body: JSON.stringify({ paper_id: paperId, ...opts }),
  });
  if (!resp.ok) {
    const detail = await resp.json().catch(() => null);
    throw new Error(detail?.detail ?? `Could not start the exam (HTTP ${resp.status})`);
  }
  const data = await resp.json();
  localStorage.setItem(`host_token_${data.room_id}`, data.host_token);
  return data;
}

export const EXAM_KEYS = {
  roomId: 'exam_room_id',
  sessionId: 'exam_session_id',
  studentToken: 'exam_student_token',
  displayName: 'exam_display_name',
} as const;
