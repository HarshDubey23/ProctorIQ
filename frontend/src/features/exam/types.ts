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

export type ServerVerdict = 'PASS' | 'FLAGGED' | 'REVIEW' | 'INCONCLUSIVE';

export interface ServerExamResults {
  quizScore: number | null;
  finalScore: number | null;
  pctFocused: number | null;
  verdict: ServerVerdict | null;
  eventCounts: Record<string, number>;
}
