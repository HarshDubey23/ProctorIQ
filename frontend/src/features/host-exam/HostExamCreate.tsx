import { useState, useCallback, useEffect, type FormEvent } from "react";
import { Clock, Users, Stamp, FileText } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { API_BASE, createLiveRoom, getHostAccount } from "../../lib/api";

interface HostExamCreateProps {
  onCreated: (data: { room_id: string; host_token: string; join_url: string }) => void;
}

interface PaperSummary {
  id: string;
  title: string;
  subject: string;
  duration_minutes: number;
  questions: unknown[];
}

const inputCls = "border-[3px] border-ink bg-paper-2 px-3 py-2.5 font-body text-sm text-ink outline-none";

export function HostExamCreate({ onCreated }: HostExamCreateProps) {
  const [papers, setPapers] = useState<PaperSummary[] | null>(null);
  const [paperId, setPaperId] = useState(() => sessionStorage.getItem("paper_id") ?? "");
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const account = getHostAccount();
    if (!account) {
      setPapers([]);
      return;
    }
    fetch(`${API_BASE}/api/papers`, { headers: { "X-Host-Token": account.host_token } })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: PaperSummary[]) => {
        setPapers(list);
        setPaperId((current) => current || list[list.length - 1]?.id || "");
      })
      .catch(() => setPapers([]));
  }, []);

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!paperId) return;
    setError("");
    setCreating(true);
    try {
      const dur = parseInt(durationMinutes, 10);
      const max = parseInt(maxParticipants, 10);
      onCreated(await createLiveRoom(paperId, {
        ...(title.trim() ? { title: title.trim() } : {}),
        ...(dur > 0 ? { duration_minutes: dur } : {}),
        ...(max > 0 ? { max_participants: max } : {}),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create exam");
    } finally {
      setCreating(false);
    }
  }, [paperId, title, durationMinutes, maxParticipants, onCreated]);

  const selected = papers?.find((p) => p.id === paperId);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-paper p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Stamp size={22} className="text-stamp" />
            <CardTitle>Start a live exam</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {papers !== null && papers.length === 0 ? (
            <div className="flex flex-col gap-4">
              <p className="font-body text-sm text-graphite">
                You haven't created a question paper in this browser yet. Build one first — MCQ, true/false,
                numerical, short answer, paragraph and code questions are all supported.
              </p>
              <Button variant="primary" onClick={() => (window.location.href = "/builder")}>Build a paper</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <label className="grid gap-2">
                <span className="font-label text-label text-graphite">
                  <FileText size={12} className="inline mr-1" />
                  Question paper
                </span>
                <div className="flex gap-2">
                  <select
                    value={paperId}
                    onChange={(e) => setPaperId(e.target.value)}
                    className={`${inputCls} flex-1 min-w-0`}
                    aria-label="Question paper"
                    disabled={papers === null}
                  >
                    {papers === null && <option>Loading…</option>}
                    {papers?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} · {p.questions.length} Q · {p.duration_minutes} min
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="default" onClick={() => (window.location.href = "/builder")} className="whitespace-nowrap">
                    New
                  </Button>
                </div>
              </label>

              <label className="grid gap-2">
                <span className="font-label text-label text-graphite">Exam title (optional)</span>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder={selected?.title ?? "e.g. Midterm Physics"} maxLength={200} className={inputCls} aria-label="Exam title" />
              </label>

              <div className="flex gap-3">
                <label className="grid flex-1 gap-2">
                  <span className="font-label text-label text-graphite"><Clock size={12} className="inline mr-1" />Duration (min)</span>
                  <input type="number" value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} min={1}
                    placeholder={selected ? String(selected.duration_minutes) : "From paper"} className={`${inputCls} font-mono`} aria-label="Duration in minutes" />
                </label>
                <label className="grid flex-1 gap-2">
                  <span className="font-label text-label text-graphite"><Users size={12} className="inline mr-1" />Max students</span>
                  <input type="number" value={maxParticipants} onChange={(e) => setMaxParticipants(e.target.value)} min={1}
                    placeholder="Unlimited" className={`${inputCls} font-mono`} aria-label="Max participants" />
                </label>
              </div>

              <p className="font-body text-xs text-graphite">
                The exam window opens now and closes automatically after the duration. Students who join late get
                the remaining time.
              </p>

              {error && (
                <div className="border-[3px] border-stamp bg-paper-2 px-3 py-2 font-body text-xs text-stamp" role="alert">{error}</div>
              )}

              <Button type="submit" variant="primary" disabled={creating || !paperId} className="w-full">
                {creating ? "Starting…" : "Go live"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
