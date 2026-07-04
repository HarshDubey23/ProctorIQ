import { useState, useCallback, useEffect, type FormEvent } from 'react';
import { User, LogIn, Clock, Users, XCircle } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader } from '../../components/ui/card';

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
  session_id?: string;
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

  const joinRoom = useCallback(async (name: string): Promise<RoomInfo | null> => {
    try {
      const resp = await fetch(`${API_BASE}/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name }),
      });
      if (resp.status === 410) {
        setError('This exam has already ended.');
        return null;
      }
      if (resp.status === 429) {
        setError('This exam is full. No more participants can join.');
        return null;
      }
      if (!resp.ok) {
        setError('Exam not found. Check the link and try again.');
        return null;
      }
      const info: RoomInfo = await resp.json();
      setRoomInfo(info);
      return info;
    } catch {
      setError('Could not connect to the exam server.');
      return null;
    }
  }, [roomId]);

  const handleJoin = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) return;

    setError('');
    setJoining(true);

    const joined = await joinRoom(name);
    if (!joined) {
      setJoining(false);
      return;
    }

    sessionStorage.setItem('exam_room_id', roomId);
    sessionStorage.setItem('exam_display_name', name);
    if (joined.session_id) {
      sessionStorage.setItem('exam_session_id', joined.session_id);
    }
    if (joined.duration_minutes) {
      sessionStorage.setItem('exam_duration_minutes', String(joined.duration_minutes));
    }

    setTransitioning(true);
    setTimeout(() => {
      window.location.href = '/';
    }, 400);
  }, [displayName, roomId, joinRoom]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-paper p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <LogIn size={22} className="text-ledger" />
            <h1 className="font-display text-xl uppercase tracking-[0.08em] text-ink">
              Join Exam
            </h1>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {roomInfo && (
            <div className="border-[3px] border-ink bg-paper-2 p-4">
              <div className="font-body text-sm font-medium text-ink">
                {roomInfo.title || 'Untitled Exam'}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 font-mono text-[10px] text-graphite">
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
                <span className="font-mono">
                  Room: {roomInfo.room_id}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="border-[3px] border-ochre bg-paper p-4 flex items-start gap-2" role="alert">
              <XCircle size={16} className="mt-0.5 shrink-0 text-ochre" />
              <div>
                <span className="font-body text-sm text-ochre">{error}</span>
                <p className="mt-1 font-body text-xs text-graphite">
                  Contact the exam host if you believe this is a mistake.
                </p>
              </div>
            </div>
          )}

          {transitioning && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <div className="h-8 w-8 border-[3px] border-ledger border-t-transparent animate-spin" />
              <div className="flex flex-col items-center gap-1">
                <span className="font-display text-lg uppercase tracking-[0.08em] text-ink">
                  Taking you to your exam...
                </span>
                <span className="font-body text-xs text-graphite">
                  One moment please
                </span>
              </div>
            </div>
          )}

          {!error && !transitioning && (
            <form onSubmit={handleJoin} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="font-label text-label text-graphite">
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
                  className="w-full border-[3px] border-ink bg-paper-2 px-4 py-2.5 font-body text-sm text-ink outline-none placeholder:text-graphite"
                  aria-label="Display name"
                />
              </div>

              <p className="font-body text-xs text-graphite leading-relaxed">
                No account required. You will go through a quick self-test calibration
                before the exam begins. Your attention data (not video) will be shared
                with the exam host in real time.
              </p>

              <Button
                type="submit"
                disabled={joining || !displayName.trim()}
                className="w-full"
              >
                {joining ? 'Checking...' : 'Join Exam'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}