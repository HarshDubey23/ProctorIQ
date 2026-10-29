import { useState } from 'react';
import { Download, ShieldAlert } from 'lucide-react';
import type { ExamResult } from './types';
import { Button } from '../../components/ui/button';
import { API_BASE } from '../../lib/api';

interface ResultsScreenProps {
  result: ExamResult | null;
  sessionId: string;
  kickedReason?: string;
}

const fmt = (n: number | null | undefined, digits = 0) => (n == null ? '--' : n.toFixed(digits));

export function ResultsScreen({ result, sessionId, kickedReason }: ResultsScreenProps) {
  const [downloading, setDownloading] = useState(false);
  const terminated = result?.status === 'terminated' || !!kickedReason;

  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/report`);
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `proctoriq-${sessionId.slice(0, 8)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 p-6">
      <div className="flex flex-col items-center gap-2 pt-4">
        <div className={`border-[4px] px-8 py-3 shadow-brutal-lg bg-paper ${terminated ? 'border-stamp' : 'border-ledger'}`}>
          <span className={`font-display text-4xl uppercase tracking-[0.08em] ${terminated ? 'text-stamp' : 'text-ledger'}`}>
            {terminated ? 'Ended' : 'Submitted'}
          </span>
        </div>
        {terminated && (
          <p className="flex items-center gap-1.5 font-body text-sm text-stamp">
            <ShieldAlert size={14} /> {kickedReason || 'Your teacher ended this attempt.'}
          </p>
        )}
        {!result && <p className="font-body text-xs text-graphite">Your answers are saved. Results aren't available right now.</p>}
      </div>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-4 border-[3px] border-ink bg-paper-2 p-4 text-center">
            <div>
              <div className="font-mono text-data-lg font-bold text-ink">
                {fmt(result.marks, 1)}<span className="text-graphite text-base"> / {fmt(result.max_marks, 0)}</span>
              </div>
              <div className="font-label text-label text-graphite">Marks</div>
            </div>
            <div>
              <div className="font-mono text-data-lg font-bold text-ink">{fmt(result.percent)}%</div>
              <div className="font-label text-label text-graphite">Score</div>
            </div>
          </div>
          {result.pending_manual > 0 && (
            <p className="border-[3px] border-ochre p-3 font-body text-xs text-ochre">
              {result.pending_manual} written answer{result.pending_manual === 1 ? '' : 's'} still to be graded by your
              teacher. Your final marks may go up.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 border-[3px] border-ink bg-paper p-4 text-center">
            <div>
              <div className="font-mono text-data-sm font-bold text-ink">{fmt(result.pct_focused)}%</div>
              <div className="font-label text-label text-graphite">Focused</div>
            </div>
            <div>
              <div className="font-mono text-data-sm font-bold text-ink">{result.verdict ?? '--'}</div>
              <div className="font-label text-label text-graphite">Integrity</div>
            </div>
          </div>
        </>
      )}

      <Button variant="default" onClick={() => void download()} disabled={downloading}>
        <Download size={14} /> {downloading ? 'Preparing…' : 'Download signed report (PDF)'}
      </Button>
      <p className="text-center font-body text-xs text-graphite">You can close this window.</p>
    </div>
  );
}
