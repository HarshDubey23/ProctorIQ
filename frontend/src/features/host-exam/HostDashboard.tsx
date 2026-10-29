import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Users, Wifi, WifiOff, Download, XCircle, AlertTriangle, Search, UserX, Stamp,
  Copy, Check, QrCode, MessageSquareWarning, Ban, RefreshCw, ListChecks, Activity,
} from "lucide-react";
import { StatusPill, type StatusState } from "../../components/ui/StatusPill";
import { API_BASE, wsBase } from "../../lib/api";

interface RoomMember {
  session_id: string;
  display_name: string;
  score: number;
  current_state: string;
  elapsed_seconds: number;
  event_count: number;
  status: string;
  answered: number;
  flags: Record<string, number>;
  warnings: number;
  last_seen: string | null;
}

interface RoomInfo {
  title: string;
  status: string;
  duration_minutes: number | null;
  created_at: string;
  closed_at: string | null;
}

interface ResultAnswer {
  question_id: string;
  answer: string | null;
  awarded: number | null;
  max_marks: number;
  result: "correct" | "wrong" | "blank" | "pending" | "graded";
}

interface StudentResult {
  session_id: string;
  display_name: string;
  status: string;
  marks?: number | null;
  max_marks?: number | null;
  percent?: number | null;
  pending_manual?: number;
  verdict?: string | null;
  flags: Record<string, number>;
  answers: ResultAnswer[];
}

interface ResultsPayload {
  questions: { id: string; title: string; type: string; marks: number; correct_answer: string | null }[];
  students: StudentResult[];
}

const FLAG_LABELS: Record<string, string> = {
  tab_switch: "Tab switch",
  window_blur: "Left window",
  fullscreen_exit: "Left fullscreen",
  copy_paste: "Copy/paste",
  devtools: "DevTools",
  multi: "Multiple faces",
  multi_face: "Multiple faces",
  absent: "Face missing",
  distracted: "Looking away",
  drowsy: "Drowsy",
  camera_off: "Camera off",
  multiple_connections: "Opened twice",
};

const STATUS_STYLE: Record<string, string> = {
  joined: "text-graphite",
  in_progress: "text-ledger",
  disconnected: "text-ochre",
  submitted: "text-paper",
  terminated: "text-stamp",
};

function formatDuration(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function flagTotal(flags: Record<string, number>): number {
  return Object.entries(flags).reduce((n, [k, v]) => n + (k === "window_blur" ? 0 : v), 0);
}

export function HostDashboard({ roomId }: { roomId: string }) {
  const [hostToken, setHostToken] = useState(() => localStorage.getItem(`host_token_${roomId}`));
  const [tokenInput, setTokenInput] = useState("");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [questionCount, setQuestionCount] = useState(0);
  const [wsStatus, setWsStatus] = useState<"live" | "reconnecting" | "offline">("offline");
  const [authError, setAuthError] = useState(false);
  const [tab, setTab] = useState<"live" | "results">("live");
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showConfirmClose, setShowConfirmClose] = useState(false);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [notice, setNotice] = useState("");

  const joinUrl = `${window.location.origin}/join/${roomId}`;
  const headers = useMemo(() => ({ "X-Host-Token": hostToken ?? "", "Content-Type": "application/json" }), [hostToken]);

  const applyRoom = useCallback((data: RoomInfo & { members?: RoomMember[] }) => {
    setRoom({ title: data.title, status: data.status, duration_minutes: data.duration_minutes,
      created_at: data.created_at, closed_at: data.closed_at });
    setMembers(data.members ?? []);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!hostToken) return;
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const fetchRoom = async () => {
      const resp = await fetch(`${API_BASE}/api/rooms/${roomId}`, { headers: { "X-Host-Token": hostToken } }).catch(() => null);
      if (cancelled || !resp) return;
      if (resp.status === 403) {
        setAuthError(true);
        return;
      }
      if (resp.ok) applyRoom(await resp.json());
    };
    fetch(`${API_BASE}/api/rooms/${roomId}/paper`, { headers: { "X-Host-Token": hostToken } })
      .then((r) => (r.ok ? r.json() : null))
      .then((p) => p && !cancelled && setQuestionCount(p.questions.length))
      .catch(() => {});

    const open = () => {
      setWsStatus("reconnecting");
      ws = new WebSocket(`${wsBase()}/ws/room/${roomId}?host_token=${encodeURIComponent(hostToken)}`);
      ws.onopen = () => {
        attempts = 0;
        setWsStatus("live");
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === "room_update") applyRoom(msg);
        } catch { /* ignore malformed frames */ }
      };
      ws.onclose = (ev) => {
        setWsStatus("offline");
        if (cancelled) return;
        if (ev.code === 4401) {
          setAuthError(true);
          return;
        }
        retry = setTimeout(open, Math.min(30_000, 1000 * 2 ** attempts++));
      };
    };

    void fetchRoom();
    open();
    const poll = setInterval(fetchRoom, 15_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [roomId, hostToken, applyRoom]);

  const closed = room?.status === "closed";
  const windowEndsAt = room?.duration_minutes ? Date.parse(room.created_at) + room.duration_minutes * 60_000 : null;
  const windowLeft = windowEndsAt && !closed ? Math.max(0, Math.round((windowEndsAt - now) / 1000)) : null;

  const counts = useMemo(() => {
    const c = { in_progress: 0, submitted: 0, flagged: 0 };
    for (const m of members) {
      if (m.status === "in_progress") c.in_progress++;
      if (m.status === "submitted" || m.status === "terminated") c.submitted++;
      if (flagTotal(m.flags) > 0) c.flagged++;
    }
    return c;
  }, [members]);

  const filteredMembers = useMemo(() => {
    let list = showFlaggedOnly ? members.filter((m) => flagTotal(m.flags) > 0 || (m.status === "in_progress" && m.current_state !== "focused")) : members;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((m) => m.display_name.toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => flagTotal(b.flags) - flagTotal(a.flags) || a.display_name.localeCompare(b.display_name));
  }, [members, showFlaggedOnly, searchQuery]);

  const hostAction = useCallback(async (path: string, body: unknown, label: string) => {
    setBusy(label);
    try {
      const resp = await fetch(`${API_BASE}/api/rooms/${roomId}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
      if (!resp.ok) {
        const detail = await resp.json().catch(() => null);
        setNotice(detail?.detail ?? `Action failed (HTTP ${resp.status})`);
        return null;
      }
      return await resp.json();
    } catch {
      setNotice("Could not reach the server.");
      return null;
    } finally {
      setBusy("");
    }
  }, [roomId, headers]);

  const warn = async (m: RoomMember) => {
    const message = window.prompt(`Warning for ${m.display_name}:`, "Please keep your eyes on the screen and stay in the exam window.");
    if (!message?.trim()) return;
    const r = await hostAction(`/members/${m.session_id}/warn`, { message: message.trim() }, `warn-${m.session_id}`);
    if (r) setNotice(r.delivered ? `Warning shown to ${m.display_name}.` : `${m.display_name} is offline; warning recorded.`);
  };

  const terminate = async (m: RoomMember) => {
    if (!window.confirm(`End ${m.display_name}'s exam now? Their saved answers will be graded and they can't continue.`)) return;
    const r = await hostAction(`/members/${m.session_id}/terminate`, { reason: "Your teacher ended your attempt." }, `term-${m.session_id}`);
    if (r) setNotice(`${m.display_name}'s attempt was ended.`);
  };

  const closeExam = async () => {
    if (await hostAction("/close", {}, "close")) {
      setShowConfirmClose(false);
      setNotice("Exam ended. Students still writing were submitted automatically.");
    }
  };

  const downloadReports = async () => {
    setBusy("download");
    try {
      const resp = await fetch(`${API_BASE}/api/rooms/${roomId}/reports?format=zip`, { headers: { "X-Host-Token": hostToken ?? "" } });
      if (!resp.ok) return;
      const url = URL.createObjectURL(await resp.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `exam-${roomId}-reports.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setBusy("");
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked */ }
  };

  if (!hostToken || authError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-ink-slate p-6 text-paper">
        <form
          className="flex w-full max-w-md flex-col gap-3 border-[3px] border-paper p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!tokenInput.trim()) return;
            localStorage.setItem(`host_token_${roomId}`, tokenInput.trim());
            setAuthError(false);
            setHostToken(tokenInput.trim());
          }}
        >
          <span className="font-display text-lg uppercase">Host access for {roomId}</span>
          <p className="font-body text-xs text-graphite">
            {authError ? "That host key isn't valid for this exam." : "This exam was started from another browser."} Paste
            the host key shown when the exam was created.
          </p>
          <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} aria-label="Host key"
            className="border-[3px] border-paper bg-ink px-3 py-2 font-mono text-xs text-paper outline-none" />
          <button type="submit" className="border-[3px] border-paper bg-paper px-3 py-2 font-label text-label text-ink">Open dashboard</button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-ink-slate text-paper">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b-[3px] border-paper px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
          <Stamp size={20} className="shrink-0 text-stamp" />
          <div className="flex min-w-0 flex-col">
            <h1 className="truncate font-display text-lg uppercase tracking-[0.08em] text-paper">{room?.title || "Live exam"}</h1>
            <span className="font-mono text-xs text-graphite">
              {closed ? "Ended" : windowLeft != null ? `Closes in ${formatDuration(windowLeft)}` : "Open"}
              {" · "}{counts.in_progress} writing · {counts.submitted} submitted · {members.length} joined
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 border-[3px] border-paper px-3 py-1.5">
            <span className="font-label text-label text-graphite">Code</span>
            <span className="font-mono text-xl tracking-[0.2em] text-paper select-all">{roomId}</span>
          </div>
          <button onClick={copyLink} className="flex items-center gap-1.5 border-[3px] border-paper bg-ink px-3 py-2 font-label text-label" aria-label="Copy join link">
            {copied ? <Check size={12} className="text-ledger" /> : <Copy size={12} />} {copied ? "Copied" : "Link"}
          </button>
          <button onClick={() => setShowQr((v) => !v)} className="flex items-center gap-1.5 border-[3px] border-paper bg-ink px-3 py-2 font-label text-label" aria-expanded={showQr}>
            <QrCode size={12} /> QR
          </button>
          <div className={`flex items-center gap-1.5 border-[2px] border-paper px-3 py-1 font-mono text-xs ${
            wsStatus === "live" ? "text-ledger" : wsStatus === "reconnecting" ? "text-ochre" : "text-stamp"
          }`}>
            {wsStatus === "live" ? <Wifi size={10} /> : <WifiOff size={10} />} {wsStatus}
          </div>
        </div>
      </div>

      {showQr && (
        <div className="flex flex-wrap items-center gap-6 border-b-[3px] border-paper bg-paper px-6 py-4 text-ink">
          <QRCodeSVG value={joinUrl} size={140} level="M" fgColor="#1A1A17" bgColor="transparent" />
          <div className="flex flex-col gap-1 font-body text-sm">
            <span>Students scan this, open <span className="font-mono">{joinUrl}</span>,</span>
            <span>or go to <span className="font-mono">{window.location.origin}/join</span> and type <strong className="font-mono">{roomId}</strong>.</span>
            <span className="font-mono text-[10px] text-graphite break-all">Host key (to open this dashboard elsewhere): {hostToken}</span>
          </div>
        </div>
      )}

      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center gap-3 border-b-[3px] border-paper px-6 py-3">
        <div className="flex border-[3px] border-paper">
          <button onClick={() => setTab("live")} className={`flex items-center gap-1.5 px-3 py-1.5 font-label text-label ${tab === "live" ? "bg-paper text-ink" : "text-paper"}`}>
            <Activity size={12} /> Live
          </button>
          <button onClick={() => setTab("results")} className={`flex items-center gap-1.5 px-3 py-1.5 font-label text-label ${tab === "results" ? "bg-paper text-ink" : "text-paper"}`}>
            <ListChecks size={12} /> Results & grading
          </button>
        </div>

        {tab === "live" && (
          <>
            <div className="relative min-w-[180px] flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-graphite" />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by name..."
                className="w-full border-[3px] border-paper bg-ink px-8 py-1.5 font-body text-xs text-paper outline-none placeholder:text-graphite" aria-label="Search participants" />
            </div>
            <button onClick={() => setShowFlaggedOnly((v) => !v)}
              className={`flex items-center gap-1.5 border-[3px] border-paper px-3 py-1.5 font-label text-label ${showFlaggedOnly ? "bg-ochre text-ink" : "bg-ink text-paper"}`}>
              <AlertTriangle size={12} /> Flagged ({counts.flagged})
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!showConfirmClose ? (
            <button onClick={() => setShowConfirmClose(true)} disabled={closed}
              className="flex items-center gap-1.5 border-[3px] border-paper bg-ink px-3 py-1.5 font-label text-label text-stamp disabled:opacity-40">
              <XCircle size={12} /> End exam
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="font-body text-xs text-stamp">Submit everyone and close?</span>
              <button onClick={closeExam} disabled={busy === "close"} className="border-[3px] border-paper bg-stamp px-3 py-1.5 font-label text-label text-paper">
                {busy === "close" ? "..." : "Confirm"}
              </button>
              <button onClick={() => setShowConfirmClose(false)} className="px-2 py-1 font-body text-xs text-graphite">Cancel</button>
            </div>
          )}
          <button onClick={downloadReports} disabled={busy === "download" || members.length === 0}
            className="flex items-center gap-1.5 border-[3px] border-paper bg-ink px-3 py-1.5 font-label text-label text-paper disabled:opacity-40">
            <Download size={12} /> {busy === "download" ? "Preparing…" : "Reports"}
          </button>
        </div>
      </div>

      {notice && (
        <div className="flex items-center justify-between border-b-[2px] border-paper bg-ink px-6 py-2 font-body text-xs text-paper" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} className="text-graphite" aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-6">
        {tab === "results" ? (
          <ResultsPanel roomId={roomId} hostToken={hostToken} />
        ) : members.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <Users size={48} className="text-graphite opacity-40" />
            <span className="font-display text-xl uppercase text-graphite">Waiting for students</span>
            <p className="max-w-md text-center font-body text-xs text-graphite">
              Share the code <span className="font-mono text-paper">{roomId}</span> or the link. Students appear here as soon as they join.
            </p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <UserX size={48} className="text-graphite opacity-40" />
            <span className="font-display text-lg uppercase text-graphite">No matches</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredMembers.map((m) => {
              const total = flagTotal(m.flags);
              const live = m.status === "in_progress";
              const alert = total > 0 || (live && m.current_state !== "focused");
              return (
                <div key={m.session_id} className={`flex flex-col gap-3 border-[3px] bg-ink p-4 ${alert ? "border-stamp shadow-brutal-red" : "border-paper shadow-brutal-paper"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-body text-sm font-medium text-paper">{m.display_name}</span>
                    {live ? <StatusPill state={m.current_state as StatusState} /> : (
                      <span className={`font-label text-label uppercase ${STATUS_STYLE[m.status] ?? "text-graphite"}`}>{m.status.replace("_", " ")}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="font-mono text-base text-paper">{live ? m.score : "--"}</div>
                      <div className="font-label text-[9px] text-graphite">Attention</div>
                    </div>
                    <div>
                      <div className="font-mono text-base text-paper">{m.answered}{questionCount ? `/${questionCount}` : ""}</div>
                      <div className="font-label text-[9px] text-graphite">Answered</div>
                    </div>
                    <div>
                      <div className="font-mono text-base text-paper">{formatDuration(m.elapsed_seconds)}</div>
                      <div className="font-label text-[9px] text-graphite">Elapsed</div>
                    </div>
                  </div>

                  {questionCount > 0 && (
                    <div className="h-1.5 border border-paper">
                      <div className="h-full bg-ledger" style={{ width: `${Math.min(100, (m.answered / questionCount) * 100)}%` }} />
                    </div>
                  )}

                  <div className="flex min-h-[22px] flex-wrap gap-1">
                    {Object.entries(m.flags).filter(([, v]) => v > 0).map(([k, v]) => (
                      <span key={k} className={`border px-1.5 py-0.5 font-mono text-[10px] ${k === "window_blur" ? "border-graphite text-graphite" : "border-stamp text-stamp"}`}>
                        {FLAG_LABELS[k] ?? k} ×{v}
                      </span>
                    ))}
                    {m.warnings > 0 && <span className="border border-ochre px-1.5 py-0.5 font-mono text-[10px] text-ochre">Warned ×{m.warnings}</span>}
                    {total === 0 && m.warnings === 0 && <span className="font-mono text-[10px] text-graphite">No flags</span>}
                  </div>

                  {(live || m.status === "disconnected") && !closed && (
                    <div className="flex gap-2">
                      <button onClick={() => void warn(m)} disabled={!!busy}
                        className="flex flex-1 items-center justify-center gap-1 border-[2px] border-ochre px-2 py-1 font-label text-[10px] text-ochre disabled:opacity-40">
                        <MessageSquareWarning size={11} /> Warn
                      </button>
                      <button onClick={() => void terminate(m)} disabled={!!busy}
                        className="flex flex-1 items-center justify-center gap-1 border-[2px] border-stamp px-2 py-1 font-label text-[10px] text-stamp disabled:opacity-40">
                        <Ban size={11} /> End attempt
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t-[3px] border-paper px-6 py-2 text-center font-body text-xs text-graphite">
        Only attention signals and integrity events are sent — no video or images leave students' devices.
      </div>
    </div>
  );
}

function ResultsPanel({ roomId, hostToken }: { roomId: string; hostToken: string }) {
  const [data, setData] = useState<ResultsPayload | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const loadingRef = useRef(false);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    try {
      const resp = await fetch(`${API_BASE}/api/rooms/${roomId}/results`, { headers: { "X-Host-Token": hostToken } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      setData(await resp.json());
      setError("");
    } catch {
      setError("Could not load results.");
    } finally {
      loadingRef.current = false;
    }
  }, [roomId, hostToken]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveGrade = async (sessionId: string, questionId: string, max: number) => {
    const key = `${sessionId}:${questionId}`;
    const marks = Number(drafts[key]);
    if (!Number.isFinite(marks) || marks < 0 || marks > max) {
      setError(`Marks must be between 0 and ${max}.`);
      return;
    }
    const resp = await fetch(`${API_BASE}/api/rooms/${roomId}/members/${sessionId}/grade`, {
      method: "POST",
      headers: { "X-Host-Token": hostToken, "Content-Type": "application/json" },
      body: JSON.stringify({ question_id: questionId, marks }),
    });
    if (!resp.ok) {
      const detail = await resp.json().catch(() => null);
      setError(detail?.detail ?? "Could not save the grade.");
      return;
    }
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
    await load();
  };

  if (!data) return <div className="font-body text-sm text-graphite">{error || "Loading results…"}</div>;
  const qById = Object.fromEntries(data.questions.map((q) => [q.id, q]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-body text-xs text-graphite">
          Objective questions are graded automatically. Written and code answers wait for your marks.
        </span>
        <button onClick={() => void load()} className="flex items-center gap-1 border-[2px] border-paper px-2 py-1 font-label text-[10px]">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>
      {error && <div className="font-body text-xs text-stamp" role="alert">{error}</div>}
      {data.students.length === 0 && <div className="font-body text-sm text-graphite">No students yet.</div>}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-body text-xs">
          <thead>
            <tr className="border-b-[3px] border-paper text-left font-label text-[10px] uppercase text-graphite">
              <th className="py-2 pr-3">Student</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Marks</th>
              <th className="py-2 pr-3">%</th><th className="py-2 pr-3">To grade</th><th className="py-2 pr-3">Integrity</th><th className="py-2 pr-3">Flags</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => (
              <tr key={s.session_id} className="cursor-pointer border-b border-graphite hover:bg-ink" onClick={() => setOpen(open === s.session_id ? null : s.session_id)}>
                <td className="py-2 pr-3 text-paper">{s.display_name}</td>
                <td className={`py-2 pr-3 uppercase ${STATUS_STYLE[s.status] ?? ""}`}>{s.status.replace("_", " ")}</td>
                <td className="py-2 pr-3 font-mono">{s.marks != null ? `${s.marks} / ${s.max_marks}` : "--"}</td>
                <td className="py-2 pr-3 font-mono">{s.percent ?? "--"}</td>
                <td className={`py-2 pr-3 font-mono ${s.pending_manual ? "text-ochre" : ""}`}>{s.pending_manual ?? 0}</td>
                <td className="py-2 pr-3 font-mono">{s.verdict ?? "--"}</td>
                <td className="py-2 pr-3 font-mono">{flagTotal(s.flags)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.students.filter((s) => s.session_id === open).map((s) => (
        <div key={s.session_id} className="flex flex-col gap-3 border-[3px] border-paper p-4">
          <span className="font-display text-sm uppercase">{s.display_name}'s answers</span>
          {s.answers.map((a, i) => {
            const q = qById[a.question_id];
            const key = `${s.session_id}:${a.question_id}`;
            const gradable = s.status !== "in_progress" && a.result !== "blank";
            return (
              <div key={a.question_id} className="border-b border-graphite pb-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-paper">{i + 1}. {q?.title}</span>
                  <span className={`shrink-0 font-mono ${a.result === "correct" ? "text-ledger" : a.result === "wrong" ? "text-stamp" : a.result === "pending" ? "text-ochre" : "text-graphite"}`}>
                    {a.awarded == null ? "pending" : a.awarded} / {a.max_marks}
                  </span>
                </div>
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] text-graphite">{a.answer ?? "(no answer)"}</pre>
                {q?.correct_answer && <div className="mt-1 font-mono text-[10px] text-ledger">Key: {q.correct_answer}</div>}
                {gradable && (
                  <div className="mt-2 flex items-center gap-2">
                    <input type="number" min={0} max={a.max_marks} step={0.5} placeholder={a.awarded == null ? "marks" : String(a.awarded)}
                      value={drafts[key] ?? ""} onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
                      aria-label={`Marks for question ${i + 1}`}
                      className="w-20 border-[2px] border-paper bg-ink px-2 py-1 font-mono text-xs text-paper outline-none" />
                    <button onClick={() => void saveGrade(s.session_id, a.question_id, a.max_marks)} disabled={drafts[key] == null || drafts[key] === ""}
                      className="border-[2px] border-paper px-2 py-1 font-label text-[10px] disabled:opacity-40">
                      {a.result === "pending" ? "Save grade" : "Override"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
