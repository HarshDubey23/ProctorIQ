import { useCallback, useState, useEffect, useRef } from 'react';
import { useWebcam } from './useWebcam';
import { useDetection, computeAttentionScore } from './useDetection';
import { ApertureGauge } from '../../components/ui/ApertureGauge';
import { StatusPill, type StatusState } from '../../components/ui/StatusPill';
import { ConfidenceBar } from '../../components/ui/ConfidenceBar';
import { LandmarkOverlay } from '../../components/ui/LandmarkOverlay';
import { isDetectionActive } from '../../lib/detection-config';
import { useUIStore } from '../../store/ui';
import { motion } from 'framer-motion';
import { Activity, CheckCircle2 } from 'lucide-react';
import { getBridge } from './detectionGlobals';

const CAL_SECS = 5;

const BLADE_SEGMENTS = 8;

function CalibrationProgress({ progress }: { progress: number }) {
  const filled = Math.round(progress * BLADE_SEGMENTS);
  return (
    <div className="flex items-center gap-[2px]">
      {Array.from({ length: BLADE_SEGMENTS }, (_, i) => (
        <div
          key={i}
          className="h-2.5 w-2.5 rounded-sm transition-all duration-300"
          style={{
            backgroundColor: i < filled ? 'var(--jade)' : 'var(--hairline)',
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          }}
        />
      ))}
    </div>
  );
}

export function SelfTestPanel() {
  const { videoRef, isDemo } = useWebcam();
  const { result, status, landmarks, modelFailure } = useDetection(videoRef, { isDemo });
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
  const openness = score / 100;
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
    <div className="relative h-full w-full flex flex-col" style={{ backgroundColor: 'var(--surface-0)' }}>
      <div className="relative flex-1 overflow-hidden">
        {detectionReady && result && !isDemo ? (
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="relative">
              <ApertureGauge openness={openness} size={320}>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="h-full w-full object-cover"
                  aria-label="Webcam feed framed by aperture"
                  style={{ transform: 'scaleX(-1)' }}
                />
              </ApertureGauge>
              <div className="absolute inset-0 pointer-events-none">
                <LandmarkOverlay
                  landmarks={landmarks}
                  videoEl={videoRef.current}
                  enabled={detectionReady && !isDemo}
                />
              </div>
            </div>
          </div>
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute inset-0 h-full w-full object-cover"
            aria-label="Webcam feed"
          />
        )}

        <LandmarkOverlay
          landmarks={landmarks}
          videoEl={videoRef.current}
          enabled={detectionReady && !isDemo && !result}
        />

        {status === 'loading' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,25,27,0.7)' }}>
            <span className="font-sans text-xs uppercase tracking-widest" style={{ color: 'var(--ink-muted)' }}>
              Loading models…
            </span>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ backgroundColor: 'rgba(22,25,27,0.7)' }}>
            <span className="font-sans text-xs uppercase tracking-widest" style={{ color: 'var(--clay)' }}>
              Detection unavailable
            </span>
          </div>
        )}

        {isDemo && (
          <div className="absolute top-4 right-4 z-30">
            <span className="rounded-full px-3 py-1 font-sans text-[11px] uppercase tracking-[0.1em] border"
              style={{
                backgroundColor: 'rgba(185,118,58,0.15)',
                color: 'var(--ochre)',
                borderColor: 'rgba(185,118,58,0.3)',
              }}>
              DEMO MODE — no live camera
            </span>
          </div>
        )}

        {modelFailure && (
          <div className="absolute top-4 left-1/2 z-30 -translate-x-1/2">
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

        {(calState === 'calibrating') && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center"
            style={{ backgroundColor: 'rgba(22,25,27,0.75)' }}>
            <div className="flex flex-col items-center gap-3">
              <CalibrationProgress progress={calProgress} />
              <span className="font-display text-xl uppercase tracking-[0.1em]" style={{ color: 'var(--jade)' }}>
                Calibrating…
              </span>
              <span className="font-sans text-sm" style={{ color: 'var(--ink-muted)' }}>
                Look at the camera normally, relax your face
              </span>
            </div>
          </div>
        )}

        {(calState === 'done' || calState === 'failed') && detectionReady && result && !isDemo && (
          <>
            <div className="absolute top-4 left-1/2 z-20 -translate-x-1/2 flex items-center gap-2">
              {(calState === 'done') && (
                <span className="flex items-center gap-1 rounded-full px-2 py-0.5 font-sans text-[9px]"
                  style={{
                    backgroundColor: 'rgba(14,107,92,0.12)',
                    color: 'var(--jade)',
                  }}>
                  <CheckCircle2 size={10} />
                  Calibrated
                </span>
              )}
              <StatusPill state={attention} />
            </div>
            <div className="absolute top-4 left-4 z-20">
              <span className="rounded-full px-2.5 py-0.5 font-mono text-[11px] tabular-nums"
                style={{
                  backgroundColor: 'rgba(46,76,140,0.1)',
                  color: 'var(--cobalt)',
                }}>
                {sourceLabel}
              </span>
            </div>
            <div className="absolute bottom-4 left-4 z-20 w-48">
              <ConfidenceBar value={confidence} />
            </div>
          </>
        )}

        <div className="absolute bottom-24 left-1/2 z-10 -translate-x-1/2 text-center pointer-events-none">
          <p className="font-sans text-sm max-w-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
            Look away. The aperture closes. Close your eyes — drowsy flag. Leave frame — absent flag.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 p-4" style={{ borderTop: '1px solid var(--hairline)' }}>
        <motion.button
          onClick={goToSession}
          className="rounded-xl px-8 py-3 font-display text-[15px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: 'rgba(14,107,92,0.12)',
            color: 'var(--jade)',
          }}
          whileHover={{ backgroundColor: 'rgba(14,107,92,0.2)' }}
          whileTap={{ scale: 0.96 }}
        >
          Self-Test
        </motion.button>
        <motion.button
          onClick={goToExam}
          className="rounded-xl px-8 py-3 font-display text-[15px] uppercase tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: 'rgba(14,107,92,0.12)',
            color: 'var(--jade)',
          }}
          whileHover={{ backgroundColor: 'rgba(14,107,92,0.2)' }}
          whileTap={{ scale: 0.96 }}
        >
          Take Exam
        </motion.button>
      </div>

      <div className="px-4 py-2 flex items-center justify-center gap-3" style={{ borderTop: '1px solid var(--hairline)' }}>
        <input
          id="room-code-input"
          type="text"
          placeholder="Room code (optional)"
          maxLength={6}
          className="w-36 rounded-lg px-3 py-1.5 font-mono text-[12px] uppercase tracking-wider text-center outline-none transition-colors"
          style={{
            backgroundColor: 'var(--surface-1)',
            border: '1px solid var(--hairline-strong)',
            color: 'var(--ink)',
          }}
          aria-label="Room code"
          onInput={(e) => {
            const val = (e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            (e.target as HTMLInputElement).value = val;
            sessionStorage.setItem('cohort-room-id', val);
          }}
        />
        <label htmlFor="room-code-input" className="font-sans text-[10px]" style={{ color: 'var(--ink-faint)' }}>
          Join a cohort room
        </label>
      </div>
      {sessionStorage.getItem('cohort-room-id') && (
        <div className="px-4 pb-1 text-center">
          <span className="font-sans text-[9px] italic" style={{ color: 'var(--ochre)' }}>
            Your live score and state (not video) will be visible to the room host.
          </span>
        </div>
      )}

      {detectionReady && result && (
        <>
          <div className="px-4 py-2" style={{ borderTop: '1px solid var(--hairline)', backgroundColor: 'var(--surface-1)' }}>
            <button
              onClick={() => setShowRaw((v) => !v)}
              className="flex items-center gap-1.5 font-sans text-[10px] uppercase tracking-[0.12em] transition-colors"
              style={{ color: 'var(--ink-faint)' }}
            >
              <Activity size={12} />
              {showRaw ? 'Hide raw metrics' : 'Show raw metrics'}
            </button>
          </div>
          {showRaw && (
            <div className="p-4" style={{ borderTop: '1px solid var(--hairline)', backgroundColor: 'var(--surface-1)' }}>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--surface-2)', boxShadow: 'var(--shadow-sm)', borderTop: '1px solid var(--edge-highlight)' }}>
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>Yaw</div>
                    <div className="font-mono text-lg tabular-nums" style={{ color: 'var(--ink)' }}>
                      {result ? ((result.headPose.yaw * 180) / Math.PI).toFixed(1) : '—'}°
                    </div>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--surface-2)', boxShadow: 'var(--shadow-sm)', borderTop: '1px solid var(--edge-highlight)' }}>
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>Pitch</div>
                    <div className="font-mono text-lg tabular-nums" style={{ color: 'var(--ink)' }}>
                      {result ? ((result.headPose.pitch * 180) / Math.PI).toFixed(1) : '—'}°
                    </div>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--surface-2)', boxShadow: 'var(--shadow-sm)', borderTop: '1px solid var(--edge-highlight)' }}>
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>Roll</div>
                    <div className="font-mono text-lg tabular-nums" style={{ color: 'var(--ink)' }}>
                      {result ? ((result.headPose.roll * 180) / Math.PI).toFixed(1) : '—'}°
                    </div>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--surface-2)', boxShadow: 'var(--shadow-sm)', borderTop: '1px solid var(--edge-highlight)' }}>
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>EAR</div>
                    <div className="font-mono text-lg tabular-nums" style={{ color: 'var(--ink)' }}>
                      {result ? ((result.ear.left + result.ear.right) / 2).toFixed(3) : '—'}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--surface-2)', boxShadow: 'var(--shadow-sm)', borderTop: '1px solid var(--edge-highlight)' }}>
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>Faces</div>
                    <div className="font-mono text-lg tabular-nums" style={{ color: 'var(--ink)' }}>
                      {result?.faceCount ?? '—'}
                    </div>
                  </div>
                  <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--surface-2)', boxShadow: 'var(--shadow-sm)', borderTop: '1px solid var(--edge-highlight)' }}>
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>Blinks/min</div>
                    <div className="font-mono text-lg tabular-nums" style={{ color: 'var(--ink)' }}>
                      {result?.blinkRate ?? '—'}
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-[11px] pt-2">
                  <span style={{ color: 'var(--ink-muted)' }}>Gaze</span>
                  <span className="font-mono tabular-nums" style={{ color: 'var(--ink)' }}>
                    {result?.gazeAway ? 'Away' : 'Forward'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-sans pointer-events-none" style={{ color: 'var(--ink-faint)' }}>
        Processing runs locally. No video leaves your device.
      </div>
    </div>
  );
}
