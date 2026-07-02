import { useState, useCallback, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { Shield, Clock, Users } from 'lucide-react';

interface HostExamCreateProps {
  onCreated: (data: { room_id: string; host_token: string; join_url: string }) => void;
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export function HostExamCreate({ onCreated }: HostExamCreateProps) {
  const [title, setTitle] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [maxParticipants, setMaxParticipants] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const body: Record<string, unknown> = {};
      if (title.trim()) body.title = title.trim();
      const dur = parseInt(durationMinutes, 10);
      if (!isNaN(dur) && dur > 0) body.duration_minutes = dur;
      const max = parseInt(maxParticipants, 10);
      if (!isNaN(max) && max > 0) body.max_participants = max;

      const resp = await fetch(`${API_BASE}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `HTTP ${resp.status}`);
      }
      const data = await resp.json();

      localStorage.setItem(`host_token_${data.room_id}`, data.host_token);
      onCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create exam');
    } finally {
      setCreating(false);
    }
  }, [title, durationMinutes, maxParticipants, onCreated]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-6">
      <div
        className="w-full max-w-md rounded-xl p-6"
        style={{
          backgroundColor: 'var(--surface-1)',
          border: '1px solid var(--hairline)',
          borderTop: '1px solid var(--edge-highlight)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div className="mb-6 flex items-center gap-3">
          <Shield size={22} style={{ color: 'var(--jade)' }} />
          <h1 className="font-display text-xl uppercase tracking-[0.08em]" style={{ color: 'var(--ink)' }}>
            Host an Exam
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="font-sans text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
              Exam Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Midterm Physics"
              maxLength={200}
              className="rounded-lg px-3 py-2.5 font-sans text-sm outline-none transition-colors"
              style={{
                backgroundColor: 'var(--surface-2)',
                border: '1px solid var(--hairline-strong)',
                borderTop: '1px solid var(--edge-highlight)',
                boxShadow: 'var(--shadow-sm)',
                color: 'var(--ink)',
              }}
              aria-label="Exam title"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="font-sans text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
                <Clock size={12} className="inline mr-1" />
                Duration (min)
              </label>
              <input
                type="number"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                min={1}
                placeholder="Untimed"
                className="rounded-lg px-3 py-2.5 font-mono text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--surface-2)',
                  border: '1px solid var(--hairline-strong)',
                  borderTop: '1px solid var(--edge-highlight)',
                  boxShadow: 'var(--shadow-sm)',
                  color: 'var(--ink)',
                }}
                aria-label="Duration in minutes"
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <label className="font-sans text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
                <Users size={12} className="inline mr-1" />
                Max Participants
              </label>
              <input
                type="number"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(e.target.value)}
                min={1}
                placeholder="Unlimited"
                className="rounded-lg px-3 py-2.5 font-mono text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--surface-2)',
                  border: '1px solid var(--hairline-strong)',
                  borderTop: '1px solid var(--edge-highlight)',
                  boxShadow: 'var(--shadow-sm)',
                  color: 'var(--ink)',
                }}
                aria-label="Max participants"
              />
            </div>
          </div>

          {error && (
            <div
              className="rounded-lg px-3 py-2 font-sans text-xs"
              style={{
                backgroundColor: 'rgba(166,61,47,0.1)',
                color: 'var(--clay)',
                border: '1px solid rgba(166,61,47,0.2)',
              }}
              role="alert"
            >
              {error}
            </div>
          )}

          <motion.button
            type="submit"
            disabled={creating}
            className="mt-2 w-full rounded-xl px-8 py-3 font-display text-[15px] uppercase tracking-[0.12em] transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: 'var(--jade)',
              color: '#fff',
              border: '1px solid rgba(14,107,92,0.3)',
            }}
            whileHover={!creating ? { scale: 1.02 } : {}}
            whileTap={!creating ? { scale: 0.98 } : {}}
          >
            {creating ? 'Creating...' : 'Create Exam'}
          </motion.button>
        </form>

        <p className="mt-4 text-center font-sans text-[10px]" style={{ color: 'var(--ink-faint)' }}>
          You will receive a shareable link and a QR code after creation.
        </p>
      </div>
    </div>
  );
}
