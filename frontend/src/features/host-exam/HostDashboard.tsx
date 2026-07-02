import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Wifi, WifiOff, Download, XCircle, AlertTriangle,
  Search, UserX
} from 'lucide-react';
import { StatusPill, type StatusState } from '../../components/ui/StatusPill';
import { AttentionChart } from '../dashboard/AttentionChart';
import type { AttentionSample } from '../dashboard/useSession';

interface RoomMember {
  session_id: string;
  display_name: string;
  score: number;
  current_state: string;
  elapsed_seconds: number;
  event_count: number;
}

interface MemberAttentionHistory {
  [sessionId: string]: AttentionSample[];
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const STATE_COLORS: Record<string, string> = {
  focused: 'var(--jade)',
  distracted: 'var(--ochre)',
  absent: 'var(--clay)',
  drowsy: 'var(--plum)',
  multi: 'var(--clay)',
};

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

function getConnectionStatus(ws: WebSocket | null): 'live' | 'reconnecting' | 'offline' {
  if (!ws) return 'offline';
  if (ws.readyState === WebSocket.OPEN) return 'live';
  if (ws.readyState === WebSocket.CONNECTING) return 'reconnecting';
  return 'offline';
}

interface HostDashboardProps {
  roomId: string;
}

export function HostDashboard({ roomId }: HostDashboardProps) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [closing, setClosing] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [closed, setClosed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [attentionHistory, setAttentionHistory] = useState<MemberAttentionHistory>({});
  const wsRef = useRef<WebSocket | null>(null);
  const historyRef = useRef<MemberAttentionHistory>({});

  const hostToken = useMemo(() => localStorage.getItem(`host_token_${roomId}`), [roomId]);

  useEffect(() => {
    const wsUrl = API_BASE.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsUrl}/ws/room/${roomId}`);
    wsRef.current = ws;

    ws.onopen = () => {};
    ws.onclose = () => {};
    ws.onerror = () => {};

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'room_update') {
          const newMembers: RoomMember[] = msg.members ?? [];
          setMembers(newMembers);

          const h = { ...historyRef.current };
          const now = Date.now();
          for (const m of newMembers) {
            if (!h[m.session_id]) h[m.session_id] = [];
            h[m.session_id].push({
              timestamp: now,
              score: m.score,
              attention: m.current_state,
            });
            if (h[m.session_id].length > 100) {
              h[m.session_id] = h[m.session_id].slice(-100);
            }
          }
          historyRef.current = h;
          setAttentionHistory({ ...h });
        }
      } catch { /* noop */ }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [roomId]);

  const flaggedMembers = useMemo(
    () => members.filter((m) => m.current_state !== 'focused'),
    [members],
  );

  const filteredMembers = useMemo(() => {
    let list = showFlaggedOnly ? flaggedMembers : members;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => m.display_name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => a.score - b.score);
  }, [members, flaggedMembers, showFlaggedOnly, searchQuery]);

  const wsStatus = getConnectionStatus(wsRef.current);

  const handleCloseExam = useCallback(async () => {
    if (!hostToken) return;
    setClosing(true);
    try {
      const resp = await fetch(`${API_BASE}/api/rooms/${roomId}/close`, {
        method: 'POST',
        headers: { 'X-Host-Token': hostToken },
      });
      if (resp.ok) {
        setClosed(true);
        setShowConfirmClose(false);
      }
    } catch { /* noop */ } finally {
      setClosing(false);
    }
  }, [roomId, hostToken]);

  const handleDownloadReports = useCallback(async () => {
    if (!hostToken) return;
    setDownloading(true);
    try {
      const resp = await fetch(`${API_BASE}/api/rooms/${roomId}/reports?format=zip`, {
        headers: { 'X-Host-Token': hostToken },
      });
      if (!resp.ok) return;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cohort-${roomId}-reports.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* noop */ } finally {
      setDownloading(false);
    }
  }, [roomId, hostToken]);

  return (
    <div className="flex h-full w-full flex-col" style={{ backgroundColor: 'var(--surface-0)' }}>
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-6 py-4"
        style={{ borderBottom: '1px solid var(--hairline)' }}
      >
        <div className="flex items-center gap-3">
          <Users size={20} style={{ color: 'var(--jade)' }} />
          <div className="flex flex-col">
            <h1 className="font-display text-lg uppercase tracking-[0.08em]" style={{ color: 'var(--ink)' }}>
              Mission Control
            </h1>
            <span className="font-mono text-[10px] tabular-nums" style={{ color: 'var(--ink-faint)' }}>
              Room: {roomId}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <AnimatePresence>
            {closed && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-full px-3 py-1 font-sans text-[10px] uppercase tracking-[0.1em]"
                style={{
                  backgroundColor: 'rgba(166,61,47,0.12)',
                  color: 'var(--clay)',
                  border: '1px solid rgba(166,61,47,0.2)',
                }}
              >
                Closed
              </motion.span>
            )}
          </AnimatePresence>

          <div
            className="flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10px]"
            style={{
              backgroundColor: wsStatus === 'live'
                ? 'rgba(14,107,92,0.1)'
                : wsStatus === 'reconnecting'
                  ? 'rgba(185,118,58,0.1)'
                  : 'rgba(166,61,47,0.1)',
              color: wsStatus === 'live'
                ? 'var(--jade)'
                : wsStatus === 'reconnecting'
                  ? 'var(--ochre)'
                  : 'var(--clay)',
            }}
          >
            {wsStatus === 'live' ? <Wifi size={10} /> : <WifiOff size={10} />}
            {wsStatus === 'live' ? `${members.length} connected` : wsStatus}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-6 py-3" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--ink-faint)' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name..."
            className="w-full rounded-lg px-8 py-1.5 font-sans text-[12px] outline-none transition-colors"
            style={{
              backgroundColor: 'var(--surface-1)',
              border: '1px solid var(--hairline-strong)',
              color: 'var(--ink)',
            }}
            aria-label="Search participants"
          />
        </div>

        <motion.button
          onClick={() => setShowFlaggedOnly((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-[11px] transition-colors"
          style={{
            backgroundColor: showFlaggedOnly ? 'rgba(185,118,58,0.15)' : 'var(--surface-1)',
            color: showFlaggedOnly ? 'var(--ochre)' : 'var(--ink-muted)',
            border: '1px solid var(--hairline-strong)',
          }}
          whileTap={{ scale: 0.96 }}
        >
          <AlertTriangle size={12} />
          Flagged ({flaggedMembers.length})
        </motion.button>

        <div className="flex items-center gap-2">
          {!showConfirmClose ? (
            <motion.button
              onClick={() => setShowConfirmClose(true)}
              disabled={closed}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-[11px] transition-colors disabled:opacity-30"
              style={{
                backgroundColor: 'rgba(166,61,47,0.1)',
                color: 'var(--clay)',
                border: '1px solid rgba(166,61,47,0.2)',
              }}
              whileTap={!closed ? { scale: 0.96 } : {}}
            >
              <XCircle size={12} />
              End Exam
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2"
            >
              <span className="font-sans text-[10px]" style={{ color: 'var(--clay)' }}>
                Are you sure?
              </span>
              <button
                onClick={handleCloseExam}
                disabled={closing}
                className="rounded-lg px-3 py-1.5 font-sans text-[11px] transition-colors"
                style={{
                  backgroundColor: 'var(--clay)',
                  color: '#fff',
                }}
              >
                {closing ? '...' : 'Confirm'}
              </button>
              <button
                onClick={() => setShowConfirmClose(false)}
                className="font-sans text-[11px] px-2 py-1"
                style={{ color: 'var(--ink-muted)' }}
              >
                Cancel
              </button>
            </motion.div>
          )}

          <motion.button
            onClick={handleDownloadReports}
            disabled={downloading || (!closed && members.length === 0)}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-[11px] transition-colors disabled:opacity-30"
            style={{
              backgroundColor: 'rgba(46,76,140,0.1)',
              color: 'var(--cobalt)',
              border: '1px solid rgba(46,76,140,0.2)',
            }}
            whileTap={!(downloading || (!closed && members.length === 0)) ? { scale: 0.96 } : {}}
          >
            <Download size={12} />
            {downloading ? 'Downloading...' : 'Download All Reports'}
          </motion.button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {filteredMembers.length === 0 && members.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Users size={48} style={{ color: 'var(--ink-faint)', opacity: 0.3 }} />
            <span className="font-display text-xl uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
              Waiting for participants
            </span>
            <p className="max-w-md text-center font-sans text-[12px]" style={{ color: 'var(--ink-faint)' }}>
              Share the exam link with participants. Once they join and pass
              calibration, they will appear here with live attention data.
            </p>
          </div>
        ) : filteredMembers.length === 0 && members.length > 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <UserX size={48} style={{ color: 'var(--ink-faint)', opacity: 0.3 }} />
            <span className="font-display text-lg uppercase tracking-[0.1em]" style={{ color: 'var(--ink-muted)' }}>
              No matches
            </span>
            <p className="font-sans text-[12px]" style={{ color: 'var(--ink-faint)' }}>
              No participants match your search or filter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredMembers.map((m) => {
              const stateColor = STATE_COLORS[m.current_state] ?? 'var(--ink-muted)';
              const history = attentionHistory[m.session_id] ?? [];
              return (
                <div
                  key={m.session_id}
                  className="relative rounded-xl p-4 flex flex-col gap-3 overflow-hidden"
                  style={{
                    backgroundColor: 'var(--surface-1)',
                    border: '1px solid var(--hairline)',
                    borderTop: '1px solid var(--edge-highlight)',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                >
                  <div
                    className="absolute left-0 top-0 h-full w-[3px]"
                    style={{ backgroundColor: stateColor, boxShadow: `0 0 8px ${stateColor}` }}
                  />

                  <div className="flex items-center justify-between">
                    <span className="font-sans text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                      {m.display_name}
                    </span>
                    <StatusPill state={m.current_state as StatusState} />
                  </div>

                  <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--ink-faint)' }}>
                    <span className="font-mono tabular-nums">
                      Score: {m.score}
                    </span>
                    <span className="font-mono tabular-nums">
                      {formatDuration(m.elapsed_seconds)}
                    </span>
                    <span className="font-mono tabular-nums">
                      {m.event_count} events
                    </span>
                  </div>

                  {history.length > 1 && (
                    <div className="h-12">
                      <AttentionChart data={history} />
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor: getConnectionStatus(wsRef.current) === 'live'
                          ? 'var(--jade)' : 'var(--ink-faint)',
                      }}
                    />
                    <span className="font-mono text-[9px]" style={{ color: 'var(--ink-faint)' }}>
                      {getConnectionStatus(wsRef.current) === 'live' ? 'Live' : 'Offline'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="px-6 py-2 text-center font-sans text-[10px]"
        style={{ borderTop: '1px solid var(--hairline)', color: 'var(--ink-faint)' }}
      >
        Only attention scores and state are broadcast — no video, image, or landmark data leaves participant devices.
      </div>
    </div>
  );
}
