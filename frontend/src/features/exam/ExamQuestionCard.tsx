import { Check } from 'lucide-react';
import type { PublicQuestion } from './types';

interface ExamQuestionCardProps {
  question: PublicQuestion;
  answer: string | null;
  onChange: (value: string | null) => void;
  questionNumber: number;
  disabled?: boolean;
}

const OPTION_LABELS = 'ABCDEFGHIJ';
const TEXT_LIMIT = 20_000;

// mcq-multi answers are option texts joined by commas; match the server's parser.
function splitMulti(answer: string | null, options: string[]): string[] {
  if (!answer) return [];
  if (options.includes(answer)) return [answer];
  return answer.split(',').map((s) => s.trim()).filter((s) => options.includes(s));
}

export function ExamQuestionCard({ question, answer, onChange, questionNumber, disabled }: ExamQuestionCardProps) {
  const options = question.options ?? (question.type === 'true-false' ? ['True', 'False'] : []);
  const isOptionType = ['mcq-single', 'mcq-multi', 'true-false'].includes(question.type);
  const multi = question.type === 'mcq-multi';
  const selected = multi ? splitMulti(answer, options) : answer ? [answer] : [];

  const toggle = (option: string) => {
    if (!multi) {
      onChange(answer === option ? null : option);
      return;
    }
    const next = selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option];
    // Keep paper order so the stored answer is stable.
    onChange(next.length ? options.filter((o) => next.includes(o)).join(',') : null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-2 flex items-start justify-between gap-4">
        <h2 className="font-body text-lg text-ink leading-relaxed">
          {questionNumber}. {question.title}
        </h2>
        <span className="chip shrink-0 !text-[10px]">
          {question.marks} mark{question.marks === 1 ? '' : 's'}
        </span>
      </div>
      {question.body && question.body !== question.title && (
        <p className="font-body text-sm text-graphite mb-4 whitespace-pre-wrap">{question.body}</p>
      )}
      {multi && <p className="mb-3 font-body text-xs text-graphite">Select all that apply.</p>}

      {isOptionType && (
        <div className="flex flex-col gap-2.5" role={multi ? 'group' : 'radiogroup'}>
          {options.map((option, idx) => {
            const isSelected = selected.includes(option);
            return (
              <button
                key={`${idx}-${option}`}
                type="button"
                className={`flex items-center gap-3 border-[3px] px-4 py-3 text-left transition-colors focus-visible:outline-[3px] focus-visible:outline-stamp ${
                  isSelected ? 'border-ledger bg-ledger/10' : 'border-ink bg-paper-2'
                }`}
                onClick={() => toggle(option)}
                disabled={disabled}
                role={multi ? 'checkbox' : 'radio'}
                aria-checked={isSelected}
              >
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center border-[2px] font-mono text-[13px] font-bold ${
                  isSelected ? 'bg-ledger text-paper border-ledger' : 'bg-paper text-graphite border-ink'
                }`}>
                  {isSelected ? <Check size={14} /> : OPTION_LABELS[idx] ?? idx + 1}
                </span>
                <span className={`font-body text-sm ${isSelected ? 'text-ledger' : 'text-ink'}`}>{option}</span>
              </button>
            );
          })}
        </div>
      )}

      {question.type === 'numerical' && (
        <input
          type="text"
          inputMode="decimal"
          value={answer ?? ''}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.eE+-]/g, '') || null)}
          disabled={disabled}
          placeholder="Enter a number"
          aria-label="Numerical answer"
          className="w-full max-w-xs border-[3px] border-ink bg-paper-2 px-4 py-3 font-mono text-base text-ink outline-none"
        />
      )}

      {question.type === 'short-answer' && (
        <input
          type="text"
          value={answer ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
          maxLength={500}
          placeholder="Type your answer"
          aria-label="Short answer"
          autoComplete="off"
          spellCheck={false}
          className="w-full border-[3px] border-ink bg-paper-2 px-4 py-3 font-body text-sm text-ink outline-none"
        />
      )}

      {(question.type === 'long-answer' || question.type === 'code') && (
        <div>
          <textarea
            value={answer ?? ''}
            onChange={(e) => onChange(e.target.value || null)}
            disabled={disabled}
            maxLength={TEXT_LIMIT}
            rows={question.type === 'code' ? 14 : 10}
            placeholder={question.type === 'code' ? 'Write your code here' : 'Write your answer here'}
            aria-label={question.type === 'code' ? 'Code answer' : 'Written answer'}
            autoComplete="off"
            spellCheck={question.type !== 'code'}
            onKeyDown={(e) => {
              if (question.type !== 'code' || e.key !== 'Tab') return;
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: s, selectionEnd: end, value } = el;
              onChange(`${value.slice(0, s)}  ${value.slice(end)}`);
              requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
            }}
            className={`w-full resize-y border-[3px] border-ink bg-paper-2 px-4 py-3 text-ink outline-none ${
              question.type === 'code' ? 'font-mono text-xs' : 'font-body text-sm leading-relaxed'
            }`}
          />
          <div className="mt-1 text-right font-mono text-[10px] text-graphite">
            {(answer ?? '').trim() ? (answer ?? '').trim().split(/\s+/).length : 0} words
          </div>
        </div>
      )}
    </div>
  );
}
