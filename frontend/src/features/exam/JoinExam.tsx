import { useState, useCallback, useEffect, type FormEvent } from 'react';
import { motion } from 'framer-motion';
import { User, LogIn, Clock, Users, XCircle } from 'lucide-react';

interface JoinExamProps {
  roomId: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface RoomInfo {
  room_id: string;
  title: string;
  status: string;
  duration_minutes: number | null;
  member_count: number;
}

export function JoinExam({ roomId }: JoinExamProps) {
  const [displayName, setDisplayName] = useState('');
  const [joining, setJoining] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState('');
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);

  const checkRoom = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/rooms/${roomId}/join-check`);
      if (resp.status === 410) {
        setError('This exam has already ended.');
        return false;
      }
      if (resp.status === 429) {
        setError('This exam is full. No more participants can join.');
        return false;
      }
      if (!resp.ok) {
        setError('Exam not found. Check the link and try again.');
        return false;
      }
      const info = await resp.json();
      setRoomInfo(info);
      return true;
    } catch {
      setError('Could not connect to the exam server.');
      return false;
    }
  }, [roomId]);

  useEffect(() => {
    checkRoom();
  }, [checkRoom]);

  const handleJoin = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) return;

    setError('');
    setJoining(true);

    const available = await checkRoom();
    if (!available) {
      setJoining(false);
      return;
    }

    sessionStorage.setItem('exam_room_id', roomId);
    sessionStorage.setItem('exam_display_name', name);
    if (roomInfo?.duration_minutes) {
      sessionStorage.setItem('exam_duration_minutes', String(roomInfo.duration_minutes));
    }

    setTransitioning(true);
    setTimeout(() => {
      window.location.href = '/';
    }, 400);
  }, [displayName, roomId, checkRoom, roomInfo]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center p-6" style={{ backgroundColor: 'var(--surface-0)' }}>
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
          <LogIn size={22} style={{ color: 'var(--jade)' }} />
          <h1 className="font-display text-xl uppercase tracking-[0.08em]" style={{ color: 'var(--ink)' }}>
            Join Exam
          </h1>
        </div>

        {roomInfo && (
          <div
            className="mb-4 rounded-lg px-4 py-3"
            style={{
              backgroundColor: 'rgba(14,107,92,0.08)',
              border: '1px solid rgba(14,107,92,0.15)',
            }}
          >
            <div className="font-sans text-sm font-medium" style={{ color: 'var(--ink)' }}>
              {roomInfo.title || 'Untitled Exam'}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
              {roomInfo.duration_minutes && (
                <span className="flex items-center gap-1">
                  <Clock size={10} />
                  {roomInfo.duration_minutes} min
                </span>
              )}
              <span className="flex items-center gap-1">
                <Users size={10} />
                {roomInfo.member_count} participant{roomInfo.member_count !== 1 ? 's' : ''}
              </span>
              <span className="flex items-center gap-1 font-mono">
                Room: {roomInfo.room_id}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div
            className="mb-4 flex items-start gap-2 rounded-lg px-3 py-3"
            style={{
              backgroundColor: 'rgba(166,61,47,0.1)',
              border: '1px solid rgba(166,61,47,0.2)',
            }}
            role="alert"
          >
            <XCircle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--clay)' }} />
            <div>
              <span className="font-sans text-sm" style={{ color: 'var(--clay)' }}>{error}</span>
              <p className="mt-1 font-sans text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                Contact the exam host if you believe this is a mistake.
              </p>
            </div>
          </div>
        )}

        {transitioning && (
          <motion.div
            className="flex flex-col items-center justify-center gap-4 py-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="h-8 w-8 animate-spin rounded-full border-2" style={{ borderColor: 'var(--jade)', borderTopColor: 'transparent' }} />
            <div className="flex flex-col items-center gap-1">
              <span className="font-display text-lg uppercase tracking-[0.08em]" style={{ color: 'var(--ink)' }}>
                Taking you to your exam...
              </span>
              <span className="font-sans text-xs" style={{ color: 'var(--ink-faint)' }}>
                One moment please
              </span>
            </div>
          </motion.div>
        )}

        {!error && !transitioning && (
          <form onSubmit={handleJoin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-sans text-[11px] uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
                <User size={12} className="inline mr-1" />
                Your Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your name..."
                maxLength={60}
                autoFocus
                className="rounded-lg px-3 py-2.5 font-sans text-sm outline-none transition-colors"
                style={{
                  backgroundColor: 'var(--surface-2)',
                  border: '1px solid var(--hairline-strong)',
                  borderTop: '1px solid var(--edge-highlight)',
                  boxShadow: 'var(--shadow-sm)',
                  color: 'var(--ink)',
                }}
                aria-label="Display name"
              />
            </div>

            <p className="font-sans text-xs leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
              No account required. You will go through a quick self-test calibration
              before the exam begins. Your attention data (not video) will be shared
              with the exam host in real time.
            </p>

            <motion.button
              type="submit"
              disabled={joining || !displayName.trim()}
              className="mt-2 w-full rounded-xl px-8 py-3 font-display text-[15px] uppercase tracking-[0.12em] transition-colors disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: 'var(--jade)',
                color: '#fff',
                border: '1px solid rgba(14,107,92,0.3)',
              }}
              whileHover={!(joining || !displayName.trim()) ? { scale: 1.02 } : {}}
              whileTap={!(joining || !displayName.trim()) ? { scale: 0.98 } : {}}
            >
              {joining ? 'Checking...' : 'Join Exam'}
            </motion.button>
          </form>
        )}
      </div>
    </div>
  );
}