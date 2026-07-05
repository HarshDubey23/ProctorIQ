import { useRef, useEffect, useState } from 'react';
import { useDetection } from '../selftest/useDetection';

interface TaskRunnerProps {
  task: { id: string; label: string; seconds: number; prompt: string };
  progress: string;
  onClipRecorded: (landmarks: number[][], durationS: number) => void;
}

export function TaskRunner({ task, progress, onClipRecorded }: TaskRunnerProps) {
  const [recording, setRecording] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [done, setDone] = useState(false);
  const framesRef = useRef<number[][]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // real landmark stream — same bridge the exam self-test uses
  const { landmarks } = useDetection(videoRef, { enabled: true });

  // camera stream: mount once for the whole session, not per task
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then(stream => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {});
    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Bug B fix: reset per-task UI state whenever the task changes
  useEffect(() => {
    setRecording(false);
    setCountdown(3);
    setDone(false);
    framesRef.current = [];
    if (timerRef.current) clearInterval(timerRef.current);
    if (cdTimerRef.current) clearInterval(cdTimerRef.current);
  }, [task.id]);

  // Bug A fix: actually accumulate landmarks while recording.
  // Drop z — the model was trained on (x, y) only, 468*2 = 936 per frame.
  useEffect(() => {
    if (recording && landmarks) {
      framesRef.current.push(landmarks.flatMap(([x, y]) => [x, y]));
    }
  }, [landmarks, recording]);

  const startRecording = () => {
    framesRef.current = [];
    setCountdown(3);
    cdTimerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          if (cdTimerRef.current) clearInterval(cdTimerRef.current);
          beginCapture();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const beginCapture = () => {
    setRecording(true);
    const startTime = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed >= task.seconds) {
        if (timerRef.current) clearInterval(timerRef.current);
        setRecording(false);
        setDone(true);
        onClipRecorded(framesRef.current, task.seconds);
      }
    }, 100);
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-paper p-6">
      <div className="w-full max-w-md border-[3px] border-ink bg-paper-2 p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="font-mono text-xs text-graphite">{progress}</span>
          <span className="chip !border-[1px]">{task.label}</span>
        </div>
        <p className="font-body text-sm text-ink mb-6">{task.prompt}</p>
        <video ref={videoRef} autoPlay playsInline muted className="w-full border-[2px] border-ink mb-4" />
        {done ? (
          <div className="border-[2px] border-ledger bg-ledger/10 px-3 py-2 text-center">
            <span className="font-body text-sm text-ledger">Recorded! Moving to next task...</span>
          </div>
        ) : recording ? (
          <div className="border-[2px] border-ochre bg-ochre/10 px-3 py-2 text-center">
            <span className="font-body text-sm text-ochre animate-pulse">Recording...</span>
          </div>
        ) : countdown > 0 && countdown < 3 ? (
          <div className="border-[2px] border-ink bg-paper-2 px-3 py-2 text-center">
            <span className="font-display text-2xl text-ink">{countdown}</span>
          </div>
        ) : (
          <button
            onClick={startRecording}
            className="w-full border-[3px] border-ink bg-stamp px-4 py-3 font-display text-sm uppercase tracking-[0.08em] text-paper hover:bg-paper hover:text-stamp transition-colors"
          >
            Start Recording
          </button>
        )}
      </div>
    </div>
  );
}
