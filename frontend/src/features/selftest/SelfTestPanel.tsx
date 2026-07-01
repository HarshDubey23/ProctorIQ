import { useCallback, useState, useEffect, useRef } from 'react';
import { useWebcam } from './useWebcam';
import { useDetection, computeAttentionScore } from './useDetection';
import { Gauge } from '../../components/ui/Gauge';
import { StatusPill, type StatusState } from '../../components/ui/StatusPill';
import { ConfidenceBar } from '../../components/ui/ConfidenceBar';
import { LandmarkOverlay } from '../../components/ui/LandmarkOverlay';
import { isDetectionActive } from '../../lib/detection-config';
import { useUIStore } from '../../store/ui';
import { motion } from 'framer-motion';
import { Activity, CheckCircle2 } from 'lucide-react';
import { getBridge } from './detectionGlobals';

function formatAngle(rad: number): string {
  return ((rad * 180) / Math.PI).toFixed(1);
}

const CAL_SECS = 5;

export function SelfTestPanel() {
  const { videoRef, isDemo } = useWebcam();
  const { result, status, landmarks } = useDetection(videoRef, { isDemo });
  const setActivePanel = useUIStore((s) => s.setActivePanel);
  const [showRaw, setShowRaw] = useState(false);
  const [calState, setCalState] = useState<'idle' | 'calibrating' | 'done' | 'failed'>('idle');
  const [calProgress, setCalProgress] = useState(0);
  const calSamplesRef = useRef<number[]>([]);
  const calYawRef = useRef<number[]>([]);
  const calTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCalibration = useCallback(() => {
    calSamplesRef.current = [];
    calYawRef.current = [];
    setCalState('calibrating');
    setCalProgress(0);
    let ticks = 0;
    const totalTicks = CAL_SECS * 10;
    calTimerRef.current = setInterval(() => {
      ticks++;
      setCalProgress(ticks / totalTicks);
      if (ticks >= totalTicks) {
        if (calTimerRef.current) clearInterval(calTimerRef.current);
        const ears = calSamplesRef.current.filter((v) => v > 0.05 && v < 0.5);
        const yaws = calYawRef.current;
        if (ears.length < 5) {
          setCalState('failed');
          return;
        }
        const avgEar = ears.reduce((a, b) => a + b, 0) / ears.length;
        const avgYaw = yaws.reduce((a, b) => a + b, 0) / yaws.length;
        const bridge = getBridge();
        if (bridge) {
          bridge.setThresholds({
            earClosed: avgEar * 0.6,
            drowsyEarThreshold: avgEar * 0.75,
            yawThreshold: 20,
            pitchThreshold: 22,
            baselineEar: avgEar,
            baselineYaw: avgYaw,
          });
        }
        setCalState('done');
      }
    }, 100);
  }, []);

  const detectionReady = isDetectionActive(status);
  const score = result ? computeAttentionScore(result) : 0;
  const attention: StatusState = (result?.attention ?? 'focused') as StatusState;
  const confidence = result?.confidence ?? 0;
  const sourceLabel = result?.source === 'ml' ? 'ML' : 'Rule-based';

  useEffect(() => {
    if (calState !== 'calibrating' || !result) return;
    calSamplesRef.current.push((result.ear.left + result.ear.right) / 2);
    calYawRef.current.push(result.headPose.yaw);
  }, [result, calState]);

  useEffect(() => {
    if (calState !== 'idle' || !detectionReady || isDemo) return;
    const timer = setTimeout(() => startCalibration(), 500);
    return () => clearTimeout(timer);
  }, [detectionReady, isDemo, calState, startCalibration]);

  useEffect(() => {
    return () => {
      if (calTimerRef.current) clearInterval(calTimerRef.current);
    };
  }, []);

  const goToSession = useCallback(() => {
    setActivePanel('session');
  }, [setActivePanel]);

  const goToExam = useCallback(() => {
    setActivePanel('exam');
  }, [setActivePanel]);

  return (
    <div className="relative h-full w-full flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
          aria-label="Webcam feed with attention overlay"
        />

        <LandmarkOverlay
          landmarks={landmarks}
          videoEl={videoRef.current}
          enabled={detectionReady && !isDemo}
        />

        {status === 'loading' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
            <span className="font-sans text-xs uppercase tracking-widest text-text-secondary">
              Loading models…
            </span>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
            <span className="font-sans text-xs uppercase tracking-widest text-signal-alert">
              Detection unavailable
            </span>
          </div>
        )}

        {isDemo && (
          <div className="absolute top-4 right-4 z-30">
            <span className="rounded-full bg-signal-caution/[0.2] px-3 py-1 font-sans text-[11px] uppercase tracking-[0.1em] text-signal-caution border border-signal-caution/30 backdrop-blur-sm">
              DEMO MODE — no live camera
            </span>
          </div>
        )}

        {(calState === 'calibrating') && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-signal-focus border-t-transparent" />
              <span className="font-display text-xl uppercase tracking-[0.1em] text-signal-focus">
                Calibrating…
              </span>
              <span className="font-sans text-[13px] text-text-secondary">
                Look at the camera normally, relax your face
              </span>
              <div className="h-1.5 w-48 rounded-full bg-white/[0.08] overflow-hidden">
                <div
                  className="h-full rounded-full bg-signal-focus transition-all duration-300"
                  style={{ width: `${calProgress * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {(calState === 'done' || calState === 'failed') && detectionReady && result && !isDemo && (
          <>
            <div className="absolute top-4 left-1/2 z-20 -translate-x-1/2 flex items-center gap-2">
              {(calState === 'done') && (
                <span className="flex items-center gap-1 rounded-full bg-signal-drowsy/[0.12] px-2 py-0.5 font-sans text-[9px] text-signal-drowsy">
                  <CheckCircle2 size={10} />
                  Calibrated
                </span>
              )}
              <StatusPill state={attention} />
            </div>
            <div className="absolute top-4 right-4 z-20 w-48">
              <Gauge score={score} attentionLabel={attention} />
            </div>
            <div className="absolute top-4 left-4 z-20">
              <span className="rounded-full bg-white/5 px-2.5 py-0.5 font-mono text-[11px] tabular-nums text-text-mono">
                {sourceLabel}
              </span>
            </div>
            <div className="absolute bottom-4 left-4 z-20 w-48">
              <ConfidenceBar value={confidence} />
            </div>
          </>
        )}

        <div className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 text-center pointer-events-none">
          <p className="font-sans text-xs text-text-secondary max-w-xs leading-relaxed">
            Look away. The needle moves. Close your eyes — drowsy flag. Leave frame — absent flag.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 p-4 border-t border-white/[0.06]">
        <motion.button
          onClick={goToSession}
          className="rounded-xl bg-signal-focus/[0.12] px-8 py-3 font-display text-[15px] uppercase tracking-[0.12em] text-signal-focus transition-colors hover:bg-signal-focus/[0.2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
          whileTap={{ scale: 0.96 }}
        >
          Self-Test
        </motion.button>
        <motion.button
          onClick={goToExam}
          className="rounded-xl bg-signal-drowsy/[0.12] px-8 py-3 font-display text-[15px] uppercase tracking-[0.12em] text-signal-drowsy transition-colors hover:bg-signal-drowsy/[0.22] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
          whileTap={{ scale: 0.96 }}
        >
          Take Exam
        </motion.button>
      </div>

      <div className="border-t border-white/[0.04] px-4 py-2 flex items-center justify-center gap-3">
        <input
          id="room-code-input"
          type="text"
          placeholder="Room code (optional)"
          maxLength={6}
          className="w-36 rounded-lg bg-white/[0.05] border border-white/[0.08] px-3 py-1.5 font-mono text-[12px] uppercase tracking-wider text-text-primary text-center outline-none focus:border-signal-focus transition-colors"
          aria-label="Room code"
          onInput={(e) => {
            const val = (e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            (e.target as HTMLInputElement).value = val;
            sessionStorage.setItem('cohort-room-id', val);
          }}
        />
        <label htmlFor="room-code-input" className="font-sans text-[10px] text-text-muted">
          Join a cohort room
        </label>
      </div>
      {sessionStorage.getItem('cohort-room-id') && (
        <div className="px-4 pb-1 text-center">
          <span className="font-sans text-[9px] text-signal-caution italic">
            Your live score and state (not video) will be visible to the room host.
          </span>
        </div>
      )}

      {detectionReady && result && (
        <>
          <div className="border-t border-white/5 bg-white/[0.02] px-4 py-2">
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="flex items-center gap-1.5 font-sans text-[10px] uppercase tracking-[0.12em] text-text-muted hover:text-text-secondary transition-colors"
            >
              <Activity size={12} />
              {showRaw ? 'Hide raw metrics' : 'Show raw metrics'}
            </button>
          </div>
          {showRaw && (
            <div className="border-t border-white/5 bg-white/[0.02] p-4">
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-secondary">Yaw</div>
                    <div className="font-mono text-lg tabular-nums text-text-primary">
                      {result ? formatAngle(result.headPose.yaw) : '—'}°
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-secondary">Pitch</div>
                    <div className="font-mono text-lg tabular-nums text-text-primary">
                      {result ? formatAngle(result.headPose.pitch) : '—'}°
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-secondary">Roll</div>
                    <div className="font-mono text-lg tabular-nums text-text-primary">
                      {result ? formatAngle(result.headPose.roll) : '—'}°
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-secondary">EAR</div>
                    <div className="font-mono text-lg tabular-nums text-text-primary">
                      {result ? ((result.ear.left + result.ear.right) / 2).toFixed(3) : '—'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-secondary">Faces</div>
                    <div className="font-mono text-lg tabular-nums text-text-primary">
                      {result?.faceCount ?? '—'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] p-3">
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-secondary">Blinks/min</div>
                    <div className="font-mono text-lg tabular-nums text-text-primary">
                      {result?.blinkRate ?? '—'}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between text-[11px] pt-2">
                  <span className="text-text-secondary">Gaze</span>
                  <span className="font-mono tabular-nums text-text-primary">
                    {result?.gazeAway ? 'Away' : 'Forward'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-text-muted font-sans pointer-events-none">
        Processing runs locally. No video leaves your device.
      </div>
    </div>
  );
}
