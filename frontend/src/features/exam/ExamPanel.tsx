import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, AlertTriangle, Camera, Maximize, ShieldAlert, Cloud, CloudOff } from 'lucide-react';
import { useExamSession } from './useExamSession';
import { ExamQuestionCard } from './ExamQuestionCard';
import { ProctorOverlay } from './ProctorOverlay';
import { ResultsScreen } from './ResultsScreen';
import { JoinCodeForm } from './JoinExam';
import { loadAttempt, type ExamAttempt } from './types';
import { useWebcam } from '../selftest/useWebcam';
import { useDetection, computeAttentionScore } from '../selftest/useDetection';
import { StatusPill, type StatusState } from '../../components/ui/StatusPill';
import { Button } from '../../components/ui/button';

const BLOCKED_KEYS = new Set(['F12']);

function isFullscreen(): boolean {
  return document.fullscreenElement != null;
}

function requestFullscreen(): void {
  if (document.fullscreenEnabled && !isFullscreen()) {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

/** Panel-carousel entry: resumes this tab's exam if there is one, otherwise asks for a code. */
export function ExamPanel() {
  const roomId = sessionStorage.getItem('exam_room_id');
  const attempt = roomId ? loadAttempt(roomId) : null;
  if (!attempt) {
    return (
      <div className="flex h-full items-center justify-center bg-paper p-6">
        <JoinCodeForm />
      </div>
    );
  }
  return <StudentExam attempt={attempt} />;
}

export function StudentExam({ attempt }: { attempt: ExamAttempt }) {
  const exam = useExamSession(attempt);
  const {
    state, paper, questions, answers, currentQuestionIndex, timeRemaining, result, error,
    hostWarning, saveState, kickedReason, begin, submit, setAnswer, addEvent, dismissWarning,
    goToQuestion, nextQuestion, prevQuestion, wsTick,
  } = exam;

  const { videoRef, stream, isDemo } = useWebcam();
  const cameraReady = !!stream && !isDemo;
  const proctoring = state === 'in_progress';
  const { result: detection, modelFailure } = useDetection(videoRef, { enabled: proctoring, isDemo });
  const [fullscreen, setFullscreen] = useState(isFullscreen());
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const fullscreenRequired = document.fullscreenEnabled;

  useEffect(() => {
    if (proctoring) wsTick(detection);
  }, [detection, proctoring, wsTick]);

  // Integrity signals. Everything is reported to the host; nothing here is trusted for grading.
  useEffect(() => {
    if (!proctoring) return;
    const onVisibility = () => {
      if (document.hidden) addEvent('tab_switch', 'Exam tab was hidden');
    };
    const onBlur = () => addEvent('window_blur', 'Exam window lost focus');
    const onFullscreen = () => {
      setFullscreen(isFullscreen());
      if (!isFullscreen()) addEvent('fullscreen_exit', 'Left fullscreen');
    };
    const onClipboard = (e: ClipboardEvent) => {
      e.preventDefault();
      addEvent('copy_paste', `${e.type} blocked`);
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const devtools = BLOCKED_KEYS.has(e.key) || (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(k)) || (ctrl && k === 'u');
      if (devtools) {
        e.preventDefault();
        addEvent('devtools', `Blocked ${e.key}`);
      } else if (ctrl && ['p', 's'].includes(k)) {
        e.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('copy', onClipboard);
    document.addEventListener('cut', onClipboard);
    document.addEventListener('paste', onClipboard);
    document.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKey, true);
    const track = stream?.getVideoTracks()[0];
    const onCameraEnded = () => addEvent('camera_off', 'Camera stopped');
    track?.addEventListener('ended', onCameraEnded);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('copy', onClipboard);
      document.removeEventListener('cut', onClipboard);
      document.removeEventListener('paste', onClipboard);
      document.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKey, true);
      track?.removeEventListener('ended', onCameraEnded);
    };
  }, [proctoring, addEvent, stream]);

  useEffect(() => {
    if (state === 'results' && isFullscreen()) document.exitFullscreen().catch(() => {});
  }, [state]);

  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.id] ?? '').trim() !== '').length,
    [questions, answers],
  );
  const current = questions[currentQuestionIndex];
  const score = detection ? computeAttentionScore(detection) : 0;
  const mins = timeRemaining == null ? null : Math.floor(timeRemaining / 60);
  const secs = timeRemaining == null ? null : timeRemaining % 60;

  const handleBegin = () => {
    requestFullscreen();
    void begin();
  };

  return (
    <div className="relative flex h-full w-full flex-col bg-paper select-none">
      <div className="relative flex-1 min-h-0">
        {state === 'loading' && (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 border-[3px] border-ledger border-t-transparent animate-spin" />
          </div>
        )}

        {(state === 'idle' || state === 'error') && (
          <div className="flex h-full flex-col items-center justify-center gap-6 overflow-y-auto p-6">
            <div className="w-full max-w-lg border-[3px] border-ink bg-paper-2 p-6">
              <h1 className="font-display text-2xl uppercase tracking-[0.05em] text-ink">Before you start</h1>
              <p className="mt-1 font-body text-sm text-graphite">Signed in as {attempt.displayName}</p>
              <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 font-body text-sm text-ink">
                <li>The timer starts when you press Begin and keeps running if you close or reload the page.</li>
                <li>Your camera must stay on. Only attention signals are sent, never video.</li>
                <li>The exam runs in fullscreen. Leaving fullscreen, switching tabs or copying text is reported to your teacher.</li>
                <li>Answers save automatically. The exam submits itself when time runs out.</li>
              </ul>
              {!cameraReady && (
                <div className="mt-4 flex items-start gap-2 border-[3px] border-ochre p-3" role="alert">
                  <Camera size={16} className="mt-0.5 shrink-0 text-ochre" />
                  <span className="font-body text-xs text-ochre">
                    Camera not available. Allow camera access in your browser's address bar, then reload this page.
                  </span>
                </div>
              )}
              {error && (
                <div className="mt-4 border-[3px] border-stamp p-3 font-body text-xs text-stamp" role="alert">{error}</div>
              )}
              <Button variant="primary" onClick={handleBegin} disabled={!cameraReady} className="mt-6 w-full text-lg py-4">
                BEGIN EXAM
              </Button>
            </div>
          </div>
        )}

        {(state === 'in_progress' || state === 'submitting') && current && paper && (
          <div className="flex h-full flex-col">
            <div className="flex flex-wrap items-center gap-3 border-b-[3px] border-ink px-6 py-3">
              <div className={`font-mono text-lg tabular-nums ${timeRemaining != null && timeRemaining <= 120 ? 'text-stamp' : 'text-ink'}`}>
                {mins == null ? '--:--' : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`}
              </div>
              <div className="min-w-0 flex-1 truncate font-body text-sm text-ink">{paper.title}</div>
              <span className="flex items-center gap-1 font-mono text-[10px] text-graphite">
                {saveState === 'offline' ? <CloudOff size={12} className="text-stamp" /> : <Cloud size={12} />}
                {saveState === 'saving' ? 'Saving…' : saveState === 'offline' ? 'Not saved — retrying' : 'Saved'}
              </span>
              <span className="font-mono text-xs text-graphite tabular-nums">{answeredCount}/{questions.length} answered</span>
            </div>

            <div className="flex flex-wrap gap-1.5 border-b-[2px] border-ink px-6 py-2" aria-label="Question navigator">
              {questions.map((q, i) => {
                const done = (answers[q.id] ?? '').trim() !== '';
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => goToQuestion(i)}
                    aria-label={`Question ${i + 1}${done ? ', answered' : ''}`}
                    aria-current={i === currentQuestionIndex}
                    className={`h-7 min-w-7 border-[2px] px-1 font-mono text-[11px] ${
                      i === currentQuestionIndex ? 'border-stamp' : 'border-ink'
                    } ${done ? 'bg-ledger text-paper' : 'bg-paper-2 text-ink'}`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            {paper.instructions && currentQuestionIndex === 0 && (
              <p className="border-b-[2px] border-ink bg-paper-2 px-6 py-2 font-body text-xs text-graphite">{paper.instructions}</p>
            )}

            <div className="flex-1 overflow-y-auto p-6">
              <ExamQuestionCard
                question={current}
                answer={answers[current.id] ?? null}
                onChange={(v) => setAnswer(current.id, v)}
                questionNumber={currentQuestionIndex + 1}
                disabled={state === 'submitting'}
              />
            </div>

            {error && (
              <div className="border-t-[2px] border-stamp px-6 py-2 font-body text-xs text-stamp" role="alert">{error}</div>
            )}

            <div className="flex items-center justify-between gap-2 border-t-[3px] border-ink px-6 py-4">
              <Button variant="ghost" onClick={prevQuestion} disabled={currentQuestionIndex === 0}>
                <ChevronLeft size={16} /> Prev
              </Button>
              {confirmSubmit ? (
                <div className="flex items-center gap-2">
                  <span className="font-body text-xs text-stamp">
                    {questions.length - answeredCount > 0 ? `${questions.length - answeredCount} unanswered. ` : ''}Submit now?
                  </span>
                  <Button variant="primary" onClick={() => void submit()} disabled={state === 'submitting'}>
                    {state === 'submitting' ? 'Submitting…' : 'Yes, submit'}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmSubmit(false)}>Cancel</Button>
                </div>
              ) : (
                <Button variant={answeredCount === questions.length ? 'primary' : 'default'} onClick={() => setConfirmSubmit(true)}>
                  Submit exam
                </Button>
              )}
              <Button variant="ghost" onClick={nextQuestion} disabled={currentQuestionIndex === questions.length - 1}>
                Next <ChevronRight size={16} />
              </Button>
            </div>

            {timeRemaining != null && timeRemaining <= 120 && (
              <div className="flex items-center justify-center gap-2 border-t-[2px] border-ochre bg-paper-2 py-2">
                <AlertTriangle size={14} className="text-ochre" />
                <span className="font-body text-xs text-ochre">
                  {timeRemaining <= 60 ? 'Last minute — the exam submits automatically.' : 'Less than 2 minutes left.'}
                </span>
              </div>
            )}
          </div>
        )}

        {state === 'results' && (
          <div className="h-full overflow-y-auto">
            <ResultsScreen result={result} sessionId={attempt.sessionId} kickedReason={kickedReason} />
          </div>
        )}
      </div>

      {/* Fullscreen gate: questions stay hidden until the student goes back to fullscreen. */}
      {proctoring && fullscreenRequired && !fullscreen && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-ink/95 p-6 text-center">
          <Maximize size={40} className="text-paper" />
          <p className="max-w-sm font-body text-sm text-paper">
            The exam runs in fullscreen. Leaving fullscreen is reported to your teacher.
          </p>
          <Button variant="primary" onClick={requestFullscreen}>Enter fullscreen</Button>
        </div>
      )}

      {hostWarning && proctoring && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-ink/70 p-6" role="alertdialog" aria-label="Message from your teacher">
          <div className="w-full max-w-md border-[4px] border-stamp bg-paper p-6">
            <div className="flex items-center gap-2">
              <ShieldAlert size={20} className="text-stamp" />
              <span className="font-display text-lg uppercase text-stamp">Warning from your teacher</span>
            </div>
            <p className="mt-3 font-body text-sm text-ink">{hostWarning}</p>
            <Button variant="primary" className="mt-5 w-full" onClick={dismissWarning}>I understand</Button>
          </div>
        </div>
      )}

      <video ref={videoRef} autoPlay playsInline muted className="sr-only" aria-hidden="true" />
      {proctoring && <ProctorOverlay score={score} attentionLabel={detection?.attention ?? 'focused'} isVisible />}
      {proctoring && detection && (
        <div className="absolute bottom-24 left-4 z-40">
          <StatusPill state={detection.attention as StatusState} />
        </div>
      )}
      {proctoring && modelFailure && (
        <div className="absolute top-4 left-1/2 z-50 -translate-x-1/2">
          <span className="chip !border-[1px] border-ochre text-ochre">Model unavailable — using fallback detection</span>
        </div>
      )}
    </div>
  );
}
