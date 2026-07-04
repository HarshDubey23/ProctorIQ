import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Bot, Loader2, Plus, Send, Settings2, User } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { Question, QuestionType } from "./types";
import { QUESTION_TYPE_LABELS } from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface ChatEntry {
  id: string;
  role: "user" | "assistant";
  content: string;
  questions?: Question[];
}

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

type ChatResponse =
  | { action: "ask"; message: string; model_used: string }
  | { action: "generate"; questions: GeneratedQuestion[]; assumptions: string; model_used: string };

interface HFChatPanelProps {
  onAddQuestions: (questions: Question[]) => void;
  paperContext?: Question[];
}

const QUESTION_TYPES: QuestionType[] = [
  "mcq-single",
  "mcq-multi",
  "true-false",
  "short-answer",
  "long-answer",
  "numerical",
  "code",
];

function mapQuestion(question: GeneratedQuestion, index: number): Question {
  return {
    id: question.id || `ai_${Date.now()}_${index}`,
    type: question.type,
    title: question.title,
    body: question.body,
    marks: question.marks,
    negativeMarks: question.negative_marks ?? 0,
    topic: question.topic,
    difficulty: question.difficulty,
    options: question.options ?? undefined,
    correctAnswer: question.correct_answer ?? undefined,
  };
}

function errorMessage(status: number): string {
  if (status === 503) return "AI generation isn't configured on this server yet.";
  if (status === 429) return "Rate limit reached - try again later.";
  if (status === 502) return "Couldn't parse that result. Want me to retry with a simpler request?";
  return "The AI service is unavailable right now.";
}

export function HFChatPanel({ onAddQuestions, paperContext = [] }: HFChatPanelProps) {
  const [chat, setChat] = useState<ChatEntry[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Tell me what paper you need. I can ask a quick follow-up or draft questions when there is enough context.",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showQuickFields, setShowQuickFields] = useState(false);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("medium");
  const [count, setCount] = useState(5);
  const [types, setTypes] = useState<QuestionType[]>(["mcq-single"]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat]);

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatEntry = {
      id: `u_${Date.now()}`,
      role: "user",
      content: trimmed,
    };
    const nextChat = [...chat, userMessage].filter((entry) => entry.id !== "welcome");
    setChat(nextChat);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/papers/generate/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation: nextChat.map((entry) => ({ role: entry.role, content: entry.content })),
          paper_context: paperContext.map((question) => ({
            id: question.id,
            type: question.type,
            title: question.title,
            body: question.body,
            marks: question.marks,
            negative_marks: question.negativeMarks,
            topic: question.topic,
            difficulty: question.difficulty,
            options: question.options ?? null,
            correct_answer: question.correctAnswer ?? null,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(errorMessage(response.status));
      }

      const data: ChatResponse = await response.json();
      const assistantMessage: ChatEntry =
        data.action === "ask"
          ? {
              id: `a_${Date.now()}`,
              role: "assistant",
              content: data.message,
            }
          : {
              id: `a_${Date.now()}`,
              role: "assistant",
              content: data.assumptions
                ? `I drafted these questions. Assumptions: ${data.assumptions}`
                : "I drafted these questions.",
              questions: data.questions.map(mapQuestion),
            };
      setChat((current) => [...current, assistantMessage]);
    } catch (error) {
      setChat((current) => [
        ...current,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? error.message : "AI generation failed.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [chat, loading, paperContext]);

  const sendQuickPrompt = useCallback(() => {
    if (!subject.trim()) return;
    const prompt = [
      `Create ${count} ${difficulty} questions for ${subject.trim()}.`,
      topic.trim() ? `Focus on ${topic.trim()}.` : "",
      `Use these question types: ${types.join(", ")}.`,
    ].filter(Boolean).join(" ");
    void sendMessage(prompt);
  }, [count, difficulty, sendMessage, subject, topic, types]);

  const toggleType = (type: QuestionType) => {
    setTypes((current) => (
      current.includes(type)
        ? current.filter((entry) => entry !== type)
        : [...current, type]
    ));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage(input);
    }
  };

  return (
    <div className="flex max-h-[560px] flex-col border-[3px] border-ink bg-paper-2">
      <div className="flex items-center justify-between border-b-[3px] border-ink p-3">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-ochre" />
          <span className="font-label text-label text-graphite">AI Paper Chat</span>
        </div>
        <button
          type="button"
          onClick={() => setShowQuickFields((value) => !value)}
          className="border-[2px] border-ink bg-paper p-1 text-ink hover:bg-ink hover:text-paper"
          aria-label="Toggle quick fields"
          title="Toggle quick fields"
        >
          <Settings2 size={14} />
        </button>
      </div>

      {showQuickFields && (
        <div className="grid gap-2 border-b-[3px] border-ink bg-paper p-3">
          <input
            placeholder="Subject"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-xs text-ink outline-none"
          />
          <input
            placeholder="Topic focus"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            className="border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-xs text-ink outline-none"
          />
          <div className="flex gap-2">
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value as typeof difficulty)}
              className="flex-1 border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-xs text-ink outline-none"
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="mixed">Mixed</option>
            </select>
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(event) => setCount(Math.max(1, Math.min(20, parseInt(event.target.value, 10) || 1)))}
              className="w-14 border-[2px] border-ink bg-paper-2 px-2 py-1 text-center font-mono text-xs text-ink outline-none"
              aria-label="Question count"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {QUESTION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => toggleType(type)}
                className={`border-[2px] border-ink px-2 py-0.5 font-mono text-[10px] ${
                  types.includes(type) ? "bg-ochre text-ink" : "bg-paper text-graphite"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
          <Button variant="primary" onClick={sendQuickPrompt} disabled={loading || !subject.trim()} className="text-xs">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            Send as chat
          </Button>
        </div>
      )}

      <div className="grid min-h-[230px] flex-1 content-start gap-3 overflow-y-auto p-3">
        {chat.map((entry) => (
          <div key={entry.id} className={`flex gap-2 ${entry.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[88%] border-[2px] border-ink p-2 ${
                entry.role === "user" ? "bg-ink text-paper" : "bg-paper text-ink"
              }`}
            >
              <div className="mb-1 flex items-center gap-1">
                {entry.role === "user" ? <User size={10} /> : <Bot size={10} />}
                <span className="font-label text-[10px] opacity-70">
                  {entry.role === "user" ? "You" : "Assistant"}
                </span>
              </div>
              <p className="whitespace-pre-wrap font-body text-xs">{entry.content}</p>
              {entry.questions && entry.questions.length > 0 && (
                <div className="mt-2 border-t-[2px] border-ink/30 pt-2">
                  <div className="grid gap-1">
                    {entry.questions.map((question) => (
                      <div key={question.id} className="border-[1px] border-ink bg-paper-2 p-2">
                        <div className="flex items-center gap-1">
                          <span className="chip !border-[1px] !text-[10px]">
                            {QUESTION_TYPE_LABELS[question.type]?.split(" ")[0] ?? question.type}
                          </span>
                          <span className="font-mono text-[10px] text-graphite">{question.marks} marks</span>
                        </div>
                        <p className="mt-1 font-display text-xs text-ink">{question.title}</p>
                        <p className="mt-1 line-clamp-2 font-body text-[10px] text-graphite">{question.body}</p>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="default"
                    onClick={() => onAddQuestions(entry.questions ?? [])}
                    className="mt-2 h-auto px-2 py-1 text-[10px]"
                  >
                    <Plus size={10} /> Add to paper
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t-[3px] border-ink p-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="I need a paper for second-year DBMS, medium difficulty, mostly MCQs..."
          rows={2}
          className="flex-1 resize-none border-[2px] border-ink bg-paper px-2 py-1 font-body text-xs text-ink outline-none"
        />
        <Button
          variant="primary"
          onClick={() => void sendMessage(input)}
          disabled={loading || !input.trim()}
          className="self-end"
          aria-label="Send message"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
        </Button>
      </div>
    </div>
  );
}
