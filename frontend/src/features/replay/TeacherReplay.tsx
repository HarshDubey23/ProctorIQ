import { useState, useMemo } from "react";
import { Play, Pause, SkipBack, SkipForward, Eye } from "lucide-react";
import { Button } from "../../components/ui/button";

interface ReplayEvent {
  timestamp: number;
  type: string;
  score: number;
}

interface TeacherReplayProps {
  studentName: string;
  events: ReplayEvent[];
  totalScore: number;
}

export function TeacherReplay({ studentName, events, totalScore }: TeacherReplayProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const sortedEvents = useMemo(() =>
    [...events].sort((a, b) => a.timestamp - b.timestamp),
    [events]
  );

  const currentEvent = sortedEvents[currentIndex];
  const progress = sortedEvents.length > 0 ? ((currentIndex + 1) / sortedEvents.length) * 100 : 0;

  const handlePlayPause = () => setIsPlaying((p) => !p);
  const handleSkipBack = () => setCurrentIndex(Math.max(0, currentIndex - 10));
  const handleSkipForward = () => setCurrentIndex(Math.min(sortedEvents.length - 1, currentIndex + 10));
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = Math.round((parseInt(e.target.value) / 100) * (sortedEvents.length - 1));
    setCurrentIndex(Math.max(0, Math.min(sortedEvents.length - 1, idx)));
  };

  return (
    <div className="border-[3px] border-ink bg-ink-slate shadow-brutal-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Eye size={18} className="text-signal-gaze" />
          <span className="font-display text-lg uppercase text-paper">Replay: {studentName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip !border-paper !text-paper">Score: {totalScore}</span>
          <span className="font-mono text-xs text-graphite">{sortedEvents.length} events</span>
        </div>
      </div>

      <div className="border-[3px] border-paper bg-ink p-4 mb-4">
        {currentEvent ? (
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="font-label text-label text-signal-gaze uppercase">{currentEvent.type.replace(/_/g, ' ')}</span>
              <span className="font-mono text-sm text-paper">
                {new Date(currentEvent.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="font-mono text-data-lg font-bold text-signal-gaze">
              {Math.round(currentEvent.score)}
            </div>
          </div>
        ) : (
          <span className="font-body text-sm text-graphite">No events recorded</span>
        )}
      </div>

      <div className="mb-4">
        <input type="range" min={0} max={100} value={Math.round(progress)}
          onChange={handleSeek}
          className="w-full h-2 border-[2px] border-paper bg-ink appearance-none cursor-pointer"
          aria-label="Replay timeline"
          style={{ accentColor: "#3E8E7E" }} />
        <div className="flex justify-between font-mono text-[10px] text-graphite mt-1">
          <span>{sortedEvents.length > 0 ? new Date(sortedEvents[0].timestamp).toLocaleTimeString() : "—"}</span>
          <span>{sortedEvents.length > 0 ? new Date(sortedEvents[sortedEvents.length - 1].timestamp).toLocaleTimeString() : "—"}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button variant="ghost" onClick={handleSkipBack} className="!border-paper !text-paper" aria-label="Skip back 10 events">
          <SkipBack size={16} />
        </Button>
        <Button variant="primary" onClick={handlePlayPause} className="px-8" aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <Button variant="ghost" onClick={handleSkipForward} className="!border-paper !text-paper" aria-label="Skip forward 10 events">
          <SkipForward size={16} />
        </Button>
      </div>

      <div className="mt-4 border-t-[2px] border-paper/30 pt-3">
        <span className="font-label text-label text-graphite mb-2 block">Event Timeline</span>
        <div className="max-h-32 overflow-y-auto grid gap-1">
          {sortedEvents.map((e, i) => (
            <div key={i}
              className={`flex items-center justify-between px-2 py-0.5 cursor-pointer border-l-[3px] ${
                i === currentIndex ? 'border-signal-gaze bg-ink/50' : 'border-transparent hover:bg-ink/30'
              }`}
              onClick={() => setCurrentIndex(i)}>
              <span className="font-body text-xs text-paper capitalize">{e.type.replace(/_/g, ' ')}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-graphite">{new Date(e.timestamp).toLocaleTimeString()}</span>
                <span className="font-mono text-[10px] text-signal-gaze">{Math.round(e.score)}</span>
              </div>
            </div>
          ))}
          {sortedEvents.length === 0 && (
            <span className="font-body text-xs text-graphite italic">No events</span>
          )}
        </div>
      </div>
    </div>
  );
}
