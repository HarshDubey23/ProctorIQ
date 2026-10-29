import { Plus, X } from "lucide-react";
import type { Question, QuestionType } from "./types";

const OPTION_TYPES: QuestionType[] = ["mcq-single", "mcq-multi", "true-false"];
const inputCls = "border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-xs text-ink outline-none";

/** Options/answer fields that fit a question's type. Call when the type changes. */
export function withTypeDefaults(q: Question, type: QuestionType): Question {
  if (type === "true-false") return { ...q, type, options: ["True", "False"], correctAnswer: "" };
  if (OPTION_TYPES.includes(type)) {
    const options = q.options && q.options.length >= 2 && q.type !== "true-false" ? q.options : ["", "", "", ""];
    return { ...q, type, options, correctAnswer: "" };
  }
  return { ...q, type, options: undefined, correctAnswer: "" };
}

/** Returns a reason the question can't be published yet, or null. */
export function questionProblem(q: Question): string | null {
  if (!q.title.trim()) return "Add the question text.";
  if (!(q.marks > 0)) return "Marks must be more than 0.";
  if (OPTION_TYPES.includes(q.type)) {
    const opts = (q.options ?? []).map((o) => o.trim());
    if (opts.filter(Boolean).length < 2) return "Add at least two options.";
    if (opts.some((o) => !o)) return "Remove empty options.";
    if (new Set(opts).size !== opts.length) return "Options must be different from each other.";
    const correct = (q.correctAnswer ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (correct.length === 0) return "Mark the correct option.";
    if (q.type === "mcq-multi" && opts.some((o) => o.includes(","))) return "Multi-select options can't contain commas.";
  }
  if (q.type === "numerical" && !Number.isFinite(Number((q.correctAnswer ?? "").trim() || "x"))) {
    return "Enter the numeric answer.";
  }
  return null;
}

export function AnswerEditor({ q, onChange }: { q: Question; onChange: (q: Question) => void }) {
  if (OPTION_TYPES.includes(q.type)) {
    const options = q.options ?? [];
    const multi = q.type === "mcq-multi";
    const correct = new Set((q.correctAnswer ?? "").split(",").map((s) => s.trim()).filter(Boolean));
    const setCorrect = (next: Set<string>) =>
      onChange({ ...q, correctAnswer: options.filter((o) => next.has(o.trim())).map((o) => o.trim()).join(",") });

    return (
      <div className="grid gap-1.5">
        <span className="font-label text-[10px] uppercase text-graphite">
          Options — tick the correct {multi ? "ones" : "one"}
        </span>
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type={multi ? "checkbox" : "radio"}
              name={`correct-${q.id}`}
              checked={!!opt.trim() && correct.has(opt.trim())}
              disabled={!opt.trim()}
              onChange={() => {
                const key = opt.trim();
                const next = multi ? new Set(correct) : new Set<string>();
                if (multi && correct.has(key)) next.delete(key);
                else next.add(key);
                setCorrect(next);
              }}
              aria-label={`Option ${i + 1} is correct`}
            />
            <input
              type="text"
              value={opt}
              readOnly={q.type === "true-false"}
              onChange={(e) => {
                const next = [...options];
                next[i] = e.target.value;
                // Editing an option's text unmarks it, so the key can't point at stale text.
                const kept = new Set([...correct].filter((c) => next.map((o) => o.trim()).includes(c)));
                onChange({ ...q, options: next, correctAnswer: next.filter((o) => kept.has(o.trim())).map((o) => o.trim()).join(",") });
              }}
              placeholder={`Option ${i + 1}`}
              aria-label={`Option ${i + 1}`}
              className={`${inputCls} flex-1`}
            />
            {q.type !== "true-false" && options.length > 2 && (
              <button
                type="button"
                onClick={() => {
                  const next = options.filter((_, j) => j !== i);
                  const kept = new Set([...correct].filter((c) => next.map((o) => o.trim()).includes(c)));
                  onChange({ ...q, options: next, correctAnswer: next.filter((o) => kept.has(o.trim())).map((o) => o.trim()).join(",") });
                }}
                className="text-graphite hover:text-stamp"
                aria-label={`Remove option ${i + 1}`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        {q.type !== "true-false" && options.length < 10 && (
          <button
            type="button"
            onClick={() => onChange({ ...q, options: [...options, ""] })}
            className="flex items-center gap-1 self-start font-body text-[11px] text-ledger"
          >
            <Plus size={11} /> Add option
          </button>
        )}
        <label className="flex items-center gap-2 font-body text-[11px] text-graphite">
          Negative marks for a wrong answer
          <input
            type="number"
            min={0}
            step={0.25}
            value={q.negativeMarks}
            onChange={(e) => onChange({ ...q, negativeMarks: Math.max(0, Number(e.target.value) || 0) })}
            className={`${inputCls} w-16 font-mono`}
            aria-label="Negative marks"
          />
        </label>
      </div>
    );
  }

  const label =
    q.type === "numerical" ? "Correct answer (number)"
    : q.type === "short-answer" ? "Expected answer (optional — blank means you grade it by hand)"
    : "Model answer for your reference (optional — you grade these by hand)";

  return (
    <label className="grid gap-1">
      <span className="font-label text-[10px] uppercase text-graphite">{label}</span>
      {q.type === "long-answer" || q.type === "code" ? (
        <textarea
          value={q.correctAnswer ?? ""}
          onChange={(e) => onChange({ ...q, correctAnswer: e.target.value })}
          rows={3}
          className={`${inputCls} resize-y ${q.type === "code" ? "font-mono" : ""}`}
        />
      ) : (
        <input
          type="text"
          inputMode={q.type === "numerical" ? "decimal" : undefined}
          value={q.correctAnswer ?? ""}
          onChange={(e) => onChange({ ...q, correctAnswer: e.target.value })}
          className={`${inputCls} ${q.type === "numerical" ? "font-mono" : ""}`}
        />
      )}
    </label>
  );
}
