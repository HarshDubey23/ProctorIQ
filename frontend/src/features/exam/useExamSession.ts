import { useState, useCallback, useRef, useEffect } from 'react';
import type { PublicQuestion } from './types';
import { saveSession } from '../../lib/db';
import type { StoredSession, StoredEvent } from '../../lib/db';
import { useProctoringSocket } from '../../lib/useProctoringSocket';
import type {
  ExamState,
  ExamAnswer,
  ProctorEvent,
  ProctorEventType,
  ServerExamResults,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

function createInitialAnswers(questionCount: number): ExamAnswer[] {
  return Array.from({ length: questionCount }, (_, i) => ({ questionId: `${i}`, selectedIndex: null }));
}

export function useExamSession(roomId?: string) {
  const [state, setState] = useState<ExamState>('idle');
  const [countdownValue, setCountdownValue] = useState(3);
  const [answers, setAnswers] = useState<ExamAnswer[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(15 * 60);
  const [events, setEvents] = useState<ProctorEvent[]>([]);
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [wsToken, setWsToken] = useState('');
  const [serverResults, setServerResults] = useState<ServerExamResults | null>(null);
  const [sessionRegistered, setSessionRegistered] = useState(false);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [examDurationSec, setExamDurationSec] = useState(15 * 60);
  const [loadingPaper, setLoadingPaper] = useState(true);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const startTimeRef = useRef<number>(0);
  const eventsRef = useRef<ProctorEvent[]>([]);
  const answersRef = useRef<ExamAnswer[]>(answers);
  answersRef.current = answers;
  const { connect: wsConnect, disconnect: wsDisconnect, tick: wsTick, sendFlag: wsSendFlag } = useProctoringSocket();

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!roomId) {
      setLoadingPaper(false);
      return;
    }
    fetch(`${API_BASE}/api/rooms/${roomId}/paper`)
      .then(r => {
        if (!r.ok) throw new Error('Failed to fetch paper');
        return r.json();
      })
      .then(p => {
        setQuestions(p.questions);
        setExamDurationSec(p.duration_minutes * 60);
        setTimeRemaining(p.duration_minutes * 60);
        setAnswers(createInitialAnswers(p.questions.length));
        setLoadingPaper(false);
      })
      .catch(() => {
        setLoadingPaper(false);
      });
  }, [roomId]);

  async function registerSession(sid: string, startTs: number): Promise<string> {
    try {
      const response = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sid,
          start: new Date(startTs).toISOString(),
          mode: 'exam',
        }),
      });
      if (response.ok) {
        const data: { ws_token?: string } = await response.json();
        const token = data.ws_token ?? '';
        setWsToken(token);
        setSessionRegistered(true);
        return token;
      }
    } catch {
      // Backend unreachable — exam can still proceed offline
    }
    setSessionRegistered(true);
    return '';
  }

  const submit = useCallback(async () => {
    if (stateRef.current !== 'in_progress') return;
    clearTimers();
    wsDisconnect();
    const now = Date.now();
    const storedEvents: StoredEvent[] = eventsRef.current.map((e) => ({
      eventType: e.type,
      timestampS: Math.floor((e.timestamp - startTimeRef.current) / 1000),
      confidence: null,
      details: e.details ? { details: e.details } : null,
    }));
    const sessionRecord: StoredSession = {
      id: sessionId,
      start: startTimeRef.current,
      end: now,
      mode: 'exam',
      quizScore: null,
      finalScore: null,
      pctFocused: null,
      verdict: null,
      events: storedEvents,
      benchmark: null,
    };
    saveSession(sessionRecord).catch(() => {});
    setSubmittedAt(now);
    setState('submitted');

    // Submit answers to backend for server-side scoring
    const ans = answersRef.current;
    const submission = {
      answers: ans.map(a => ({
        question_id: questions[parseInt(a.questionId)]?.id ?? a.questionId,
        selected_answer: a.selectedIndex != null ? String(a.selectedIndex) : null,
      })),
    };
    try {
      const submitResponse = await fetch(`${API_BASE}/api/sessions/${sessionId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submission),
      });
      if (submitResponse.ok) {
        const sessionResponse = await fetch(`${API_BASE}/api/sessions/${sessionId}`);
        if (sessionResponse.ok) {
          const data: {
            quiz_score: number | null;
            final_score: number | null;
            pct_focused: number | null;
            verdict: ServerExamResults['verdict'];
            events: Array<{ event_type: string }>;
          } = await sessionResponse.json();
          const eventCounts: Record<string, number> = {};
          for (const event of data.events) {
            eventCounts[event.event_type] = (eventCounts[event.event_type] ?? 0) + 1;
          }
          setServerResults({
            quizScore: data.quiz_score,
            finalScore: data.final_score,
            pctFocused: data.pct_focused,
            verdict: data.verdict,
            eventCounts,
          });
        }
      }
    } catch {
      // Server results remain unavailable; the UI will make that explicit.
    }

    setTimeout(() => setState('results'), 600);
  }, [clearTimers, wsDisconnect, sessionId, questions]);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          submit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [submit]);

  const startCountdown = useCallback(() => {
    setCountdownValue(3);
    countdownRef.current = setInterval(() => {
      setCountdownValue((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = null;
          startTimeRef.current = Date.now();
          const sid = sessionStorage.getItem('exam_session_id') || crypto.randomUUID();
          sessionStorage.removeItem('exam_session_id');
          setSessionId(sid);
          eventsRef.current = [];
          setSessionRegistered(false);
          setWsToken('');
          setServerResults(null);
          setState('in_progress');
          registerSession(sid, startTimeRef.current).then((token) => {
            const rid = sessionStorage.getItem('exam_room_id') || undefined;
            wsConnect(sid, { roomId: rid, token });
          });
          startTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [startTimer, wsConnect]);

  const requestWebcam = useCallback(() => {
    setState('webcam_permission');
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        stream.getTracks().forEach((t) => t.stop());
        startCountdown();
      })
      .catch(() => {
        startCountdown();
      });
  }, [startCountdown]);

  const startExam = useCallback(() => {
    requestWebcam();
  }, [requestWebcam]);

  const resetExam = useCallback(() => {
    clearTimers();
    wsDisconnect();
    startTimeRef.current = 0;
    eventsRef.current = [];
    setSessionId('');
    setWsToken('');
    setServerResults(null);
    setSessionRegistered(false);
    setState('idle');
    setAnswers(createInitialAnswers(questions.length));
    setCurrentQuestionIndex(0);
    setTimeRemaining(examDurationSec);
    setEvents([]);
    setSubmittedAt(null);
  }, [clearTimers, wsDisconnect, questions.length, examDurationSec]);

  const selectAnswer = useCallback((questionIndex: number, selectedIndex: number) => {
    setAnswers((prev) =>
      prev.map((a, i) =>
        i === questionIndex ? { ...a, selectedIndex: a.selectedIndex === selectedIndex ? null : selectedIndex } : a,
      ),
    );
  }, []);

  const goToQuestion = useCallback((index: number) => {
    setCurrentQuestionIndex(index);
  }, []);

  const nextQuestion = useCallback(() => {
    setCurrentQuestionIndex((prev) => Math.min(prev + 1, questions.length - 1));
  }, [questions.length]);

  const prevQuestion = useCallback(() => {
    setCurrentQuestionIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const addEvent = useCallback((type: ProctorEventType, details?: string) => {
    const event: ProctorEvent = { type, timestamp: Date.now(), details };
    eventsRef.current = [...eventsRef.current, event];
    setEvents(eventsRef.current);
  }, []);

  useEffect(() => {
    if (state !== 'in_progress') return;

    const onVisibility = () => {
      if (document.hidden) {
        addEvent('tab_switch', 'Tab became hidden');
        wsSendFlag('tab_switch', null, { details: 'Tab became hidden' });
      }
    };

    const onBlur = () => {
      addEvent('window_blur', 'Window lost focus');
      wsSendFlag('window_blur', null, { details: 'Window lost focus' });
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
    };
  }, [state, addEvent]);

  useEffect(() => {
    return () => {
      clearTimers();
      wsDisconnect();
    };
  }, [clearTimers, wsDisconnect]);

  const correctCount = 0;
  const totalQuestions = questions.length;
  const examScorePct = 0;

  return {
    state,
    countdownValue,
    answers,
    currentQuestionIndex,
    timeRemaining,
    events,
    submittedAt,
    correctCount,
    totalQuestions,
    examScorePct,
    sessionId,
    wsToken,
    serverResults,
    sessionRegistered,
    questions,
    loadingPaper,
    startExam,
    resetExam,
    selectAnswer,
    goToQuestion,
    nextQuestion,
    prevQuestion,
    addEvent,
    submit,
    wsTick,
  };
}
