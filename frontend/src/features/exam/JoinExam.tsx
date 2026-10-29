import { useState, useCallback, useEffect, type FormEvent } from 'react';
import { User, LogIn, Clock, Users, XCircle, KeyRound } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';
import { API_BASE } from '../../lib/api';
import { clearAttempt, loadAttempt, saveAttempt } from './types';

interface RoomInfo {
  room_id: string;
  title: string;
  status: string;
  duration_minutes: number | null;
  member_count: number;
}

const ERRORS: Record<number, string> = {
  404: 'Exam not found. Check the code and try again.',
  410: 'This exam has already ended.',
  429: 'This exam is full. No more participants can join.',
};

export function goToExam(roomId: string) {
  sessionStorage.setItem('exam_room_id', roomId);
  window.location.href = `/exam/${roomId}`;
}

/** Code entry for students who were given a code instead of a link. */
export function JoinCodeForm() {
  const [code, setCode] = useState('');
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-3">
          <KeyRound size={22} className="text-ledger" />
          <h1 className="font-display text-xl uppercase tracking-[0.08em] text-ink">Join an exam</h1>
        </div>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (clean.length === 6) window.location.href = `/join/${clean}`;
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className="font-label text-label text-graphite">Exam code from your teacher</span>
            <input
              value={clean}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABC123"
              autoFocus
              autoComplete="off"
              aria-label="Exam code"
              className="w-full border-[3px] border-ink bg-paper-2 px-4 py-3 text-center font-mono text-2xl uppercase tracking-[0.3em] text-ink outline-none"
            />
          </label>
          <Button type="submit" variant="primary" disabled={clean.length !== 6}>Continue</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function JoinExam({ roomId }: { roomId?: string }) {
  const [displayName, setDisplayName] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [roomInfo, setRoomInfo] = useState<RoomInfo | null>(null);
  const [existing, setExisting] = useState(() => (roomId ? loadAttempt(roomId) : null));

  useEffect(() => {
    if (!roomId) return;
    fetch(`${API_BASE}/api/rooms/${roomId}/join-check`)
      .then(async (resp) => {
        if (!resp.ok) {
          // A student who already joined can still open their results after the exam closes.
          if (resp.status === 410 && loadAttempt(roomId)) return;
          setError(ERRORS[resp.status] ?? 'Exam not found. Check the link and try again.');
          return;
        }
        setRoomInfo(await resp.json());
      })
      .catch(() => setError('Could not connect to the exam server.'));
  }, [roomId]);

  const handleJoin = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name || !roomId) return;
    setError('');
    setJoining(true);
    try {
      const resp = await fetch(`${API_BASE}/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name }),
      });
      if (!resp.ok) {
        setError(ERRORS[resp.status] ?? 'Could not join this exam.');
        setJoining(false);
        return;
      }
      const info: { session_id: string; student_token: string } = await resp.json();
      saveAttempt({ roomId, sessionId: info.session_id, token: info.student_token, displayName: name });
      goToExam(roomId);
    } catch {
      setError('Could not connect to the exam server.');
      setJoining(false);
    }
  }, [displayName, roomId]);

  if (!roomId) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-paper p-6">
        <JoinCodeForm />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-paper p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <LogIn size={22} className="text-ledger" />
            <h1 className="font-display text-xl uppercase tracking-[0.08em] text-ink">Join Exam</h1>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {roomInfo && (
            <div className="border-[3px] border-ink bg-paper-2 p-4">
              <div className="font-body text-sm font-medium text-ink">{roomInfo.title || 'Untitled Exam'}</div>
              <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] text-graphite">
                {roomInfo.duration_minutes && (
                  <span className="flex items-center gap-1"><Clock size={10} />{roomInfo.duration_minutes} min</span>
                )}
                <span className="flex items-center gap-1">
                  <Users size={10} />{roomInfo.member_count} joined
                </span>
                <span>Code: {roomInfo.room_id}</span>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 border-[3px] border-ochre bg-paper p-4" role="alert">
              <XCircle size={16} className="mt-0.5 shrink-0 text-ochre" />
              <span className="font-body text-sm text-ochre">{error}</span>
            </div>
          )}

          {existing && (
            <div className="flex flex-col gap-2 border-[3px] border-ledger p-4">
              <span className="font-body text-sm text-ink">
                You already joined this exam as <strong>{existing.displayName}</strong>.
              </span>
              <Button variant="primary" onClick={() => goToExam(roomId)}>Continue as {existing.displayName}</Button>
              {roomInfo && (
                <button
                  type="button"
                  className="font-body text-xs text-graphite underline"
                  onClick={() => { clearAttempt(roomId); setExisting(null); }}
                >
                  Not you? Join as a different student
                </button>
              )}
            </div>
          )}

          {!existing && roomInfo && (
            <form onSubmit={handleJoin} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="font-label text-label text-graphite">
                  <User size={12} className="inline mr-1" />
                  Your full name
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Name as on the class roster"
                  maxLength={60}
                  autoFocus
                  className="w-full border-[3px] border-ink bg-paper-2 px-4 py-2.5 font-body text-sm text-ink outline-none placeholder:text-graphite"
                  aria-label="Your full name"
                />
              </label>
              <p className="font-body text-xs leading-relaxed text-graphite">
                No account needed. You'll need a working camera. Your attention signals (not video) are shared with the
                exam host in real time.
              </p>
              <Button type="submit" variant="primary" disabled={joining || !displayName.trim()} className="w-full">
                {joining ? 'Joining…' : 'Join Exam'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
