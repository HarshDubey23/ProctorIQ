import type { ExamQuestion, ExamAnswer } from './types';
import { Check, X } from 'lucide-react';

interface ExamQuestionCardProps {
  question: ExamQuestion;
  answer: ExamAnswer;
  onSelect: (questionId: number, index: number) => void;
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
  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="mb-1">
        <span className="font-sans text-[11px] uppercase tracking-[0.1em] text-signal-focus">
          {question.topic}
        </span>
      </div>
      <h2 className="font-sans text-lg text-text-primary leading-relaxed mb-6">
        {questionNumber}. {question.question}
      </h2>

      <div className="flex flex-col gap-2.5">
        {question.options.map((option, idx) => {
          const isSelected = answer.selectedIndex === idx;
          const isCorrect = question.correctIndex === idx;
          const isWrongSelected = showResults && isSelected && !isCorrect;

          let borderColor = 'border-white/[0.08]';
          let bgColor = 'bg-white/[0.03]';
          let textColor = 'text-text-primary';

          if (showResults) {
            if (isCorrect) {
              borderColor = 'border-signal-drowsy';
              bgColor = 'bg-signal-drowsy/[0.08]';
              textColor = 'text-signal-drowsy';
            } else if (isWrongSelected) {
              borderColor = 'border-signal-multi';
              bgColor = 'bg-signal-multi/[0.08]';
              textColor = 'text-signal-multi';
            }
          } else if (isSelected) {
            borderColor = 'border-signal-focus';
            bgColor = 'bg-signal-focus/[0.08]';
            textColor = 'text-signal-focus';
          }

          return (
            <button
              key={idx}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 ${borderColor} ${bgColor} hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[--signal-focus]`}
              onClick={() => onSelect(question.id, idx)}
              disabled={showResults}
              aria-pressed={isSelected}
              aria-label={`Option ${OPTION_LABELS[idx]}: ${option}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[13px] font-semibold tabular-nums ${
                  isSelected || (showResults && isCorrect)
                    ? 'bg-signal-focus text-black'
                    : 'bg-white/[0.08] text-text-secondary'
                }`}
              >
                {showResults && isCorrect ? (
                  <Check size={14} className="text-black" />
                ) : showResults && isWrongSelected ? (
                  <X size={14} />
                ) : (
                  OPTION_LABELS[idx]
                )}
              </span>
              <span className={`font-sans text-[15px] ${textColor}`}>{option}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
