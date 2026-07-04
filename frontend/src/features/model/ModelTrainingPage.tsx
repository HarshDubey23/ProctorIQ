import { useState, useEffect } from "react";
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from "recharts";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface HistoryEntry {
  epoch: number;
  train_loss: number;
  val_loss: number;
  train_acc: number;
  val_acc: number;
}

interface TrainingRun {
  run_id: string;
  cv_f1: number | null;
  test_f1: number | null;
  epochs: number;
  accuracy: number | null;
  timestamp: string;
  history: HistoryEntry[];
}

interface TrainingStatus {
  runs: TrainingRun[];
  latest_run_id: string | null;
  latest_history: HistoryEntry[];
  available: boolean;
}

export function ModelTrainingPage() {
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/ml/registry`);
        if (!res.ok) throw new Error("Failed to fetch training status");
        const data: TrainingStatus = await res.json();
        if (!cancelled) setStatus(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchStatus();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="p-8 font-body text-sm text-graphite">
        Loading training status...
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className="p-8 font-body text-sm text-red-600">
        {error ?? "Unable to load training data"}
      </div>
    );
  }

  if (!status.available) {
    return (
      <div className="p-8">
        <h1 className="font-heading text-xl text-ink mb-2">Model Training Dashboard</h1>
        <p className="font-body text-sm text-graphite">
          No training run data available. Run{" "}
          <code className="bg-paper-2 px-1 py-0.5 border-[1px] border-ink text-xs">ml/train.py</code>{" "}
          or use the{" "}
          <a href="/studio" className="underline text-ochre">Training Studio</a>{" "}
          to train a model first.
        </p>
      </div>
    );
  }

  const latestRun = status.runs.find((r) => r.run_id === status.latest_run_id) ?? status.runs[status.runs.length - 1];
  const hasHistory = status.latest_history.length > 0;

  return (
    <div className="p-8 space-y-6">
      <h1 className="font-heading text-xl text-ink">Model Training Dashboard</h1>
      <p className="font-body text-sm text-graphite">
        Training runs locally via ProctorIQ Studio. This deployed page is a read-only dashboard for completed runs.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Cross-Validation F1" value={latestRun?.cv_f1} />
        <MetricCard label="Test F1" value={latestRun?.test_f1} />
        <MetricCard label="Accuracy" value={latestRun?.accuracy} />
        <MetricCard label="Epochs" value={latestRun?.epochs ?? 0} raw />
      </div>

      {hasHistory && (
        <>
          <div className="border-[2px] border-ink bg-paper p-4">
            <h2 className="font-label text-label text-graphite mb-3">Loss per Epoch</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={status.latest_history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="epoch" label={{ value: "Epoch", position: "bottom", fontSize: 10 }} />
                <YAxis label={{ value: "Loss", angle: -90, position: "left", fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="train_loss" stroke="var(--jade)" name="Train Loss" dot={false} />
                <Line type="monotone" dataKey="val_loss" stroke="var(--plum)" name="Val Loss" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="border-[2px] border-ink bg-paper p-4">
            <h2 className="font-label text-label text-graphite mb-3">Accuracy per Epoch</h2>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={status.latest_history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="epoch" label={{ value: "Epoch", position: "bottom", fontSize: 10 }} />
                <YAxis domain={[0, 100]} label={{ value: "Accuracy %", angle: -90, position: "left", fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="train_acc" stroke="var(--jade)" name="Train Acc %" dot={false} />
                <Line type="monotone" dataKey="val_acc" stroke="var(--plum)" name="Val Acc %" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div className="border-[2px] border-ink bg-paper p-4">
        <h2 className="font-label text-label text-graphite mb-3">All Runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-xs text-ink">
            <thead>
              <tr className="border-b-[2px] border-ink">
                <th className="text-left py-1 pr-3">Run ID</th>
                <th className="text-right py-1 pr-3">CV F1</th>
                <th className="text-right py-1 pr-3">Test F1</th>
                <th className="text-right py-1 pr-3">Accuracy</th>
                <th className="text-right py-1 pr-3">Epochs</th>
                <th className="text-right py-1">Date</th>
              </tr>
            </thead>
            <tbody>
              {status.runs.map((run) => (
                <tr key={run.run_id} className="border-b-[1px] border-ink/30">
                  <td className="py-1 pr-3">{run.run_id.slice(0, 12)}</td>
                  <td className="text-right py-1 pr-3">{run.cv_f1 != null ? run.cv_f1.toFixed(4) : "-"}</td>
                  <td className="text-right py-1 pr-3">{run.test_f1 != null ? run.test_f1.toFixed(4) : "-"}</td>
                  <td className="text-right py-1 pr-3">{run.accuracy != null ? `${(run.accuracy * 100).toFixed(1)}%` : "-"}</td>
                  <td className="text-right py-1 pr-3">{run.epochs}</td>
                  <td className="text-right py-1">{run.timestamp?.slice(0, 10) ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, raw }: { label: string; value: number | null | undefined; raw?: boolean }) {
  return (
    <div className="border-[2px] border-ink bg-paper p-3">
      <p className="font-label text-[10px] text-graphite uppercase tracking-wider">{label}</p>
      <p className="font-heading text-lg text-ink mt-1">
        {value != null ? (raw ? String(value) : value.toFixed(4)) : "-"}
      </p>
    </div>
  );
}

export default ModelTrainingPage;
