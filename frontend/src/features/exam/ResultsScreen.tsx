import { useMemo, useState, useEffect } from 'react';
import { QUESTIONS } from './questions';
import type { ExamAnswer, ProctorEvent } from './types';
import {
  computeIntegrityScore,
  computeProctorIQ,
  computeVerdict,
} from './types';
import { Check, X, Download, RotateCcw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Card, CardContent } from '../../components/ui/card';

interface ResultsScreenProps {
  answers: ExamAnswer[];
  events: ProctorEvent[];
  submittedAt: number;
  reportHash: string;
  hashLoading: boolean;
  serverVerified: boolean;
  onDownloadReport: () => void;
  onRetake: () => void;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

const VERDICT_STYLES: Record<string, { label: string; borderColor: string; textColor: string }> = {
  pass: { label: 'PASS', borderColor: 'border-ledger', textColor: 'text-ledger' },
  investigate: { label: 'REVIEW', borderColor: 'border-ochre', textColor: 'text-ochre' },
  fail: { label: 'FLAGGED', borderColor: 'border-ochre', textColor: 'text-ochre' },
};

function topicLabel(answers: ExamAnswer[]): { topic: string; correct: number; total: number }[] {
  const map = new Map<string, { correct: number; total: number }>();
  for (const a of answers) {
    const q = QUESTIONS.find((qq) => qq.id === a.questionId);
    if (!q) continue;
    const entry = map.get(q.topic) ?? { correct: 0, total: 0 };
    entry.total++;
    if (a.selectedIndex === q.correctIndex) entry.correct++;
    map.set(q.topic, entry);
  }
  return Array.from(map.entries()).map(([topic, v]) => ({ topic, ...v }));
}

export function ResultsScreen({
  answers,
  events,
  submittedAt: _submittedAt,
  reportHash,
  hashLoading,
  serverVerified,
  onDownloadReport,
  onRetake,
}: ResultsScreenProps) {
  const [showContent, setShowContent] = useState(false);

  const correctCount = answers.filter((a) => {
    const q = QUESTIONS.find((qq) => qq.id === a.questionId);
    return q && a.selectedIndex === q.correctIndex;
  }).length;

  const totalQuestions = QUESTIONS.length;
  const proctorIQ = computeProctorIQ(correctCount, totalQuestions, events);
  const verdict = computeVerdict(proctorIQ);
  const integrityScoreValue = computeIntegrityScore(events);
  const examScorePct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const topics = useMemo(() => topicLabel(answers), [answers]);
  const verdictStyle = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.pass;

  const eventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  useEffect(() => {
    const t = setTimeout(() => setShowContent(true), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className={`flex h-full w-full gap-0 lg:gap-6 overflow-y-auto bg-paper ${showContent ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}>
      <div className="flex w-full flex-col gap-6 lg:w-[60%] p-6">
        <div className="flex flex-col items-center gap-6 pt-4">
          <div className="flex flex-col items-center">
            <div className={`border-[4px] px-8 py-3 shadow-brutal-lg ${verdictStyle.borderColor} bg-paper stamp-in`}>
              <span className={`font-display text-4xl uppercase tracking-[0.08em] ${verdictStyle.textColor}`}>
                {verdictStyle.label}
              </span>
            </div>
            <span className="font-body text-xs text-graphite mt-2">
              ProctorIQ Score (exam + integrity): {Math.round(proctorIQ)}
            </span>
          </div>
        </div>

        <div>
          <span className="chip">Question Breakdown</span>
          <h3 className="font-display text-2xl uppercase mt-2 mb-4">Questions</h3>
          <div className="flex flex-col gap-1.5">
            {QUESTIONS.map((q) => {
              const a = answers.find((aa) => aa.questionId === q.id);
              const isCorrect = a?.selectedIndex === q.correctIndex;
              const isUnanswered = a?.selectedIndex === null;
              return (
                <div key={q.id} className="flex items-center gap-3 border-[2px] border-ink px-3 py-2 bg-paper-2">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center border-[2px] border-ink font-mono text-xs ${
                    isCorrect ? 'bg-ledger text-paper' : isUnanswered ? 'bg-paper text-graphite' : 'bg-ochre text-ink'
                  }`}>
                    {isCorrect ? <Check size={12} /> : isUnanswered ? '--' : <X size={12} />}
                  </span>
                  <span className="flex-1 truncate font-body text-sm text-ink">
                    {q.question}
                  </span>
                  <span className="font-mono text-xs text-graphite shrink-0">
                    {OPTION_LABELS[q.correctIndex]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <span className="chip">Topic Performance</span>
          <h3 className="font-display text-2xl uppercase mt-2 mb-4">By Topic</h3>
          <div className="flex flex-col gap-2">
            {topics.map((t) => {
              const tpct = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
              return (
                <div key={t.topic} className="flex items-center gap-3">
                  <span className="w-20 font-label text-label text-graphite">{t.topic}</span>
                  <div className="flex-1 h-3 border-[2px] border-ink bg-paper overflow-hidden">
                    <div className={`h-full ${tpct >= 80 ? 'bg-ledger' : 'bg-ochre'}`} style={{ width: `${tpct}%` }} />
                  </div>
                  <span className="font-mono text-sm tabular-nums w-8 text-right text-ink">{tpct}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex w-full flex-col gap-5 lg:w-[40%] p-6 border-l-[3px] border-ink">
        <div className="border-[3px] border-ink bg-paper-2 p-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="font-mono text-data-lg font-bold text-ink">{integrityScoreValue}</div>
            <div className="font-label text-label text-graphite">Integrity</div>
          </div>
          <div>
            <div className="font-mono text-data-lg font-bold text-ink">{events.length}</div>
            <div className="font-label text-label text-graphite">Events</div>
          </div>
          <div>
            <div className="font-mono text-data-lg font-bold text-ink">{examScorePct}%</div>
            <div className="font-label text-label text-graphite">Exam</div>
          </div>
        </div>

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

        <Card>
          <CardContent className="p-4 grid gap-2">
            <span className="chip">Timeline</span>
            <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
              {events.length === 0 ? (
                <span className="font-body text-sm text-graphite italic">No events</span>
              ) : (
                events.map((e, i) => (
                  <div key={`ev-${i}`} className="flex items-center gap-2 border-[2px] border-ink px-3 py-1">
                    <span className="h-1.5 w-1.5 shrink-0 bg-ochre" />
                    <span className="flex-1 font-body text-sm text-ink capitalize">{e.type.replace(/_/g, ' ')}</span>
                    <span className="font-mono text-xs text-graphite">
                      {new Date(e.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
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
