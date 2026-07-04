import { useState, useCallback, useEffect } from "react";
import { Clock, Users, Plus, Trash2, Save, Stamp } from "lucide-react";
import { Button } from "../../components/ui/button";

interface Accommodation {
  id: string;
  studentName: string;
  extendedTimeMinutes: number;
  relaxedProctoring: boolean;
  notes: string;
}

interface ApiAccommodation {
  id: string;
  student_name: string;
  extended_time_minutes: number;
  relaxed_proctoring: boolean;
  notes: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function fromApi(profile: ApiAccommodation): Accommodation {
  return {
    id: profile.id,
    studentName: profile.student_name,
    extendedTimeMinutes: profile.extended_time_minutes,
    relaxedProctoring: profile.relaxed_proctoring,
    notes: profile.notes,
  };
}

export function AccommodationProfiles() {
  const [profiles, setProfiles] = useState<Accommodation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newProfile, setNewProfile] = useState<Accommodation>({
    id: "", studentName: "", extendedTimeMinutes: 0, relaxedProctoring: false, notes: "",
  });

  useEffect(() => {
    fetch(`${API_BASE}/api/accommodations`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load accommodations");
        return res.json();
      })
      .then((data: ApiAccommodation[]) => {
        setProfiles(data.map(fromApi));
        setError("");
      })
      .catch(() => setError("Could not load accommodation profiles"))
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = useCallback(async () => {
    if (!newProfile.studentName.trim()) return;
    try {
      const res = await fetch(`${API_BASE}/api/accommodations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_name: newProfile.studentName,
          extended_time_minutes: newProfile.extendedTimeMinutes,
          relaxed_proctoring: newProfile.relaxedProctoring,
          notes: newProfile.notes,
        }),
      });
      if (!res.ok) throw new Error("Failed to save accommodation");
      const saved: ApiAccommodation = await res.json();
      setProfiles((prev) => [...prev, fromApi(saved)]);
      setNewProfile({ id: "", studentName: "", extendedTimeMinutes: 0, relaxedProctoring: false, notes: "" });
      setShowForm(false);
      setError("");
    } catch {
      setError("Could not save accommodation profile");
    }
  }, [newProfile]);

  const handleRemove = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/accommodations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete accommodation");
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      setError("");
    } catch {
      setError("Could not remove accommodation profile");
    }
  }, []);

  return (
    <div className="border-[3px] border-ink bg-paper shadow-brutal p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Stamp size={18} className="text-stamp" />
          <span className="font-display text-lg uppercase text-ink">Accommodation Profiles</span>
        </div>
        <Button variant={showForm ? "ghost" : "primary"} onClick={() => setShowForm((p) => !p)} className="text-xs">
          <Plus size={14} /> {showForm ? "Cancel" : "Add Profile"}
        </Button>
      </div>

      {error && <p className="font-body text-xs text-red-600 mb-3">{error}</p>}

      {showForm && (
        <div className="border-[3px] border-ink bg-paper-2 p-4 mb-4 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="font-label text-label text-graphite">Student Name</label>
              <input type="text" value={newProfile.studentName} onChange={(e) => setNewProfile((p) => ({ ...p, studentName: e.target.value }))}
                placeholder="e.g. Jane Doe" aria-label="Student name"
                className="border-[2px] border-ink bg-paper px-2 py-1.5 font-body text-sm text-ink outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="font-label text-label text-graphite">Extended Time (min)</label>
              <input type="number" value={newProfile.extendedTimeMinutes} onChange={(e) => setNewProfile((p) => ({ ...p, extendedTimeMinutes: parseInt(e.target.value) || 0 }))}
                min={0} max={120} aria-label="Extended time in minutes"
                className="border-[2px] border-ink bg-paper px-2 py-1.5 font-mono text-sm text-ink outline-none" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={newProfile.relaxedProctoring} onChange={() => setNewProfile((p) => ({ ...p, relaxedProctoring: !p.relaxedProctoring }))}
              className="border-[2px] border-ink" />
            <span className="font-body text-sm text-ink">Relaxed proctoring (reduced flag sensitivity)</span>
          </label>
          <div className="flex flex-col gap-1">
            <label className="font-label text-label text-graphite">Notes</label>
            <textarea value={newProfile.notes} onChange={(e) => setNewProfile((p) => ({ ...p, notes: e.target.value }))}
              rows={2} placeholder="e.g. Medical condition, approved accommodation" aria-label="Notes"
              className="border-[2px] border-ink bg-paper px-2 py-1.5 font-body text-xs text-ink outline-none resize-none" />
          </div>
          <Button variant="primary" onClick={handleAdd} disabled={!newProfile.studentName.trim()}>
            <Save size={14} /> Save Profile
          </Button>
        </div>
      )}

      {loading ? (
        <div className="border-[2px] border-ink bg-paper-2 p-6 text-center">
          <p className="font-body text-sm text-graphite">Loading accommodation profiles...</p>
        </div>
      ) : profiles.length === 0 ? (
        <div className="border-[2px] border-ink bg-paper-2 p-6 text-center">
          <Users size={24} className="text-graphite/40 mx-auto mb-2" />
          <p className="font-body text-sm text-graphite">No accommodation profiles yet.</p>
          <p className="font-body text-xs text-graphite mt-1">Add profiles for students who need extra time or relaxed monitoring.</p>
        </div>
      ) : (
        <div className="grid gap-2">
          {profiles.map((p) => (
            <div key={p.id} className="border-[2px] border-ink bg-paper-2 p-3 flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-body text-sm font-medium text-ink">{p.studentName}</span>
                  {p.extendedTimeMinutes > 0 && (
                    <span className="chip !text-[10px] !border-[1px] flex items-center gap-1">
                      <Clock size={10} /> +{p.extendedTimeMinutes}min
                    </span>
                  )}
                  {p.relaxedProctoring && <span className="chip !text-[10px] !border-[1px]">Relaxed</span>}
                </div>
                {p.notes && <p className="font-body text-xs text-graphite mt-1">{p.notes}</p>}
              </div>
              <button onClick={() => handleRemove(p.id)}
                className="border-[2px] border-ink p-1.5 text-stamp hover:bg-stamp hover:text-paper ml-2"
                aria-label={`Remove accommodation for ${p.studentName}`}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
