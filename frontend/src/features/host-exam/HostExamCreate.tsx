import { useState, useCallback, type FormEvent } from "react";
import { Clock, Users, Stamp, FileText } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";

interface HostExamCreateProps {
  onCreated: (data: { room_id: string; host_token: string; join_url: string }) => void;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export function HostExamCreate({ onCreated }: HostExamCreateProps) {
  const [paperId, setPaperId] = useState("");
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [maxParticipants, setMaxParticipants] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!paperId.trim()) {
      setError("Please enter a paper ID or build a new paper first");
      return;
    }
    setError("");
    setCreating(true);
    try {
      const body: Record<string, unknown> = { paper_id: paperId.trim() };
      if (title.trim()) body.title = title.trim();
      const dur = parseInt(durationMinutes, 10);
      if (!isNaN(dur) && dur > 0) body.duration_minutes = dur;
      const max = parseInt(maxParticipants, 10);
      if (!isNaN(max) && max > 0) body.max_participants = max;

      const resp = await fetch(`${API_BASE}/api/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      localStorage.setItem(`host_token_${data.room_id}`, data.host_token);
      onCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create exam");
    } finally {
      setCreating(false);
    }
  }, [paperId, title, durationMinutes, maxParticipants, onCreated]);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-paper p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Stamp size={22} className="text-stamp" />
            <CardTitle>Host an Exam</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="grid gap-2">
              <span className="font-label text-label text-graphite">
                <FileText size={12} className="inline mr-1" />
                Paper ID
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={paperId}
                  onChange={(e) => setPaperId(e.target.value)}
                  placeholder="p_2026-07-04_..."
                  className="flex-1 border-[3px] border-ink bg-paper-2 px-3 py-2.5 font-body text-sm text-ink outline-none"
                  aria-label="Paper ID"
                />
                <Button
                  type="button"
                  variant="default"
                  onClick={() => window.location.href = "/builder"}
                  className="whitespace-nowrap"
                >
                  Build New
                </Button>
              </div>
            </label>

            <label className="grid gap-2">
              <span className="font-label text-label text-graphite">Exam Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Midterm Physics"
                maxLength={200}
                className="border-[3px] border-ink bg-paper-2 px-3 py-2.5 font-body text-sm text-ink outline-none"
                aria-label="Exam title"
              />
            </label>

            <div className="flex gap-3">
              <label className="grid flex-1 gap-2">
                <span className="font-label text-label text-graphite">
                  <Clock size={12} className="inline mr-1" />
                  Duration (min)
                </span>
                <input
                  type="number"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  min={1}
                  placeholder="From paper"
                  className="border-[3px] border-ink bg-paper-2 px-3 py-2.5 font-mono text-sm text-ink outline-none"
                  aria-label="Duration in minutes"
                />
              </label>
              <label className="grid flex-1 gap-2">
                <span className="font-label text-label text-graphite">
                  <Users size={12} className="inline mr-1" />
                  Max Participants
                </span>
                <input
                  type="number"
                  value={maxParticipants}
                  onChange={(e) => setMaxParticipants(e.target.value)}
                  min={1}
                  placeholder="Unlimited"
                  className="border-[3px] border-ink bg-paper-2 px-3 py-2.5 font-mono text-sm text-ink outline-none"
                  aria-label="Max participants"
                />
              </label>
            </div>

            {error && (
              <div className="border-[3px] border-stamp bg-paper-2 px-3 py-2 font-body text-xs text-stamp" role="alert">
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" disabled={creating || !paperId.trim()} className="w-full">
              {creating ? "Creating..." : "Create Exam"}
            </Button>
          </form>

          <p className="mt-4 text-center font-body text-xs text-graphite">
            You will receive a shareable link and QR code after creation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
