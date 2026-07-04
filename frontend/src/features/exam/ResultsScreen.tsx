import { useState, useEffect } from 'react';
import type { ServerExamResults } from './types';
import { Download, RotateCcw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

interface ResultsScreenProps {
  results: ServerExamResults | null;
  reportHash: string;
  hashLoading: boolean;
  serverVerified: boolean;
  onDownloadReport: () => void;
  onRetake: () => void;
}

export function ResultsScreen({
  results,
  reportHash,
  hashLoading,
  serverVerified,
  onDownloadReport,
  onRetake,
}: ResultsScreenProps) {
  const [showContent, setShowContent] = useState(false);
  const integrityScoreValue = results?.finalScore != null ? Math.round(results.finalScore) : null;
  const eventCounts = results?.eventCounts ?? {};

  useEffect(() => {
    const t = setTimeout(() => setShowContent(true), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`flex h-full w-full gap-0 lg:gap-6 overflow-y-auto bg-paper ${showContent ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}>
      <div className="flex w-full flex-col gap-6 lg:w-[60%] p-6">
        <div className="flex flex-col items-center gap-6 pt-4">
          <div className="flex flex-col items-center">
            <div className="border-[4px] border-ledger px-8 py-3 shadow-brutal-lg bg-paper stamp-in">
              <span className="font-display text-4xl uppercase tracking-[0.08em] text-ledger">
                COMPLETE
              </span>
            </div>
            <span className="font-body text-xs text-graphite mt-2">
              {integrityScoreValue == null
                ? 'Exam submitted successfully. Server results are unavailable.'
                : `Exam submitted successfully. Your server integrity score is ${integrityScoreValue}.`}
            </span>
          </div>
        </div>

        <div className="border-[3px] border-ink bg-paper-2 p-4 grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="font-mono text-data-lg font-bold text-ink">
              {integrityScoreValue ?? '--'}
            </div>
            <div className="font-label text-label text-graphite">Integrity</div>
          </div>
          <div>
            <div className="font-mono text-data-lg font-bold text-ink">
              {results?.quizScore == null ? '--' : Math.round(results.quizScore)}
            </div>
            <div className="font-label text-label text-graphite">Quiz</div>
          </div>
        </div>
        <div className="border-[3px] border-ink bg-paper p-4 grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="font-mono text-data-sm font-bold text-ink">
              {results?.pctFocused == null ? '--' : `${Math.round(results.pctFocused)}%`}
            </div>
            <div className="font-label text-label text-graphite">Focused</div>
          </div>
          <div>
            <div className="font-mono text-data-sm font-bold text-ink">{results?.verdict ?? '--'}</div>
            <div className="font-label text-label text-graphite">Verdict</div>
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col gap-5 lg:w-[40%] p-6 border-l-[3px] border-ink">
        <Card>
          <CardContent className="p-4 grid gap-2">
            <span className="chip">Event Summary</span>
            {Object.entries(eventCounts).length === 0 ? (
              <span className="font-body text-sm text-graphite italic">No proctor events recorded</span>
            ) : (
              Object.entries(eventCounts).map(([type, count]) => (
                <div key={type} className="flex justify-between border-[2px] border-ink bg-paper-2 px-3 py-1.5">
                  <span className="font-body text-sm text-ink capitalize">{type.replace(/_/g, ' ')}</span>
                  <span className="font-mono text-sm text-graphite">{count}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="border-[3px] border-ink bg-paper p-4">
          <span className="chip mb-2 block">Report Hash (SHA-256)</span>
          {hashLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 border-[3px] border-ledger border-t-transparent animate-spin" />
              <span className="font-body text-xs text-graphite italic">Verifying...</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 mb-1">
                {serverVerified ? (
                  <span className="flex items-center gap-1 font-label text-label text-ledger">
                    <ShieldCheck size={12} />
                    Server-Verified
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-label text-label text-ochre">
                    <ShieldAlert size={12} />
                    Local Draft
                  </span>
                )}
              </div>
              <div className="font-mono text-xs break-all text-graphite">
                {reportHash || 'computing...'}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 mt-auto">
          <Button variant="default" onClick={onDownloadReport} className="flex-1">
            <Download size={16} />
            Download
          </Button>
          <Button variant="ghost" onClick={onRetake} className="flex-1">
            <RotateCcw size={16} />
            Retake
          </Button>
        </div>
      </div>
    </div>
  );
}
