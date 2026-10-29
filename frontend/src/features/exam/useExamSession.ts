import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '../../lib/api';
import { useProctoringSocket } from '../../lib/useProctoringSocket';
import type {
  AnswerMap,
  ExamAttempt,
  ExamResult,
  ExamState,
  ProctorEvent,
  ProctorEventType,
  PublicPaper,
} from './types';

const AUTOSAVE_DEBOUNCE_MS = 1500;

interface StartResponse {
  session_id: string;
  ws_token: string;
  status: ExamResult['status'];
  started_at: string;
  deadline: string | null;
  server_now: string;
  answers: AnswerMap;
  paper: PublicPaper;
  result: ExamResult | null;
}

async function api<T>(path: string, attempt: ExamAttempt, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${API_BASE}/api/rooms/${attempt.roomId}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'X-Student-Token': attempt.token, ...init.headers },
  });
  if (!resp.ok) {
    const body = await resp.json().catch(() => null);
    throw Object.assign(new Error(body?.detail ?? `HTTP ${resp.status}`), { status: resp.status });
  }
  return resp.json() as Promise<T>;
}

const startedKey = (a: ExamAttempt) => `exam_started_${a.sessionId}`;

export function useExamSession(attempt: ExamAttempt) {
  const [state, setState] = useState<ExamState>('loading');
  const [paper, setPaper] = useState<PublicPaper | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [events, setEvents] = useState<ProctorEvent[]>([]);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [error, setError] = useState('');
  const [hostWarning, setHostWarning] = useState('');
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'offline'>('saved');
  const [kickedReason, setKickedReason] = useState('');

  const stateRef = useRef(state);
  stateRef.current = state;
  const answersRef = useRef<AnswerMap>({});
  const dirtyRef = useRef<AnswerMap>({});
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deadlineRef = useRef<number | null>(null);
  const clockOffsetRef = useRef(0);
  const submitRef = useRef<() => Promise<void>>(async () => {});
  const { connect, disconnect, tick, sendFlag } = useProctoringSocket();

  const loadResult = useCallback(async () => {
    try {
      setResult(await api<ExamResult>(`/my-result?session_id=${attempt.sessionId}`, attempt));
    } catch {
      /* the results screen says when it's unavailable */
    }
    disconnect();
    setState('results');
  }, [attempt, disconnect]);

  const flush = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = dirtyRef.current;
    if (Object.keys(pending).length === 0) return;
    dirtyRef.current = {};
    setSaveState('saving');
    try {
      await api('/answers', attempt, {
        method: 'PUT',
        body: JSON.stringify({ session_id: attempt.sessionId, answers: pending }),
      });
      setSaveState('saved');
    } catch (err) {
      // Keep unsaved answers for the next try unless the server says the attempt is closed.
      if ((err as { status?: number }).status !== 409) {
        dirtyRef.current = { ...pending, ...dirtyRef.current };
      }
      setSaveState('offline');
    }
  }, [attempt]);

  const onSocketMessage = useCallback((raw: unknown) => {
    const msg = raw as { type?: string; message?: string; reason?: string };
    if (msg.type === 'host_warning' && msg.message) setHostWarning(msg.message);
    if (msg.type === 'exam_ended') void submitRef.current();
    if (msg.type === 'terminated') setKickedReason(msg.reason ?? 'The host ended your attempt.');
    if (msg.type === 'finalized' && stateRef.current !== 'submitting') void loadResult();
  }, [loadResult]);

  const applyStart = useCallback((data: StartResponse) => {
    setPaper(data.paper);
    answersRef.current = data.answers ?? {};
    setAnswers(answersRef.current);
    if (data.status !== 'in_progress') {
      setResult(data.result);
      setState('results');
      return;
    }
    clockOffsetRef.current = Date.parse(data.server_now) - Date.now();
    deadlineRef.current = data.deadline ? Date.parse(data.deadline) : null;
    localStorage.setItem(startedKey(attempt), '1');
    connect(attempt.sessionId, {
      roomId: attempt.roomId,
      token: data.ws_token,
      onMessage: onSocketMessage,
      onRejected: (code) => {
        if (code === 4409) setKickedReason('This exam was opened in another tab or device.');
      },
    });
    setState('in_progress');
  }, [attempt, connect, onSocketMessage]);

  const begin = useCallback(async () => {
    setError('');
    setState('loading');
    try {
      applyStart(await api<StartResponse>('/start', attempt, {
        method: 'POST',
        body: JSON.stringify({ session_id: attempt.sessionId }),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the exam');
      setState('error');
    }
  }, [attempt, applyStart]);

  // A reload mid-exam resumes straight away; a fresh attempt waits on the instructions screen.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current) return;
    resumedRef.current = true;
    if (localStorage.getItem(startedKey(attempt))) void begin();
    else setState('idle');
  }, [attempt, begin]);
  useEffect(() => () => disconnect(), [disconnect]);

  const submit = useCallback(async () => {
    if (stateRef.current !== 'in_progress') return;
    setState('submitting');
    await flush();
    try {
      setResult(await api<ExamResult>('/submit', attempt, {
        method: 'POST',
        body: JSON.stringify({ session_id: attempt.sessionId, answers: answersRef.current }),
      }));
    } catch (err) {
      if ((err as { status?: number }).status !== 409) {
        setError('Could not reach the server. Your answers are autosaved; reconnect and submit again.');
        setState('in_progress');
        return;
      }
      await loadResult();
      return;
    }
    disconnect();
    setState('results');
  }, [attempt, flush, disconnect, loadResult]);
  submitRef.current = submit;

  // Server-anchored countdown: changing the device clock or reloading doesn't buy time.
  useEffect(() => {
    if (state !== 'in_progress') return;
    const id = setInterval(() => {
      if (deadlineRef.current == null) return;
      const left = Math.max(0, Math.round((deadlineRef.current - (Date.now() + clockOffsetRef.current)) / 1000));
      setTimeRemaining(left);
      if (left === 0) void submitRef.current();
    }, 500);
    return () => clearInterval(id);
  }, [state]);

  useEffect(() => {
    if (state !== 'in_progress') return;
    const retry = setInterval(() => void flush(), 10_000);
    return () => clearInterval(retry);
  }, [state, flush]);

  const setAnswer = useCallback((questionId: string, value: string | null) => {
    if (stateRef.current !== 'in_progress') return;
    answersRef.current = { ...answersRef.current, [questionId]: value };
    dirtyRef.current = { ...dirtyRef.current, [questionId]: value };
    setAnswers(answersRef.current);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void flush(), AUTOSAVE_DEBOUNCE_MS);
  }, [flush]);

  const addEvent = useCallback((type: ProctorEventType, details: string) => {
    setEvents((prev) => [...prev, { type, timestamp: Date.now(), details }]);
    sendFlag(type, null, { details });
  }, [sendFlag]);

  useEffect(() => {
    if (kickedReason) void loadResult();
  }, [kickedReason, loadResult]);

  const questions = paper?.questions ?? [];

  return {
    state,
    paper,
    questions,
    answers,
    currentQuestionIndex,
    timeRemaining,
    events,
    result,
    error,
    hostWarning,
    saveState,
    kickedReason,
    begin,
    submit,
    setAnswer,
    addEvent,
    dismissWarning: () => setHostWarning(''),
    goToQuestion: setCurrentQuestionIndex,
    nextQuestion: () => setCurrentQuestionIndex((i) => Math.min(i + 1, questions.length - 1)),
    prevQuestion: () => setCurrentQuestionIndex((i) => Math.max(i - 1, 0)),
    wsTick: tick,
  };
}
