import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { QUESTIONS } from './questions';
import type { ExamAnswer, ProctorEvent } from './types';
import {
  computeIntegrityScore,
  computeProctorIQ,
  computeVerdict,
} from './types';
import { Check, X, Download, RotateCcw, ShieldCheck, ShieldAlert } from 'lucide-react';
import { itemTransition } from '../../motion.config';

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

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

function describeArc(cx: number, cy: number, r: number, pct: number): string {
  const endDeg = pct * 3.6;
  const [x1, y1] = polar(cx, cy, r, 0);
  const [x2, y2] = polar(cx, cy, r, Math.min(endDeg, 359.9));
  const sweep = endDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${sweep} 0 ${x2} ${y2}`;
}

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

const VERDICT_LABEL: Record<string, string> = {
  pass: 'PASS',
  investigate: 'INVESTIGATE',
  fail: 'FAIL',
};

const VERDICT_COLOR: Record<string, string> = {
  pass: 'text-signal-drowsy',
  investigate: 'text-signal-caution',
  fail: 'text-signal-multi',
};

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

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
  const correctCount = answers.filter((a) => {
    const q = QUESTIONS.find((qq) => qq.id === a.questionId);
    return q && a.selectedIndex === q.correctIndex;
  }).length;

  const totalQuestions = QUESTIONS.length;
  const pct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const proctorIQ = computeProctorIQ(correctCount, totalQuestions, events);
  const verdict = computeVerdict(proctorIQ);
  const integrityScoreValue = computeIntegrityScore(events);
  const examScorePct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const topics = useMemo(() => topicLabel(answers), [answers]);

  const eventCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of events) {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    }
    return counts;
  }, [events]);

  const ringColor =
    pct >= 80
      ? 'var(--signal-drowsy)'
      : pct >= 50
        ? 'var(--signal-caution)'
        : 'var(--signal-multi)';

  return (
    <div className="flex h-full w-full gap-0 lg:gap-6 overflow-y-auto">
      <motion.div
        className="flex w-full flex-col gap-6 lg:w-[60%] p-6"
        initial={{ opacity: 0, x: -24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={itemTransition}
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-40 h-40">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
              <circle cx="80" cy="80" r="68" fill="none" stroke="var(--signal-neutral)" strokeWidth="8" opacity={0.15} />
              <motion.path
                initial={{ pathLength: 0 }}
                animate={{ pathLength: pct / 100 }}
                transition={{ duration: 1, ease: 'easeOut' }}
                d={describeArc(80, 80, 68, pct)}
                fill="none"
                stroke={ringColor}
                strokeWidth="8"
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-[38px] tabular-nums leading-none text-text-primary">
                {correctCount}/{totalQuestions}
              </span>
              <span className="font-sans text-[11px] uppercase tracking-[0.1em] text-text-secondary">
                Score
              </span>
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-sans text-[13px] uppercase tracking-[0.1em] text-text-secondary mb-3">
            Question Breakdown
          </h3>
          <div className="flex flex-col gap-1.5">
            {QUESTIONS.map((q) => {
              const a = answers.find((aa) => aa.questionId === q.id);
              const isCorrect = a?.selectedIndex === q.correctIndex;
              const isUnanswered = a?.selectedIndex === null;
              return (
                <div
                  key={q.id}
                  className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] tabular-nums ${
                      isCorrect
                        ? 'bg-signal-drowsy/20 text-signal-drowsy'
                        : isUnanswered
                          ? 'bg-white/[0.05] text-text-muted'
                          : 'bg-signal-multi/20 text-signal-multi'
                    }`}
                  >
                    {isCorrect ? <Check size={12} /> : isUnanswered ? '--' : <X size={12} />}
                  </span>
                  <span className="flex-1 truncate font-sans text-[13px] text-text-primary">
                    {q.question}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-text-mono shrink-0">
                    {OPTION_LABELS[q.correctIndex]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h3 className="font-sans text-[13px] uppercase tracking-[0.1em] text-text-secondary mb-3">
            Topic Performance
          </h3>
          <div className="flex flex-col gap-2">
            {topics.map((t) => {
              const tpct = t.total > 0 ? Math.round((t.correct / t.total) * 100) : 0;
              return (
                <div key={t.topic} className="flex items-center gap-3">
                  <span className="w-20 font-sans text-[13px] text-text-primary uppercase">
                    {t.topic}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: ringColor }}
                      initial={{ width: 0 }}
                      animate={{ width: `${tpct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                  <span className="font-mono text-[13px] tabular-nums text-text-secondary w-8 text-right">
                    {tpct}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>

      <motion.div
        className="flex w-full flex-col gap-5 lg:w-[40%] border-t lg:border-t-0 lg:border-l border-white/[0.06] p-6"
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...itemTransition, delay: 0.15 }}
      >
        <div className="text-center">
          <span className={`font-display text-[42px] leading-none tabular-nums ${VERDICT_COLOR[verdict]}`}>
            {proctorIQ}
          </span>
          <div className={`font-sans text-[13px] uppercase tracking-[0.15em] ${VERDICT_COLOR[verdict]}`}>
            {VERDICT_LABEL[verdict]}
          </div>
          <div className="mt-1 font-sans text-[11px] text-text-secondary">
            ProctorIQ Score (exam + integrity)
          </div>
        </div>

        <div className="flex justify-around rounded-xl bg-white/[0.03] p-3">
          <div className="text-center">
            <div className="font-mono text-lg tabular-nums text-text-primary">
              {integrityScoreValue}
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-secondary">
              Integrity
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-lg tabular-nums text-text-primary">
              {events.length}
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-secondary">
              Events
            </div>
          </div>
          <div className="text-center">
            <div className="font-mono text-lg tabular-nums text-text-primary">
              {examScorePct}%
            </div>
            <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-secondary">
              Exam
            </div>
          </div>
        </div>

        <div>
          <h3 className="font-sans text-[13px] uppercase tracking-[0.1em] text-text-secondary mb-2">
            Event Summary
          </h3>
          <div className="flex flex-col gap-1">
            {Object.entries(eventCounts).map(([type, count]) => (
              <div key={type} className="flex justify-between rounded bg-white/[0.02] px-3 py-1.5">
                <span className="font-sans text-[13px] text-text-primary capitalize">
                  {type.replace(/_/g, ' ')}
                </span>
                <span className="font-mono text-[13px] tabular-nums text-text-secondary">
                  {count}
                </span>
              </div>
            ))}
            {events.length === 0 && (
              <span className="font-sans text-[13px] text-text-muted italic">
                No proctor events recorded
              </span>
            )}
          </div>
        </div>

        <div>
          <h3 className="font-sans text-[13px] uppercase tracking-[0.1em] text-text-secondary mb-2">
            Timeline
          </h3>
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {events.length === 0 ? (
              <span className="font-sans text-[13px] text-text-muted italic">
                No events
              </span>
            ) : (
              events.map((e, i) => (
                <div key={`ev-${i}`} className="flex items-center gap-2 rounded bg-white/[0.02] px-3 py-1">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal-caution" />
                  <span className="flex-1 font-sans text-[13px] text-text-primary capitalize">
                    {e.type.replace(/_/g, ' ')}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-text-mono">
                    {new Date(e.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl bg-white/[0.03] px-3 py-2">
          <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted mb-1">
            Report Hash (SHA-256)
          </div>
          {hashLoading ? (
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-signal-focus border-t-transparent" />
              <span className="font-sans text-[12px] text-text-secondary italic">
                Verifying...
              </span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 mb-1">
                {serverVerified ? (
                  <span className="flex items-center gap-1 font-sans text-[10px] text-signal-drowsy">
                    <ShieldCheck size={12} />
                    Server-Verified
                  </span>
                ) : (
                  <span className="flex items-center gap-1 font-sans text-[10px] text-signal-caution">
                    <ShieldAlert size={12} />
                    Local Draft — Not Server Verified
                  </span>
                )}
              </div>
              <div className="font-mono text-[11px] text-text-mono break-all tabular-nums">
                {reportHash || 'computing...'}
              </div>
            </>
          )}
        </div>

        <div className="flex gap-3 mt-auto">
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-signal-focus/[0.12] px-4 py-3 font-sans text-[13px] uppercase tracking-[0.1em] text-signal-focus transition-colors hover:bg-signal-focus/[0.2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
            onClick={onDownloadReport}
            aria-label="Download report"
          >
            <Download size={16} />
            Download
          </button>
          <button
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-white/[0.06] px-4 py-3 font-sans text-[13px] uppercase tracking-[0.1em] text-text-primary transition-colors hover:bg-white/[0.1] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]"
            onClick={onRetake}
            aria-label="Take another exam"
          >
            <RotateCcw size={16} />
            Retake
          </button>
        </div>
      </motion.div>
    </div>
  );
}
