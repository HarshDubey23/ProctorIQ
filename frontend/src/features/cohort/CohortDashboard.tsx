import { useEffect, useRef, useState, useCallback } from 'react';
import { Gauge } from '../../components/ui/Gauge';
import { StatusPill, type StatusState } from '../../components/ui/StatusPill';
import { Copy, Users } from 'lucide-react';

interface RoomMember {
  session_id: string;
  display_name: string;
  score: number;
  current_state: string;
  elapsed_seconds: number;
  event_count: number;
}

interface CohortDashboardProps {
  roomId: string;
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export function CohortDashboard({ roomId }: CohortDashboardProps) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

  useEffect(() => {
    const wsUrl = API_BASE.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsUrl}/ws/room/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'room_update') {
          setMembers(msg.members ?? []);
        }
      } catch { /* noop */ }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [roomId, API_BASE]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [roomId]);

  const sorted = [...members].sort((a, b) => a.score - b.score);

  return (
    <div className="flex h-full w-full flex-col bg-bg-neutral">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-6 py-4">
        <div className="flex items-center gap-3">
          <Users size={20} className="text-signal-focus" />
          <h1 className="font-display text-lg uppercase tracking-[0.08em] text-text-primary">
            Cohort Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[22px] tabular-nums tracking-wider text-signal-focus">
              {roomId}
            </span>
            <button
              onClick={handleCopy}
              className="rounded-md bg-white/[0.06] p-1.5 text-text-secondary hover:text-text-primary transition-colors"
              title="Copy room code"
            >
              <Copy size={14} />
            </button>
            {copied && (
              <span className="font-sans text-[10px] text-signal-drowsy">Copied!</span>
            )}
          </div>
          <span className={`flex items-center gap-1.5 font-sans text-[11px] ${
            connected ? 'text-signal-drowsy' : 'text-signal-multi'
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${
              connected ? 'bg-signal-drowsy' : 'bg-signal-multi'
            }`} />
            {connected ? `${members.length} connected` : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Users size={48} className="text-text-muted opacity-30" />
            <span className="font-display text-xl uppercase tracking-[0.1em] text-text-secondary">
              Waiting for students
            </span>
            <span className="font-mono text-[13px] text-signal-focus">
              Share code: {roomId}
            </span>
            <p className="max-w-md text-center font-sans text-[12px] text-text-muted">
              Students enter this room code on the Landing panel to join.
              Their score and state (not video) will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sorted.map((m) => (
              <div
                key={m.session_id}
                className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-4 flex flex-col items-center gap-2"
              >
                <div className="w-20">
                  <Gauge score={m.score} attentionLabel={m.current_state} />
                </div>
                <StatusPill state={m.current_state as StatusState} />
                <span className="font-sans text-[13px] font-medium text-text-primary">
                  {m.display_name}
                </span>
                <div className="flex items-center gap-3 text-[10px] text-text-muted">
                  <span className="font-mono tabular-nums">
                    Score: {m.score}
                  </span>
                  <span className="font-mono tabular-nums">
                    {formatDuration(m.elapsed_seconds)}
                  </span>
                </div>
                <span className="font-mono text-[10px] tabular-nums text-text-muted">
                  {m.event_count} events
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.06] px-6 py-2 text-center font-sans text-[10px] text-text-muted">
        Only score and state are broadcast — no video, image, or landmark data leaves student devices.
      </div>
    </div>
  );
}
