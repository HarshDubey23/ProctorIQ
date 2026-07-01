import { useEffect, useRef, useState, useCallback } from 'react';
import { ApertureGauge } from '../../components/ui/ApertureGauge';
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
    <div className="flex h-full w-full flex-col" style={{ backgroundColor: 'var(--surface-0)' }}>
      <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <div className="flex items-center gap-3">
          <Users size={20} style={{ color: 'var(--jade)' }} />
          <h1 className="font-display text-lg uppercase tracking-[0.08em]" style={{ color: 'var(--ink)' }}>
            Cohort Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[22px] tabular-nums tracking-wider" style={{ color: 'var(--jade)' }}>
              {roomId}
            </span>
            <button
              onClick={handleCopy}
              className="rounded-md p-1.5 transition-colors"
              style={{ backgroundColor: 'var(--surface-1)', color: 'var(--ink-muted)' }}
              title="Copy room code"
            >
              <Copy size={14} />
            </button>
            {copied && (
              <span className="font-sans text-[10px]" style={{ color: 'var(--jade)' }}>Copied!</span>
            )}
          </div>
          <span className="flex items-center gap-1.5 font-sans text-[11px]"
            style={{ color: connected ? 'var(--jade)' : 'var(--ink-faint)' }}>
            <span className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: connected ? 'var(--jade)' : 'var(--ink-faint)' }}
            />
            {connected ? `${members.length} connected` : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Users size={48} style={{ color: 'var(--ink-faint)', opacity: 0.3 }} />
            <span className="font-display text-xl uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
              Waiting for students
            </span>
            <span className="font-mono text-sm" style={{ color: 'var(--jade)' }}>
              Share code: {roomId}
            </span>
            <p className="max-w-md text-center font-sans text-[12px]" style={{ color: 'var(--ink-faint)' }}>
              Students enter this room code on the Landing panel to join.
              Their score and state (not video) will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sorted.map((m) => {
              const openness = Math.max(0.05, m.score / 100);
              return (
                <div
                  key={m.session_id}
                  className="rounded-xl p-4 flex flex-col items-center gap-2"
                  style={{
                    backgroundColor: 'var(--surface-1)',
                    border: '1px solid var(--hairline)',
                  }}
                >
                  <div className="w-20">
                    <ApertureGauge openness={openness} size={80} />
                  </div>
                  <StatusPill state={m.current_state as StatusState} />
                  <span className="font-sans text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    {m.display_name}
                  </span>
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                    <span className="font-mono tabular-nums">
                      Score: {m.score}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatDuration(m.elapsed_seconds)}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--ink-faint)' }}>
                    {m.event_count} events
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-6 py-2 text-center font-sans text-[10px]" style={{ borderTop: '1px solid var(--hairline)', color: 'var(--ink-faint)' }}>
        Only score and state are broadcast — no video, image, or landmark data leaves student devices.
      </div>
    </div>
  );
}
