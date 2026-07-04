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
        <span className="chip !text-[10px] !border-[1px]">{question.topic}</span>
      </div>
      <h2 className="font-body text-lg text-ink leading-relaxed mb-6">
        {questionNumber}. {question.question}
      </h2>

      <div className="flex flex-col gap-2.5">
        {question.options.map((option, idx) => {
          const isSelected = answer.selectedIndex === idx;
          const isCorrect = question.correctIndex === idx;
          const isWrongSelected = showResults && isSelected && !isCorrect;

          let borderColor = "border-ink";
          let bgColor = "bg-paper-2";
          let textColor = "text-ink";

          if (showResults) {
            if (isCorrect) {
              borderColor = "border-ledger";
              bgColor = "bg-ledger/10";
              textColor = "text-ledger";
            } else if (isWrongSelected) {
              borderColor = "border-ochre";
              bgColor = "bg-ochre/10";
              textColor = "text-ochre";
            }
          } else if (isSelected) {
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
                isSelected || (showResults && isCorrect)
                  ? 'bg-ledger text-paper border-ledger'
                  : 'bg-paper text-graphite'
              }`}>
                {showResults && isCorrect ? (
                  <Check size={14} />
                ) : showResults && isWrongSelected ? (
                  <X size={14} />
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
