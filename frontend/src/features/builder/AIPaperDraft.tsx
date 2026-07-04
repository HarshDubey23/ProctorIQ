import { useState, useCallback } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { Question, QuestionType } from "./types";

interface AIPaperDraftProps {
  onAddQuestions: (questions: Question[]) => void;
}

const API_BASE = import.meta.env.VITE_API_URL ?? "";
const ALL_TYPES: QuestionType[] = [
  "mcq-single",
  "mcq-multi",
  "true-false",
  "short-answer",
  "long-answer",
  "numerical",
  "code",
];

interface GeneratedQuestion {
  id: string;
  type: QuestionType;
  title: string;
  body: string;
  marks: number;
  negative_marks: number;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  options?: string[] | null;
  correct_answer?: string | null;
}

export function AIPaperDraft({ onAddQuestions }: AIPaperDraftProps) {
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [instructions, setInstructions] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("medium");
  const [count, setCount] = useState(5);
  const [types, setTypes] = useState<QuestionType[]>(["mcq-single"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleType = (t: QuestionType) => {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const handleDraft = useCallback(async () => {
    if (!subject.trim() || types.length === 0) {
      setError("Subject and at least one question type are required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/papers/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          topic,
          instructions,
          difficulty,
          question_count: count,
          question_types: types,
        }),
      });
      if (res.status === 503) throw new Error("AI generation isn't configured on the server yet");
      if (res.status === 429) throw new Error("Rate limit reached - try again in a bit");
      if (!res.ok) throw new Error("Generation failed - try a smaller question count");

      const data: { questions: GeneratedQuestion[]; generated: number; requested: number } = await res.json();
      const mapped: Question[] = data.questions.map((q) => ({
        id: q.id,
        type: q.type,
        title: q.title,
        body: q.body,
        marks: q.marks,
        negativeMarks: q.negative_marks ?? 0,
        topic: q.topic,
        difficulty: q.difficulty,
        options: q.options ?? undefined,
        correctAnswer: q.correct_answer ?? undefined,
      }));
      onAddQuestions(mapped);
      if (data.generated < data.requested) {
        setError(`Generated ${data.generated}/${data.requested}; some were dropped for not matching the schema.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [subject, topic, instructions, difficulty, count, types, onAddQuestions]);

  return (
    <div className="border-[3px] border-ink bg-paper-2 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-ochre" />
        <span className="font-label text-label text-graphite">AI Paper Drafting</span>
      </div>
      <div className="grid gap-2">
        <input
          placeholder="Subject (e.g. Data Structures)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="border-[2px] border-ink bg-paper px-2 py-1 font-body text-xs text-ink outline-none"
        />
        <input
          placeholder="Topic focus (optional, e.g. graph algorithms)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="border-[2px] border-ink bg-paper px-2 py-1 font-body text-xs text-ink outline-none"
        />
        <textarea
          placeholder="Extra instructions (optional)"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          rows={2}
          className="border-[2px] border-ink bg-paper px-2 py-1 font-body text-xs text-ink outline-none"
        />
        <div className="flex flex-wrap gap-1">
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => toggleType(t)}
              className={`border-[2px] border-ink px-2 py-0.5 font-mono text-[10px] ${
                types.includes(t) ? "bg-ochre text-ink" : "bg-paper text-graphite"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
            className="flex-1 border-[2px] border-ink bg-paper px-2 py-1 font-body text-xs text-ink outline-none"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
            <option value="mixed">Mixed</option>
          </select>
          <input
            type="number"
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            min={1}
            max={20}
            className="w-14 border-[2px] border-ink bg-paper px-2 py-1 font-mono text-xs text-ink outline-none text-center"
          />
        </div>
        <Button variant="primary" onClick={handleDraft} disabled={loading} className="text-xs py-1.5">
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {loading ? "Generating..." : `Draft ${count} Questions`}
        </Button>
        {error && <p className="font-body text-[10px] text-red-600">{error}</p>}
      </div>
    </div>
  );
}
