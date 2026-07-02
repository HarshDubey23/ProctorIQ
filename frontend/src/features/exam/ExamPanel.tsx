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
  const { result: detectionResult, modelFailure } = useDetection(videoRef, {
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
  const timerColor = timeRemaining <= 60 ? 'clay' : timeRemaining <= 120 ? 'ochre' : 'ink';
  const score = detectionResult ? computeAttentionScore(detectionResult) : 0;
  const attentionLabel = detectionResult?.attention ?? 'focused';

  const progressPct = answeredCount / totalQuestions;

  return (
    <div className="relative flex h-full w-full flex-col" style={{ backgroundColor: 'var(--surface-0)' }}>
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
                <Clock size={48} className="opacity-60" style={{ color: 'var(--jade)' }} />
                <h1 className="font-display text-[32px] uppercase tracking-[0.05em]" style={{ color: 'var(--ink)' }}>
                  Timed Exam
                </h1>
                <p className="max-w-md text-center font-sans text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                  Answer {totalQuestions} questions within {Math.floor(EXAM_DURATION / 60)} minutes.
                  ProctorIQ monitors your attention throughout. Tab switches and window blurs are tracked.
                </p>
              </div>
              <button
                className="rounded-xl px-10 py-4 font-display text-[18px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  backgroundColor: 'rgba(14,107,92,0.12)',
                  color: 'var(--jade)',
                }}
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
              <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: 'var(--jade)', borderTopColor: 'transparent' }} />
              <span className="font-sans text-sm" style={{ color: 'var(--ink-muted)' }}>
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
                className="font-display text-[clamp(4rem,20vw,12rem)] leading-none tabular-nums"
                style={{ color: 'var(--jade)' }}
                initial={{ scale: 1.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                {countdownValue}
              </motion.span>
              <span className="font-sans text-sm uppercase tracking-[0.15em]" style={{ color: 'var(--ink-muted)' }}>
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
              <div className="flex items-center justify-between px-6 py-3" style={{ borderBottom: '1px solid var(--hairline)' }}>
                <div className="font-mono text-[15px] tabular-nums" style={{ color: timerColor === 'clay' ? 'var(--clay)' : timerColor === 'ochre' ? 'var(--ochre)' : 'var(--ink)' }}>
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </div>
                <div className="flex-1 mx-4">
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--hairline)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: 'var(--jade)' }}
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct * 100}%` }}
                      transition={reducedMotion ? { duration: 0 } : { duration: 0.4 }}
                    />
                  </div>
                </div>
                <div className="font-mono text-[13px] tabular-nums" style={{ color: 'var(--ink-muted)' }}>
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

              <div className="flex items-center justify-between px-6 py-4" style={{ borderTop: '1px solid var(--hairline)' }}>
                <button
                  className="flex items-center gap-2 rounded-lg px-4 py-2 font-sans text-sm transition-colors disabled:opacity-30"
                  style={{
                    backgroundColor: 'var(--surface-1)',
                    color: 'var(--ink-muted)',
                  }}
                  onClick={prevQuestion}
                  disabled={currentQuestionIndex === 0}
                  aria-label="Previous question"
                >
                  <ChevronLeft size={16} />
                  Prev
                </button>

                <button
                  className="rounded-lg px-5 py-2 font-sans text-sm uppercase tracking-[0.08em] transition-colors"
                  style={{
                    backgroundColor: answeredCount === totalQuestions
                      ? 'rgba(14,107,92,0.15)'
                      : 'rgba(185,118,58,0.1)',
                    color: answeredCount === totalQuestions
                      ? 'var(--jade)'
                      : 'var(--ochre)',
                  }}
                  onClick={submit}
                  aria-label="Submit exam"
                >
                  Submit {answeredCount}/{totalQuestions}
                </button>

                <button
                  className="flex items-center gap-2 rounded-lg px-4 py-2 font-sans text-sm transition-colors disabled:opacity-30"
                  style={{
                    backgroundColor: 'var(--surface-1)',
                    color: 'var(--ink-muted)',
                  }}
                  onClick={nextQuestion}
                  disabled={currentQuestionIndex === totalQuestions - 1}
                  aria-label="Next question"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>

              {timeRemaining <= 120 && (
                <div className="flex items-center justify-center gap-2 py-2" style={{ backgroundColor: 'rgba(166,61,47,0.1)' }}>
                  <AlertTriangle size={14} style={{ color: 'var(--clay)' }} />
                  <span className="font-sans text-[11px]" style={{ color: 'var(--clay)' }}>
                    {timeRemaining <= 60 ? 'Last minute! Auto-submit imminent.' : 'Less than 2 minutes remaining.'}
                  </span>
                </div>
              )}

              {isDemo && (
                <div className="flex items-center justify-center gap-2 py-1" style={{ backgroundColor: 'rgba(185,118,58,0.1)' }}>
                  <Eye size={12} style={{ color: 'var(--ochre)' }} />
                  <span className="font-sans text-[10px]" style={{ color: 'var(--ochre)' }}>
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
              <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: 'var(--jade)', borderTopColor: 'transparent' }} />
              <span className="font-sans text-sm" style={{ color: 'var(--ink-muted)' }}>
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

      {modelFailure && (
        <div className="absolute top-4 left-1/2 z-50 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-sans text-[11px] uppercase tracking-[0.1em] border whitespace-nowrap"
            style={{
              backgroundColor: 'rgba(166,61,47,0.15)',
              color: 'var(--clay)',
              borderColor: 'rgba(166,61,47,0.3)',
            }}>
            Model unavailable — using fallback detection
          </span>
        </div>
      )}
    </div>
  );
}
