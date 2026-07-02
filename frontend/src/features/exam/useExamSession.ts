import { useState, useCallback, useRef, useEffect } from 'react';
import { QUESTIONS } from './questions';
import { saveSession } from '../../lib/db';
import type { StoredSession, StoredEvent } from '../../lib/db';
import { useProctoringSocket } from '../../lib/useProctoringSocket';
import type {
  ExamState,
  ExamAnswer,
  ProctorEvent,
  ProctorEventType,
} from './types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const EXAM_DURATION = 15 * 60;

function createInitialAnswers(): ExamAnswer[] {
  return QUESTIONS.map((q) => ({ questionId: q.id, selectedIndex: null }));
}

function computeCorrectCount(answers: ExamAnswer[]): number {
  return answers.filter((a) => {
    const q = QUESTIONS.find((qq) => qq.id === a.questionId);
    return q && a.selectedIndex === q.correctIndex;
  }).length;
}

export function useExamSession() {
  const [state, setState] = useState<ExamState>('idle');
  const [countdownValue, setCountdownValue] = useState(3);
  const [answers, setAnswers] = useState<ExamAnswer[]>(createInitialAnswers);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(EXAM_DURATION);
  const [events, setEvents] = useState<ProctorEvent[]>([]);
  const [submittedAt, setSubmittedAt] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [sessionRegistered, setSessionRegistered] = useState(false);

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

  async function registerSession(sid: string, startTs: number): Promise<void> {
    try {
      await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: sid,
          start: new Date(startTs).toISOString(),
          mode: 'exam',
        }),
      });
    } catch {
      // Backend unreachable — exam can still proceed offline
    }
    setSessionRegistered(true);
  }

  const submit = useCallback(() => {
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
    const correctCount = computeCorrectCount(answersRef.current);
    const total = QUESTIONS.length;
    const quizScore = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const sessionRecord: StoredSession = {
      id: sessionId,
      start: startTimeRef.current,
      end: now,
      mode: 'exam',
      quizScore,
      finalScore: null,
      pctFocused: null,
      verdict: null,
      events: storedEvents,
      benchmark: null,
    };
    saveSession(sessionRecord).catch(() => {});
    setSubmittedAt(now);
    setState('submitted');
    setTimeout(() => setState('results'), 600);
  }, [clearTimers, wsDisconnect, sessionId]);

  const startTimer = useCallback(() => {
    setTimeRemaining(EXAM_DURATION);
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
          const sid = crypto.randomUUID();
          setSessionId(sid);
          eventsRef.current = [];
          setSessionRegistered(false);
          setState('in_progress');
          registerSession(sid, startTimeRef.current);
          const roomId = sessionStorage.getItem('exam_room_id') || undefined;
          wsConnect(sid, { roomId });
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
    setSessionRegistered(false);
    setState('idle');
    setAnswers(createInitialAnswers());
    setCurrentQuestionIndex(0);
    setTimeRemaining(EXAM_DURATION);
    setEvents([]);
    setSubmittedAt(null);
  }, [clearTimers, wsDisconnect]);

  const selectAnswer = useCallback((questionId: number, index: number) => {
    setAnswers((prev) =>
      prev.map((a) =>
        a.questionId === questionId ? { ...a, selectedIndex: a.selectedIndex === index ? null : index } : a,
      ),
    );
  }, []);

  const goToQuestion = useCallback((index: number) => {
    setCurrentQuestionIndex(index);
  }, []);

  const nextQuestion = useCallback(() => {
    setCurrentQuestionIndex((prev) => Math.min(prev + 1, QUESTIONS.length - 1));
  }, []);

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

  const correctCount = computeCorrectCount(answers);
  const totalQuestions = QUESTIONS.length;
  const examScorePct = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;

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
    sessionRegistered,
    QUESTIONS,
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
