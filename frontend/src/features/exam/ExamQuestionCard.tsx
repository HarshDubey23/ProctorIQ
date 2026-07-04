import type { ExamAnswer } from './types';
import type { PublicQuestion } from './types';
import { Check } from 'lucide-react';

interface ExamQuestionCardProps {
  question: PublicQuestion;
  answer: ExamAnswer;
  onSelect: (questionId: string, index: number) => void;
  showResults: boolean;
  questionNumber: number;
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const;

export function ExamQuestionCard({
  question,
  answer,
  onSelect,
  showResults,
  questionNumber,
}: ExamQuestionCardProps) {
  const options = question.options ?? [];

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h2 className="font-body text-lg text-ink leading-relaxed mb-2">
        {questionNumber}. {question.title}
      </h2>
      {question.body && (
        <p className="font-body text-sm text-graphite mb-4">{question.body}</p>
      )}

      <div className="flex flex-col gap-2.5">
        {options.map((option, idx) => {
          const isSelected = answer.selectedIndex === idx;

          let borderColor = "border-ink";
          let bgColor = "bg-paper-2";
          let textColor = "text-ink";

          if (isSelected) {
            borderColor = "border-ledger";
            bgColor = "bg-ledger/10";
            textColor = "text-ledger";
          }

          return (
            <button
              key={idx}
              className={`flex items-center gap-3 border-[3px] px-4 py-3 text-left ${borderColor} ${bgColor} transition-colors focus-visible:outline-[3px] focus-visible:outline-stamp`}
              onClick={() => onSelect(question.id, idx)}
              disabled={showResults}
              aria-pressed={isSelected}
              aria-label={`Option ${OPTION_LABELS[idx]}: ${option}`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center border-[2px] border-ink font-mono text-[13px] font-bold tabular-nums ${
                isSelected
                  ? 'bg-ledger text-paper border-ledger'
                  : 'bg-paper text-graphite'
              }`}>
                {isSelected ? (
                  <Check size={14} />
                ) : (
                  OPTION_LABELS[idx]
                )}
              </span>
              <span className={`font-body text-sm ${textColor}`}>{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
