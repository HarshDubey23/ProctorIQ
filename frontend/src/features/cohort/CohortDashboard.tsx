import { useEffect, useRef, useState, useCallback } from "react";
import { StampedSeal } from "../../components/ui/stamped-seal";
import { StatusPill, type StatusState } from "../../components/ui/StatusPill";
import { Copy, Users, Stamp } from "lucide-react";

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
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

export function CohortDashboard({ roomId }: CohortDashboardProps) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

  useEffect(() => {
    const wsUrl = API_BASE.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsUrl}/ws/room/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "room_update") {
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
    <div className="flex h-full w-full flex-col bg-ink-slate text-paper">
      {/* HEADER */}
      <div className="flex items-center justify-between border-b-[3px] border-paper px-6 py-4">
        <div className="flex items-center gap-3">
          <Stamp size={20} className="text-stamp" />
          <h1 className="font-display text-lg uppercase tracking-[0.08em] text-paper">
            Cohort Wall
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xl text-ledger">
              {roomId}
            </span>
            <button
              onClick={handleCopy}
              className="border-[2px] border-paper p-1.5 text-paper-2 hover:text-paper"
              title="Copy room code"
              aria-label="Copy room code"
            >
              <Copy size={14} />
            </button>
            {copied && (
              <span className="font-body text-xs text-ledger">Copied!</span>
            )}
          </div>
          <span className={`flex items-center gap-1.5 font-label text-label ${
            connected ? "text-ledger" : "text-graphite"
          }`}>
            <span className={`h-1.5 w-1.5 ${
              connected ? "bg-ledger" : "bg-graphite"
            }`} />
            {connected ? `${members.length} connected` : "Disconnected"}
          </span>
        </div>
      </div>

      {/* MEMBER PULSE WALL */}
      <div className="flex-1 overflow-y-auto p-6">
        {sorted.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Users size={48} className="text-graphite opacity-40" />
            <span className="font-display text-xl uppercase text-graphite">
              Waiting for students
            </span>
            <span className="font-mono text-sm text-ledger">
              Share code: {roomId}
            </span>
            <p className="max-w-md text-center font-body text-xs text-graphite">
              Students enter this room code on the Landing panel to join.
              Their score and state (not video) will appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sorted.map((m) => {
              const isAbsent = m.current_state === "absent" || m.current_state === "multi";
              return (
                <div
                  key={m.session_id}
                  className={`flex flex-col items-center gap-3 border-[3px] p-4 ${
                    isAbsent ? "border-stamp shadow-brutal-red" : "border-paper shadow-brutal-paper"
                  } bg-ink`}
                >
                  <StampedSeal
                    confidence={Math.max(0.01, m.score / 100)}
                    violation={isAbsent}
                    size={100}
                    label={m.current_state}
                  />
                  <StatusPill state={m.current_state as StatusState} />
                  <span className="font-body text-sm font-medium text-paper">
                    {m.display_name}
                  </span>
                  <div className="flex items-center gap-3 text-xs text-graphite">
                    <span className="font-mono">Score: {m.score}</span>
                    <span className="font-mono">{formatDuration(m.elapsed_seconds)}</span>
                  </div>
                  <span className="font-mono text-xs text-graphite">
                    {m.event_count} events
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t-[3px] border-paper px-6 py-2 text-center font-body text-xs text-graphite">
        Only score and state are broadcast — no video, image, or landmark data leaves student devices.
      </div>
    </div>
  );
}
