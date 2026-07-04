import { useState, useCallback } from "react";
import { Clock, Users, Plus, Trash2, Save, Stamp } from "lucide-react";
import { Button } from "../../components/ui/button";

interface Accommodation {
  id: string;
  studentName: string;
  extendedTimeMinutes: number;
  relaxedProctoring: boolean;
  notes: string;
}

export function AccommodationProfiles() {
  const [profiles, setProfiles] = useState<Accommodation[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [newProfile, setNewProfile] = useState<Accommodation>({
    id: "", studentName: "", extendedTimeMinutes: 0, relaxedProctoring: false, notes: "",
  });

  const handleAdd = useCallback(() => {
    if (!newProfile.studentName.trim()) return;
    const profile: Accommodation = {
      ...newProfile,
      id: `acc_${Date.now()}`,
    };
    setProfiles((prev) => [...prev, profile]);
    setNewProfile({ id: "", studentName: "", extendedTimeMinutes: 0, relaxedProctoring: false, notes: "" });
    setShowForm(false);
  }, [newProfile]);

  const handleRemove = useCallback((id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
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

      {profiles.length === 0 ? (
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
      <p className="font-body text-[10px] text-graphite mt-3">PLACEHOLDER: Profiles are stored in-memory. Replace with API-backed storage.</p>
    </div>
  );
}
