import { useState, useCallback } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { Question, QuestionType } from "./types";

interface AIPaperDraftProps {
  onAddQuestions: (questions: Question[]) => void;
}

interface DraftTemplate {
  topic: string;
  type: QuestionType;
  title: string;
  body: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
  options?: string[];
  correctAnswer?: string;
}

const TEMPLATES: DraftTemplate[] = [
  { topic: "Algorithms", type: "mcq-single", title: "Sorting Complexity", body: "What is the worst-case time complexity of quicksort?", marks: 2, difficulty: "medium" },
  { topic: "Data Structures", type: "mcq-single", title: "Hash Table Operations", body: "What is the average-case time complexity for a hash table lookup?", marks: 2, difficulty: "easy" },
  { topic: "Programming", type: "code", title: "Reverse a String", body: "Write a function that reverses a string in place without using built-in reverse methods.", marks: 5, difficulty: "medium" },
  { topic: "Databases", type: "short-answer", title: "Normalization Forms", body: "Explain the difference between 2NF and 3NF with an example.", marks: 4, difficulty: "hard" },
  { topic: "Networking", type: "true-false", title: "OSI Model", body: "The Transport Layer in the OSI model is responsible for end-to-end communication.", marks: 1, difficulty: "easy", options: ["True", "False"], correctAnswer: "True" },
  { topic: "Security", type: "mcq-single", title: "XSS Attack", body: "Which of the following is the most effective defense against XSS attacks?", marks: 2, difficulty: "medium", options: ["Input validation", "Output encoding", "Rate limiting", "CAPTCHA"], correctAnswer: "Output encoding" },
  { topic: "Web", type: "short-answer", title: "CORS Policy", body: "What is CORS and why is it needed in web applications?", marks: 3, difficulty: "medium" },
  { topic: "Programming", type: "code", title: "Binary Search Implementation", body: "Implement binary search on a sorted array. Return the index if found, -1 otherwise.", marks: 6, difficulty: "medium" },
  { topic: "Algorithms", type: "numerical", title: "Space Complexity", body: "If an algorithm uses an auxiliary array of size n², what is its space complexity in Big O notation?", marks: 2, difficulty: "medium", correctAnswer: "O(n²)" },
  { topic: "Databases", type: "long-answer", title: "Database Indexing Strategies", body: "Compare B-tree and hash indexing strategies. When would you use each?", marks: 8, difficulty: "hard" },
];

export function AIPaperDraft({ onAddQuestions }: AIPaperDraftProps) {
  const [topic, setTopic] = useState("Algorithms");
  const [difficulty, setDifficulty] = useState("medium");
  const [count, setCount] = useState(3);

  const handleDraft = useCallback(() => {
    const filtered = TEMPLATES.filter(
      (t) => t.topic === topic && t.difficulty === difficulty
    );
    const selected = filtered.slice(0, count);
    if (selected.length === 0) {
      const fallback = TEMPLATES.filter((t) => t.topic === topic).slice(0, count);
      if (fallback.length === 0) return;
      const questions: Question[] = fallback.map((t, i) => ({
        id: `draft_${Date.now()}_${i}`,
        type: t.type,
        title: t.title,
        body: t.body,
        marks: t.marks,
        negativeMarks: 0,
        topic: t.topic,
        difficulty: t.difficulty as "easy" | "medium" | "hard",
        options: t.options,
        correctAnswer: t.correctAnswer,
      }));
      onAddQuestions(questions);
      return;
    }
    const questions: Question[] = selected.map((t, i) => ({
      id: `draft_${Date.now()}_${i}`,
      type: t.type,
      title: t.title,
      body: t.body,
      marks: t.marks,
      negativeMarks: 0,
      topic: t.topic,
      difficulty: t.difficulty as "easy" | "medium" | "hard",
      options: t.options,
      correctAnswer: t.correctAnswer,
    }));
    onAddQuestions(questions);
  }, [topic, difficulty, count, onAddQuestions]);

  const topics = [...new Set(TEMPLATES.map((t) => t.topic))];

  return (
    <div className="border-[3px] border-ink bg-paper-2 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={16} className="text-ochre" />
        <span className="font-label text-label text-graphite">AI Paper Drafting</span>
      </div>
      <div className="grid gap-2">
        <div className="flex gap-2">
          <select value={topic} onChange={(e) => setTopic(e.target.value)}
            className="flex-1 border-[2px] border-ink bg-paper px-2 py-1 font-body text-xs text-ink outline-none" aria-label="Topic">
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
            className="flex-1 border-[2px] border-ink bg-paper px-2 py-1 font-body text-xs text-ink outline-none" aria-label="Difficulty">
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
          <input type="number" value={count} onChange={(e) => setCount(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))}
            min={1} max={10} aria-label="Number of questions"
            className="w-12 border-[2px] border-ink bg-paper px-2 py-1 font-mono text-xs text-ink outline-none text-center" />
        </div>
        <Button variant="primary" onClick={handleDraft} className="text-xs py-1.5">
          <Sparkles size={12} /> Draft {count} Questions
        </Button>
        <p className="font-body text-[10px] text-graphite">
          PLACEHOLDER: Replace template data with real AI model inference
        </p>
      </div>
    </div>
  );
}
