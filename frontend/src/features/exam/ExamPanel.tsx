import { useEffect, useRef, useState, useCallback } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, Clock, Eye } from 'lucide-react';
import { useExamSession } from './useExamSession';
import { ExamQuestionCard } from './ExamQuestionCard';
import { ProctorOverlay } from './ProctorOverlay';
import { ResultsScreen } from './ResultsScreen';
import { useWebcam } from '../selftest/useWebcam';
import { useDetection, computeAttentionScore } from '../selftest/useDetection';
import { StatusPill, type StatusState } from '../../components/ui/StatusPill';
import { fetchSessionHash, computeSessionHash } from '../../lib/signing';
import { Button } from '../../components/ui/button';


const API_BASE = import.meta.env.VITE_API_URL ?? '';

export function ExamPanel() {
  const roomId = sessionStorage.getItem('exam_room_id') ?? undefined;
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
    questions,
    loadingPaper,
    startExam,
    resetExam,
    selectAnswer,
    nextQuestion,
    prevQuestion,
    submit,
    wsTick,
  } = useExamSession(roomId);

  const EXAM_DURATION = timeRemaining;

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

  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = answers.find((a) => parseInt(a.questionId) === currentQuestionIndex);
  const answeredCount = answers.filter((a) => a.selectedIndex !== null).length;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const score = detectionResult ? computeAttentionScore(detectionResult) : 0;
  const attentionLabel = detectionResult?.attention ?? 'focused';

  const progressPct = totalQuestions > 0 ? answeredCount / totalQuestions : 0;

  if (loadingPaper) {
    return (
      <div className="flex h-full items-center justify-center bg-paper">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 border-[3px] border-ledger border-t-transparent animate-spin" />
          <span className="font-body text-sm text-graphite">Loading exam...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col bg-paper">
      <div className="relative flex-1">
        {state === 'idle' && (
          <div className="flex h-full flex-col items-center justify-center gap-6 stamp-in">
            <div className="flex flex-col items-center gap-2">
              <Clock size={48} className="text-ledger opacity-60" />
              <h1 className="font-display text-3xl uppercase tracking-[0.05em] text-ink">
                Timed Exam
              </h1>
              <p className="max-w-md text-center font-body text-sm text-graphite leading-relaxed">
                Answer {totalQuestions} questions within {Math.floor(EXAM_DURATION / 60)} minutes.
                ProctorIQ monitors your attention throughout. Tab switches and window blurs are tracked.
              </p>
            </div>
            <Button variant="primary" onClick={startExam} aria-label="Begin exam" className="text-lg px-10 py-4">
              BEGIN EXAM
            </Button>
          </div>
        )}

        {state === 'webcam_permission' && (
          <div className="flex h-full flex-col items-center justify-center gap-4 stamp-in">
            <div className="h-8 w-8 border-[3px] border-ledger border-t-transparent animate-spin" />
            <span className="font-body text-sm text-graphite">
              Requesting camera permission...
            </span>
          </div>
        )}

        {state === 'countdown' && (
          <div className="flex h-full flex-col items-center justify-center stamp-in">
            <span key={countdownValue} className="font-display text-[clamp(4rem,20vw,12rem)] leading-none tabular-nums text-ledger">
              {countdownValue}
            </span>
            <span className="font-body text-sm uppercase tracking-[0.15em] text-graphite">
              Get Ready
            </span>
          </div>
        )}

        {state === 'in_progress' && currentQuestion && (
          <div className="flex h-full flex-col stamp-in">
            <div className="flex items-center justify-between border-b-[3px] border-ink px-6 py-3">
              <div className={`font-mono text-sm tabular-nums ${timeRemaining <= 60 ? 'text-ochre' : timeRemaining <= 120 ? 'text-ochre' : 'text-ink'}`}>
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </div>
              <div className="flex-1 mx-4">
                <div className="h-2 border-[2px] border-ink bg-paper-2 overflow-hidden">
                  <div className="h-full bg-ledger transition-all duration-500" style={{ width: `${progressPct * 100}%` }} />
                </div>
              </div>
              <div className="font-mono text-xs text-graphite tabular-nums">
                {currentQuestionIndex + 1}/{totalQuestions}
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
              <ExamQuestionCard
                question={currentQuestion}
                answer={currentAnswer ?? { questionId: `${currentQuestionIndex}`, selectedIndex: null }}
                onSelect={(_qId, idx) => selectAnswer(currentQuestionIndex, idx)}
                showResults={false}
                questionNumber={currentQuestionIndex + 1}
              />
            </div>

            <div className="flex items-center justify-between border-t-[3px] border-ink px-6 py-4">
              <Button
                variant="ghost"
                onClick={prevQuestion}
                disabled={currentQuestionIndex === 0}
                aria-label="Previous question"
              >
                <ChevronLeft size={16} />
                Prev
              </Button>

              <Button
                variant={answeredCount === totalQuestions ? "primary" : "default"}
                onClick={submit}
                aria-label="Submit exam"
              >
                Submit {answeredCount}/{totalQuestions}
              </Button>

              <Button
                variant="ghost"
                onClick={nextQuestion}
                disabled={currentQuestionIndex === totalQuestions - 1}
                aria-label="Next question"
              >
                Next
                <ChevronRight size={16} />
              </Button>
            </div>

            {timeRemaining <= 120 && (
              <div className="flex items-center justify-center gap-2 border-t-[2px] border-ochre bg-paper-2 py-2">
                <AlertTriangle size={14} className="text-ochre" />
                <span className="font-body text-xs text-ochre">
                  {timeRemaining <= 60 ? 'Last minute! Auto-submit imminent.' : 'Less than 2 minutes remaining.'}
                </span>
              </div>
            )}

            {isDemo && (
              <div className="flex items-center justify-center gap-2 border-t-[2px] border-ochre bg-paper-2 py-1">
                <Eye size={12} className="text-ochre" />
                <span className="font-body text-[10px] text-ochre">
                  DEMO -- proctoring data is simulated
                </span>
              </div>
            )}
          </div>
        )}

        {state === 'submitted' && (
          <div className="flex h-full flex-col items-center justify-center gap-4 stamp-in">
            <div className="h-8 w-8 border-[3px] border-ledger border-t-transparent animate-spin" />
            <span className="font-body text-sm text-graphite">
              Computing results...
            </span>
          </div>
        )}

        {state === 'results' && submittedAt && (
          <div className="h-full overflow-y-auto stamp-in">
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
          </div>
        )}
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
          <span className="chip !border-[1px] border-ochre text-ochre">
            Model unavailable — using fallback detection
          </span>
        </div>
      )}
    </div>
  );
}
