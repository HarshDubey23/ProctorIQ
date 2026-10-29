export type ExamState =
  | 'loading'
  | 'idle'
  | 'in_progress'
  | 'submitting'
  | 'results'
  | 'error';

export type AttentionLabel = 'focused' | 'distracted' | 'absent' | 'drowsy' | 'multi';

export interface PublicQuestion {
  id: string;
  type: string;
  title: string;
  body: string;
  marks: number;
  options: string[] | null;
}

export interface PublicPaper {
  id: string;
  title: string;
  subject: string;
  instructions: string;
  duration_minutes: number;
  questions: PublicQuestion[];
}

/** question id -> answer text (option text, comma-joined option texts, or free text). */
export type AnswerMap = Record<string, string | null>;

export type ProctorEventType =
  | 'tab_switch'
  | 'window_blur'
  | 'fullscreen_exit'
  | 'copy_paste'
  | 'devtools'
  | 'camera_off';

export interface ProctorEvent {
  type: ProctorEventType;
  timestamp: number;
  details?: string;
}

export type ServerVerdict = 'PASS' | 'FLAGGED' | 'REVIEW' | 'INCONCLUSIVE';

export interface ExamResult {
  status: 'submitted' | 'terminated' | 'in_progress';
  marks: number | null;
  max_marks: number | null;
  percent: number | null;
  pending_manual: number;
  integrity_score: number | null;
  pct_focused: number | null;
  verdict: ServerVerdict | null;
}

export interface ExamAttempt {
  roomId: string;
  sessionId: string;
  token: string;
  displayName: string;
}

const attemptKey = (roomId: string) => `exam_attempt_${roomId}`;

// localStorage, not sessionStorage: closing and reopening the tab must resume, not restart.
export function loadAttempt(roomId: string): ExamAttempt | null {
  try {
    const a = JSON.parse(localStorage.getItem(attemptKey(roomId)) ?? 'null') as ExamAttempt | null;
    return a?.sessionId && a.token ? a : null;
  } catch {
    return null;
  }
}

export function saveAttempt(a: ExamAttempt): void {
  localStorage.setItem(attemptKey(a.roomId), JSON.stringify(a));
}

export function clearAttempt(roomId: string): void {
  localStorage.removeItem(attemptKey(roomId));
}
