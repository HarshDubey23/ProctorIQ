import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Users, Wifi, WifiOff, Download, XCircle, AlertTriangle,
  Search, UserX, Stamp
} from "lucide-react";
import { StatusPill, type StatusState } from "../../components/ui/StatusPill";
import { AttentionChart } from "../dashboard/AttentionChart";
import type { AttentionSample } from "../dashboard/useSession";

import { StampedSeal } from "../../components/ui/stamped-seal";

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

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
}

interface HostDashboardProps {
  roomId: string;
}

export function HostDashboard({ roomId }: HostDashboardProps) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [wsStatus, setWsStatus] = useState<"live" | "reconnecting" | "offline">("offline");
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [closing, setClosing] = useState(false);
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [closed, setClosed] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [attentionHistory, setAttentionHistory] = useState<MemberAttentionHistory>({});
  const wsRef = useRef<WebSocket | null>(null);
  const historyRef = useRef<MemberAttentionHistory>({});

  const hostToken = useMemo(() => localStorage.getItem(`host_token_${roomId}`), [roomId]);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/rooms/${roomId}`);
        if (resp.ok) {
          const data = await resp.json();
          setMembers(data.members ?? []);
        }
      } catch { /* noop */ }
    };

    fetchMembers();
    const pollInterval = setInterval(fetchMembers, 5000);

    const wsUrl = API_BASE.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsUrl}/ws/room/${roomId}`);
    wsRef.current = ws;
    setWsStatus("reconnecting");

    ws.onopen = () => setWsStatus("live");
    ws.onclose = () => setWsStatus("offline");
    ws.onerror = () => setWsStatus("offline");

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "room_update") {
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
      clearInterval(pollInterval);
      ws.close();
      wsRef.current = null;
      setWsStatus("offline");
    };
  }, [roomId]);

  const flaggedMembers = useMemo(
    () => members.filter((m) => m.current_state !== "focused"),
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

  const handleCloseExam = useCallback(async () => {
    if (!hostToken) return;
    setClosing(true);
    try {
      const resp = await fetch(`${API_BASE}/api/rooms/${roomId}/close`, {
        method: "POST",
        headers: { "X-Host-Token": hostToken },
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
        headers: { "X-Host-Token": hostToken },
      });
      if (!resp.ok) return;
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cohort-${roomId}-reports.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* noop */ } finally {
      setDownloading(false);
    }
  }, [roomId, hostToken]);

  const lastLiveSeal = useMemo(() => {
    if (members.length === 0) return null;
    const avg = members.reduce((s, m) => s + m.score, 0) / members.length;
    return Math.round(avg) / 100;
  }, [members]);

  return (
    <div className="flex h-full w-full flex-col bg-ink-slate text-paper">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-[3px] border-paper px-6 py-4">
        <div className="flex items-center gap-3">
          <Stamp size={20} className="text-stamp" />
          <div className="flex flex-col">
            <h1 className="font-display text-lg uppercase tracking-[0.08em] text-paper">
              Mission Control
            </h1>
            <span className="font-mono text-xs text-graphite">
              Room: {roomId}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {lastLiveSeal !== null && (
            <StampedSeal confidence={lastLiveSeal} size={44} label="LIVE" />
          )}

          {closed && (
            <span className="chip !border-paper !bg-stamp !text-paper">Closed</span>
          )}

          <div className={`flex items-center gap-1.5 border-[2px] border-paper px-3 py-1 font-mono text-xs ${
            wsStatus === "live" ? "text-ledger" : wsStatus === "reconnecting" ? "text-ochre" : "text-stamp"
          }`}>
            {wsStatus === "live" ? <Wifi size={10} /> : <WifiOff size={10} />}
            {wsStatus === "live" ? `${members.length} connected` : wsStatus}
          </div>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center gap-3 border-b-[3px] border-paper px-6 py-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name..."
            className="w-full border-[3px] border-paper bg-ink px-8 py-1.5 font-body text-xs text-paper outline-none placeholder:text-graphite"
            aria-label="Search participants"
          />
        </div>

        <button
          onClick={() => setShowFlaggedOnly((v) => !v)}
          className={`flex items-center gap-1.5 border-[3px] border-paper px-3 py-1.5 font-label text-label ${
            showFlaggedOnly ? "bg-ochre text-ink" : "bg-ink text-paper"
          }`}
        >
          <AlertTriangle size={12} />
          Flagged ({flaggedMembers.length})
        </button>

        <div className="flex items-center gap-2">
          {!showConfirmClose ? (
            <button
              onClick={() => setShowConfirmClose(true)}
              disabled={closed}
              className="flex items-center gap-1.5 border-[3px] border-paper bg-ink px-3 py-1.5 font-label text-label text-stamp disabled:opacity-40"
            >
              <XCircle size={12} />
              End Exam
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-body text-xs text-stamp">Are you sure?</span>
              <button
                onClick={handleCloseExam}
                disabled={closing}
                className="border-[3px] border-paper bg-stamp px-3 py-1.5 font-label text-label text-paper"
              >
                {closing ? "..." : "Confirm"}
              </button>
              <button
                onClick={() => setShowConfirmClose(false)}
                className="font-body text-xs text-graphite px-2 py-1"
              >
                Cancel
              </button>
            </div>
          )}

          <button
            onClick={handleDownloadReports}
            disabled={downloading || (!closed && members.length === 0)}
            className="flex items-center gap-1.5 border-[3px] border-paper bg-ink px-3 py-1.5 font-label text-label text-paper disabled:opacity-40"
          >
            <Download size={12} />
            {downloading ? "Downloading..." : "Download Reports"}
          </button>
        </div>
      </div>

      {/* MEMBER GRID */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredMembers.length === 0 && members.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Users size={48} className="text-graphite opacity-40" />
            <span className="font-display text-xl uppercase text-graphite">
              Waiting for participants
            </span>
            <p className="max-w-md text-center font-body text-xs text-graphite">
              Share the exam link with participants. Once they join and pass
              calibration, they will appear here with live attention data.
            </p>
          </div>
        ) : filteredMembers.length === 0 && members.length > 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <UserX size={48} className="text-graphite opacity-40" />
            <span className="font-display text-lg uppercase text-graphite">No matches</span>
            <p className="font-body text-xs text-graphite">No participants match your search or filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredMembers.map((m) => {
              const history = attentionHistory[m.session_id] ?? [];
              const isFlagged = m.current_state !== "focused";
              return (
                <div
                  key={m.session_id}
                  className={`flex flex-col gap-3 border-[3px] p-4 ${
                    isFlagged ? "border-stamp shadow-brutal-red" : "border-paper shadow-brutal-paper"
                  } bg-ink`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-body text-sm font-medium text-paper truncate">
                      {m.display_name}
                    </span>
                    <StatusPill state={m.current_state as StatusState} />
                  </div>

                  <StampedSeal
                    confidence={Math.max(0.01, m.score / 100)}
                    violation={m.current_state === "absent" || m.current_state === "multi"}
                    size={80}
                    label="SCORE"
                  />

                  <div className="flex items-center gap-3 text-xs text-graphite">
                    <span className="font-mono">Score: {m.score}</span>
                    <span className="font-mono">{formatDuration(m.elapsed_seconds)}</span>
                    <span className="font-mono">{m.event_count} events</span>
                  </div>

                  {history.length > 1 && (
                    <div className="h-12">
                      <AttentionChart data={history} />
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-1.5 w-1.5"
                      style={{
                        backgroundColor: wsStatus === "live" ? "#2F5D50" : "#6B6E74",
                      }}
                    />
                    <span className="font-mono text-xs text-graphite">
                      {wsStatus === "live" ? "Live" : "Offline"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t-[3px] border-paper px-6 py-2 text-center font-body text-xs text-graphite">
        Only attention scores and state are broadcast — no video, image, or landmark data leaves participant devices.
      </div>
    </div>
  );
}
