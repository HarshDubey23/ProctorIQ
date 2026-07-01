import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, AlertTriangle, Clock, Eye } from 'lucide-react';
import { useExamSession } from './useExamSession';
import { ExamQuestionCard } from './ExamQuestionCard';
import { ProctorOverlay } from './ProctorOverlay';
import { ResultsScreen } from './ResultsScreen';
import { useWebcam } from '../selftest/useWebcam';
import { useDetection, computeAttentionScore } from '../selftest/useDetection';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { StatusPill, type StatusState } from '../../components/ui/StatusPill';
import { fetchSessionHash, computeSessionHash } from '../../lib/signing';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function ExamPanel() {
  const {
    state,
    countdownValue,
    answers,
    currentQuestionIndex,
    timeRemaining,
    events,
    submittedAt,
    correctCount,
    totalQuestions,
    sessionId,
    QUESTIONS,
    startExam,
    resetExam,
    selectAnswer,
    nextQuestion,
    prevQuestion,
    submit,
    wsTick,
  } = useExamSession();

  const EXAM_DURATION = 15 * 60;

  const reducedMotion = useReducedMotion();
  const { videoRef, isDemo } = useWebcam();
  const proctoringActive = state === 'in_progress' || state === 'results';
  const { result: detectionResult } = useDetection(videoRef, {
    enabled: proctoringActive,
    isDemo,
  });
  const [reportHash, setReportHash] = useState('');
  const [hashLoading, setHashLoading] = useState(false);
  const [serverVerified, setServerVerified] = useState(false);
  const hashFetchedRef = useRef(false);
  const startTimeRef = useRef(0);

  useEffect(() => {
    if (state !== 'in_progress') return;
    startTimeRef.current = Date.now();
  }, [state]);

  useEffect(() => {
    if (state !== 'in_progress' || !wsTick) return;
    wsTick(detectionResult);
  }, [detectionResult, state, wsTick]);

  useEffect(() => {
    if (state !== 'results' || hashFetchedRef.current) return;
    hashFetchedRef.current = true;
    setHashLoading(true);

    const storedEvents = events.map((e) => ({
      eventType: e.type,
      timestampS: Math.floor((e.timestamp - startTimeRef.current) / 1000),
      confidence: null,
    }));

    const sessionData = {
      id: sessionId,
      start: startTimeRef.current,
      end: submittedAt ?? Date.now(),
      mode: 'exam' as const,
      finalScore: null,
      pctFocused: null,
      verdict: null,
      events: storedEvents,
    };

    fetchSessionHash(sessionId).then((hash) => {
      if (hash) {
        setReportHash(hash);
        setServerVerified(true);
        setHashLoading(false);
      } else {
        computeSessionHash(sessionData).then(setReportHash);
        setServerVerified(false);
        setHashLoading(false);
      }
    });
  }, [state, answers, events, submittedAt, correctCount, totalQuestions, sessionId]);

  const handleRetake = useCallback(() => {
    hashFetchedRef.current = false;
    setReportHash('');
    setServerVerified(false);
    setHashLoading(false);
    resetExam();
  }, [resetExam]);

  const handleDownloadReport = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/report`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `proctoriq-${sessionId.slice(0, 8)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      // fall through to JSON fallback
    }
    const storedEvents = events.map((e) => ({
      eventType: e.type,
      timestampS: Math.floor((e.timestamp - startTimeRef.current) / 1000),
      confidence: null,
    }));
    const data = {
      id: sessionId,
      answers,
      events: storedEvents,
      submittedAt,
      correctCount,
      totalQuestions,
      reportHash,
      serverVerified,
      note: serverVerified
        ? 'This report data was fetched from the server.'
        : 'PDF generation requires the backend to be running. This JSON contains the same session data.',
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `proctoriq-report-${sessionId.slice(0, 8)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [answers, events, submittedAt, correctCount, totalQuestions, reportHash, sessionId, serverVerified]);

  const currentQuestion = QUESTIONS[currentQuestionIndex];
  const currentAnswer = answers.find((a) => a.questionId === currentQuestion?.id);
  const answeredCount = answers.filter((a) => a.selectedIndex !== null).length;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timerColor = timeRemaining <= 60 ? 'text-signal-multi' : timeRemaining <= 120 ? 'text-signal-caution' : 'text-text-primary';
  const score = detectionResult ? computeAttentionScore(detectionResult) : 0;
  const attentionLabel = detectionResult?.attention ?? 'focused';

  const progressPct = answeredCount / totalQuestions;

  return (
    <div className="relative flex h-full w-full flex-col">
      <div className="relative flex-1">
        <AnimatePresence mode="wait">
          {state === 'idle' && (
            <motion.div
              key="idle"
              className="flex h-full flex-col items-center justify-center gap-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex flex-col items-center gap-2">
                <Clock size={48} className="text-signal-focus opacity-60" />
                <h1 className="font-display text-[32px] uppercase tracking-[0.05em] text-text-primary">
                  Timed Exam
                </h1>
                <p className="max-w-md text-center font-sans text-[13px] text-text-secondary leading-relaxed">
                  Answer {totalQuestions} questions within {Math.floor(EXAM_DURATION / 60)} minutes.
                  ProctorIQ monitors your attention throughout. Tab switches and window blurs are tracked.
                </p>
              </div>
              <button
                className="rounded-xl bg-signal-focus/[0.12] px-10 py-4 font-display text-[18px] uppercase tracking-[0.12em] text-signal-focus transition-colors hover:bg-signal-focus/[0.2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
                onClick={startExam}
                aria-label="Begin exam"
              >
                BEGIN EXAM
              </button>
            </motion.div>
          )}

          {state === 'webcam_permission' && (
            <motion.div
              key="webcam"
              className="flex h-full flex-col items-center justify-center gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-signal-focus border-t-transparent" />
              <span className="font-sans text-[13px] text-text-secondary">
                Requesting camera permission...
              </span>
            </motion.div>
          )}

          {state === 'countdown' && (
            <motion.div
              key="countdown"
              className="flex h-full flex-col items-center justify-center"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.5, opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <motion.span
                key={countdownValue}
                className="font-display text-[clamp(4rem,20vw,12rem)] leading-none text-signal-focus tabular-nums"
                initial={{ scale: 1.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                {countdownValue}
              </motion.span>
              <span className="font-sans text-[13px] uppercase tracking-[0.15em] text-text-secondary">
                Get Ready
              </span>
            </motion.div>
          )}

          {state === 'in_progress' && currentQuestion && (
            <motion.div
              key="in_progress"
              className="flex h-full flex-col"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06]">
                <div className={`font-mono text-[15px] tabular-nums ${timerColor}`}>
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </div>
                <div className="flex-1 mx-4">
                  <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-signal-focus"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct * 100}%` }}
                      transition={reducedMotion ? { duration: 0 } : { duration: 0.4 }}
                    />
                  </div>
                </div>
                <div className="font-mono text-[13px] tabular-nums text-text-secondary">
                  {currentQuestionIndex + 1}/{totalQuestions}
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
                <ExamQuestionCard
                  question={currentQuestion}
                  answer={currentAnswer ?? { questionId: currentQuestion.id, selectedIndex: null }}
                  onSelect={selectAnswer}
                  showResults={false}
                  questionNumber={currentQuestionIndex + 1}
                />
              </div>

              <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06]">
                <button
                  className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-4 py-2 font-sans text-[13px] text-text-secondary transition-colors hover:bg-white/[0.1] disabled:opacity-30"
                  onClick={prevQuestion}
                  disabled={currentQuestionIndex === 0}
                  aria-label="Previous question"
                >
                  <ChevronLeft size={16} />
                  Prev
                </button>

                <button
                  className={`rounded-lg px-5 py-2 font-sans text-[13px] uppercase tracking-[0.08em] transition-colors ${
                    answeredCount === totalQuestions
                      ? 'bg-signal-drowsy/[0.15] text-signal-drowsy hover:bg-signal-drowsy/[0.25]'
                      : 'bg-signal-caution/[0.1] text-signal-caution hover:bg-signal-caution/[0.2]'
                  }`}
                  onClick={submit}
                  aria-label="Submit exam"
                >
                  Submit {answeredCount}/{totalQuestions}
                </button>

                <button
                  className="flex items-center gap-2 rounded-lg bg-white/[0.05] px-4 py-2 font-sans text-[13px] text-text-secondary transition-colors hover:bg-white/[0.1] disabled:opacity-30"
                  onClick={nextQuestion}
                  disabled={currentQuestionIndex === totalQuestions - 1}
                  aria-label="Next question"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>

              {timeRemaining <= 120 && (
                <div className="flex items-center justify-center gap-2 bg-signal-multi/[0.1] py-2">
                  <AlertTriangle size={14} className="text-signal-multi" />
                  <span className="font-sans text-[11px] text-signal-multi">
                    {timeRemaining <= 60 ? 'Last minute! Auto-submit imminent.' : 'Less than 2 minutes remaining.'}
                  </span>
                </div>
              )}

              {isDemo && (
                <div className="flex items-center justify-center gap-2 bg-signal-caution/[0.1] py-1">
                  <Eye size={12} className="text-signal-caution" />
                  <span className="font-sans text-[10px] text-signal-caution">
                    DEMO -- proctoring data is simulated
                  </span>
                </div>
              )}
            </motion.div>
          )}

          {state === 'submitted' && (
            <motion.div
              key="submitted"
              className="flex h-full flex-col items-center justify-center gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-signal-drowsy border-t-transparent" />
              <span className="font-sans text-[13px] text-text-secondary">
                Computing results...
              </span>
            </motion.div>
          )}

          {state === 'results' && submittedAt && (
            <motion.div
              key="results"
              className="h-full overflow-y-auto"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <ResultsScreen
                answers={answers}
                events={events}
                submittedAt={submittedAt}
                reportHash={reportHash}
                hashLoading={hashLoading}
                serverVerified={serverVerified}
                onDownloadReport={handleDownloadReport}
                onRetake={handleRetake}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <video ref={videoRef} autoPlay playsInline muted className="sr-only" aria-hidden="true" />
      {(state === 'in_progress' || state === 'results') && (
        <ProctorOverlay
          score={score}
          attentionLabel={attentionLabel}
          isVisible={state === 'in_progress'}
        />
      )}
      {state === 'in_progress' && detectionResult && !isDemo && (
        <div className="absolute top-4 left-4 z-40 flex items-center gap-2">
          <StatusPill state={detectionResult.attention as StatusState} />
        </div>
      )}
    </div>
  );
}
