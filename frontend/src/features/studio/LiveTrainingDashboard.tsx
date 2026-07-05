import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, RefreshCw } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "../../components/ui/button";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface QueueStatus {
  status: "idle" | "running";
  unconsumed_clips: number;
  current_run_id: string | null;
  retrain_batch_size: number;
}

interface TrainingEventData {
  run_id: string;
  epoch: number;
  loss: number | null;
  f1: number | null;
  status: "running" | "accepted" | "rejected" | "failed";
}

interface RunEntry {
  version?: string;
  cv_f1?: number | null;
  test_f1?: number | null;
  rejected?: boolean;
  timestamp?: string;
  history?: HistoryPoint[];
}

interface HistoryPoint {
  epoch: number;
  val_loss: number;
  val_acc: number;
}

interface RegistryData {
  runs: RunEntry[];
  latest_run_id: string | null;
  latest_history: HistoryPoint[];
  available: boolean;
}

export function LiveTrainingDashboard() {
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    status: "idle", unconsumed_clips: 0, current_run_id: null, retrain_batch_size: 5,
  });
  const [registry, setRegistry] = useState<RegistryData | null>(null);
  const [liveHistory, setLiveHistory] = useState<HistoryPoint[]>([]);
  const [eventLog, setEventLog] = useState<TrainingEventData[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const [queueRes, regRes] = await Promise.all([
        fetch(`${API_BASE}/api/ml/training-queue-status`),
        fetch(`${API_BASE}/api/ml/training-status`),
      ]);
      if (queueRes.ok) setQueueStatus(await queueRes.json());
      if (regRes.ok) {
        const data: RegistryData = await regRes.json();
        setRegistry(data);
        if (data.latest_history) setLiveHistory(data.latest_history);
      }
    } catch {
      // backend not available
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/ml/training-events`);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data: TrainingEventData = JSON.parse(event.data);
        setEventLog((prev) => [...prev.slice(-49), data]);

        if (data.status === "running" && data.epoch > 0) {
          setLiveHistory((prev) => [
            ...prev,
            { epoch: data.epoch, val_loss: data.loss ?? 0, val_acc: (data.f1 ?? 0) * 100 },
          ]);
        }

        if (data.status === "accepted" || data.status === "rejected" || data.status === "failed") {
          fetchStatus();
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [fetchStatus]);

  const latestEvent = eventLog[eventLog.length - 1];
  const isRunning = queueStatus.status === "running";

  const recentRuns = registry?.runs?.slice(-5).reverse() ?? [];

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4 gap-4">
      <h2 className="font-display text-base uppercase">Live Training</h2>

      {/* Status banner */}
      <div className={`border-[3px] border-ink p-3 ${isRunning ? "bg-stamp/10" : "bg-paper"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Cpu size={20} className={isRunning ? "animate-pulse text-stamp" : "text-graphite"} />
            <div>
              <span className="font-label text-label text-ink">
                {isRunning ? `Training run #${queueStatus.current_run_id} in progress` : "Idle"}
              </span>
              <p className="font-body text-xs text-graphite mt-0.5">
                {isRunning
                  ? `Epoch ${latestEvent?.epoch ?? "—"} · Loss ${latestEvent?.loss?.toFixed(4) ?? "—"} · F1 ${latestEvent?.f1?.toFixed(4) ?? "—"}`
                  : `${queueStatus.unconsumed_clips}/${queueStatus.retrain_batch_size} clips collected, training starts automatically at ${queueStatus.retrain_batch_size}`}
              </p>
            </div>
          </div>
          <Button variant="ghost" onClick={fetchStatus} className="text-xs" aria-label="Refresh">
            <RefreshCw size={12} />
          </Button>
        </div>
      </div>

      {/* Live loss/F1 chart */}
      {liveHistory.length > 1 && (
        <div className="border-[2px] border-ink bg-paper p-3">
          <h3 className="font-label text-label text-graphite mb-2">
            {isRunning ? "Live Progress" : "Latest Run History"}
          </h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={liveHistory}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="epoch" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip />
              <Line type="monotone" dataKey="val_loss" stroke="#9B2D20" name="Loss" dot={false} strokeWidth={2} />
              <Line type="monotone" dataKey="val_acc" stroke="#2F5D50" name="F1 (%)" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent runs */}
      <div className="border-[2px] border-ink bg-paper p-3">
        <h3 className="font-label text-label text-graphite mb-2">Recent Runs</h3>
        {recentRuns.length === 0 ? (
          <p className="font-body text-xs text-graphite">No completed training runs yet.</p>
        ) : (
          <div className="grid gap-2">
            {recentRuns.map((run, i) => (
              <div key={run.version ?? i} className="flex items-center justify-between border-b-[1px] border-ink/20 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-ink">{run.version ?? `#${i + 1}`}</span>
                  {run.rejected && <span className="chip !text-[10px] !border-[1px] border-stamp text-stamp">Rejected</span>}
                </div>
                <div className="flex items-center gap-3 font-mono text-xs text-graphite">
                  <span>CV F1: {run.cv_f1?.toFixed(4) ?? "—"}</span>
                  <span>Test F1: {run.test_f1?.toFixed(4) ?? "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Event log */}
      {eventLog.length > 0 && (
        <details className="border-[2px] border-ink bg-paper">
          <summary className="cursor-pointer px-3 py-2 font-label text-label text-graphite hover:bg-paper-2">
            Live Event Log ({eventLog.length})
          </summary>
          <div className="max-h-40 overflow-y-auto p-2 font-mono text-[10px] text-graphite">
            {eventLog.map((ev, i) => (
              <div key={i} className="py-0.5">
                [{ev.status}] run={ev.run_id.slice(0, 8)} epoch={ev.epoch}
                {ev.loss != null && ` loss=${ev.loss.toFixed(4)}`}
                {ev.f1 != null && ` f1=${ev.f1.toFixed(4)}`}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
