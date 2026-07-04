export type ExamState =
  | 'idle'
  | 'webcam_permission'
  | 'countdown'
  | 'in_progress'
  | 'submitted'
  | 'results';

export type AttentionLabel = 'focused' | 'distracted' | 'absent' | 'drowsy' | 'multi';

export interface ExamQuestion {
  id: string;
  type: string;
  title: string;
  body: string;
  marks: number;
  options: string[] | null;
}

export interface PublicQuestion {
  id: string;
  type: string;
  title: string;
  body: string;
  marks: number;
  options: string[] | null;
}

export interface ExamAnswer {
  questionId: string;
  selectedIndex: number | null;
}

export type ProctorEventType =
  | 'tab_switch'
  | 'window_blur'
  | 'head_pose'
  | 'gaze_away'
  | 'face_absent'
  | 'multi_face';

export interface ProctorEvent {
  type: ProctorEventType;
  timestamp: number;
  details?: string;
}

export function computeIntegrityScore(events: ProctorEvent[]): number {
  let score = 100;
  for (const e of events) {
    if (e.type === 'tab_switch' || e.type === 'window_blur') {
      score = Math.max(0, score - 2);
    }
  }
  return score;
}

export function computeProctorIQ(
  examScore: number,
  totalQuestions: number,
  events: ProctorEvent[],
): number {
  const examPct = totalQuestions > 0 ? (examScore / totalQuestions) * 100 : 0;
  const integrity = computeIntegrityScore(events);
  return Math.round((examPct + integrity) / 2);
}

export type Verdict = 'pass' | 'investigate' | 'fail';

export function computeVerdict(proctorIQ: number): Verdict {
  if (proctorIQ >= 70) return 'pass';
  if (proctorIQ >= 40) return 'investigate';
  return 'fail';
}
