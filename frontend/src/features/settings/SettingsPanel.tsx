import { useState, useCallback } from 'react';
import { RotateCcw, Download, Trash2, Users } from 'lucide-react';
import { useUIStore } from '../../store/ui';
import { listSessions, deleteSession } from '../../lib/db';
import { BenchmarkModal } from './BenchmarkModal';
import { ProctorExternalExam } from './ProctorExternalExam';

export function SettingsPanel() {
  const mode = useUIStore((s) => s.mode);
  const setMode = useUIStore((s) => s.setMode);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [proctorUrl, setProctorUrl] = useState('');
  const [proctorActive, setProctorActive] = useState(false);

  const [thresholds, setThresholds] = useState({
    headPoseAngle: 20,
    earThreshold: 0.21,
    absenceDuration: 1.0,
    drowsyDuration: 2.0,
  });

  const resetDefaults = useCallback(() => {
    setThresholds({ headPoseAngle: 20, earThreshold: 0.21, absenceDuration: 1.0, drowsyDuration: 2.0 });
  }, []);

  const exportAllData = useCallback(async () => {
    try {
      const sessions = await listSessions();
      const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'proctoriq-sessions.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* noop */ }
  }, []);

  const clearAllData = useCallback(async () => {
    try {
      const sessions = await listSessions();
      for (const s of sessions) {
        await deleteSession(s.id);
      }
      setShowClearConfirm(false);
    } catch { /* noop */ }
  }, []);

  if (proctorActive && proctorUrl) {
    return (
      <ProctorExternalExam
        url={proctorUrl}
        onBack={() => {
          setProctorActive(false);
          setProctorUrl('');
        }}
      />
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-6 overflow-y-auto p-4 lg:p-6">
      <div className="flex items-center gap-3">
        <h2 className="font-display text-lg uppercase tracking-[0.08em] text-text-primary">
          Settings
        </h2>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-white/[0.03] p-4">
          <h3 className="font-sans text-[11px] uppercase tracking-[0.14em] text-text-secondary mb-3">
            Mode
          </h3>
          <div className="flex gap-2">
            {(['exam', 'selftest'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-lg px-5 py-2.5 font-sans text-[12px] uppercase tracking-[0.1em] transition-all ${
                  mode === m
                    ? 'bg-signal-focus/[0.15] text-signal-focus border border-signal-focus/30'
                    : 'bg-white/[0.04] text-text-secondary hover:bg-white/[0.08] border border-transparent'
                }`}
              >
                {m === 'exam' ? 'Proctor' : 'Focus Coach'}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-xl bg-white/[0.03] p-4">
          <h3 className="font-sans text-[11px] uppercase tracking-[0.14em] text-text-secondary mb-3">
            Thresholds
          </h3>
          <div className="flex flex-col gap-4">
            {[
              { key: 'headPoseAngle', label: 'Head Pose Angle', min: 15, max: 35, step: 1, unit: '°' },
              { key: 'earThreshold', label: 'EAR Threshold', min: 0.15, max: 0.30, step: 0.01, unit: '' },
              { key: 'absenceDuration', label: 'Absence Duration', min: 0.5, max: 3, step: 0.5, unit: 's' },
              { key: 'drowsyDuration', label: 'Drowsy Duration', min: 1, max: 4, step: 0.5, unit: 's' },
            ].map(({ key, label, min, max, step, unit }) => {
              const value = thresholds[key as keyof typeof thresholds];
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-sans text-[12px] text-text-secondary">{label}</label>
                    <span className="font-mono text-[11px] tabular-nums text-text-mono">
                      {value}{unit}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={value}
                    onChange={(e) => {
                      const v = step >= 1 ? parseInt(e.target.value, 10) : parseFloat(e.target.value);
                      setThresholds((prev) => ({ ...prev, [key]: v }));
                    }}
                    className="w-full appearance-none h-1.5 rounded-full bg-white/[0.1] outline-none cursor-pointer
                      [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4
                      [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-signal-focus
                      [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-bg-neutral"
                    aria-label={label}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl bg-white/[0.03] p-4">
          <h3 className="font-sans text-[11px] uppercase tracking-[0.14em] text-text-secondary mb-3">
            Model & Overlay
          </h3>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setBenchmarkOpen(true)}
              className="rounded-lg bg-signal-focus/[0.1] px-4 py-2.5 font-sans text-[12px] uppercase tracking-[0.1em] text-signal-focus transition-colors hover:bg-signal-focus/[0.2] text-left"
            >
              Run Benchmark
            </button>
          </div>
        </div>

        <div className="rounded-xl bg-white/[0.03] p-4">
          <h3 className="font-sans text-[11px] uppercase tracking-[0.14em] text-text-secondary mb-3">
            Data
          </h3>
          <div className="flex flex-col gap-2">
            <button
              onClick={resetDefaults}
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 font-sans text-[12px] text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
            >
              <RotateCcw size={14} />
              Reset to defaults
            </button>
            <button
              onClick={exportAllData}
              className="flex items-center gap-2 rounded-lg px-4 py-2.5 font-sans text-[12px] text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary"
            >
              <Download size={14} />
              Export all sessions as JSON
            </button>
            {showClearConfirm ? (
              <div className="flex items-center gap-2 mt-1">
                <span className="font-sans text-[11px] text-signal-alert">
                  This cannot be undone. Confirm?
                </span>
                <button
                  onClick={clearAllData}
                  className="rounded-lg bg-signal-alert/[0.2] px-3 py-1.5 font-sans text-[11px] text-signal-alert transition-colors hover:bg-signal-alert/[0.3]"
                >
                  Yes, clear all
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="rounded-lg px-3 py-1.5 font-sans text-[11px] text-text-secondary transition-colors hover:bg-white/[0.06]"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="flex items-center gap-2 rounded-lg px-4 py-2.5 font-sans text-[12px] text-signal-multi transition-colors hover:bg-signal-multi/[0.1]"
              >
                <Trash2 size={14} />
                Clear all session data
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white/[0.02] p-4">
        <h3 className="font-sans text-[11px] uppercase tracking-[0.14em] text-text-secondary mb-2">
          Cohort Mode (Beta)
        </h3>
        <p className="font-sans text-[12px] text-text-muted leading-relaxed mb-3">
          Create a room and share the code. Students join from the Landing panel.
          Watch live attention scores for all students in a single dashboard.
        </p>
        <button
          onClick={async () => {
            try {
              const res = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/rooms`, { method: 'POST' });
              if (res.ok) {
                const data = await res.json();
                window.open(`/cohort/${data.room_id}`, '_blank');
              }
            } catch { /* noop */ }
          }}
          className="flex items-center gap-2 rounded-lg bg-signal-focus/[0.1] px-4 py-2.5 font-sans text-[12px] uppercase tracking-[0.1em] text-signal-focus transition-colors hover:bg-signal-focus/[0.2]"
        >
          <Users size={14} />
          Start Cohort Session
        </button>
      </div>

      <div className="rounded-xl bg-white/[0.02] p-4">
        <h3 className="font-sans text-[11px] uppercase tracking-[0.14em] text-text-secondary mb-2">
          Proctor Your Own Exam
        </h3>
        <p className="font-sans text-[12px] text-text-muted leading-relaxed mb-3">
          Paste a Google Form, Typeform, or any exam URL below. ProctorIQ runs alongside
          and generates an integrity report when you're done.
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={proctorUrl}
            onChange={(e) => setProctorUrl(e.target.value)}
            placeholder="https://forms.google.com/..."
            className="flex-1 rounded-lg bg-white/[0.06] border border-white/[0.08] px-3 py-2 font-mono text-[12px] text-text-primary outline-none focus:border-signal-focus transition-colors"
            aria-label="Exam URL"
          />
          <button
            className="rounded-lg bg-signal-drowsy/[0.12] px-4 py-2 font-sans text-[11px] uppercase tracking-[0.1em] text-signal-drowsy transition-colors hover:bg-signal-drowsy/[0.22] disabled:opacity-30"
            disabled={!proctorUrl}
            onClick={() => {
              if (proctorUrl) setProctorActive(true);
            }}
          >
            Start
          </button>
        </div>
        <p className="font-sans text-[10px] text-text-muted mt-2 italic">
          Some sites block iframe embedding (X-Frame-Options). Google Forms works. Typeform works.
        </p>
      </div>

      <BenchmarkModal
        open={benchmarkOpen}
        onClose={() => setBenchmarkOpen(false)}
      />
    </div>
  );
}
