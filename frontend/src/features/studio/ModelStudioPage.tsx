import { useState, useCallback } from "react";
import {
  Sparkles, Bot, Loader2, Plus, Trash2, FileText,
  BarChart3, Send, Stamp
} from "lucide-react";
import { Button } from "../../components/ui/button";
import type { Question } from "../builder/types";
import { QUESTION_TYPE_LABELS } from "../builder/types";
import { LiveTrainingDashboard } from "./LiveTrainingDashboard";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface ApiQuestion {
  type?: string;
  title?: string;
  body?: string;
  marks?: number;
  negative_marks?: number;
  topic?: string;
  difficulty?: string;
  options?: string[];
  correct_answer?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  questions?: Question[];
}

export function ModelStudioPage() {
  const [activeTab, setActiveTab] = useState<"chat" | "train">("chat");

  // HF Chat state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard" | "mixed">("medium");
  const [questionCount, setQuestionCount] = useState(5);
  const [myQuestions, setMyQuestions] = useState<Question[]>([]);

  const handleGenerateQuestions = useCallback(async () => {
    if (!subject.trim()) return;
    setChatLoading(true);
    setChatError(null);

    const userMsg: ChatMessage = {
      role: "user",
      content: `Generate ${questionCount} ${difficulty} questions for ${subject}${topic ? ` on ${topic}` : ""}`,
    };
    setChatHistory((prev) => [...prev, userMsg]);

    try {
      const res = await fetch(`${API_BASE}/api/hf/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          topic,
          difficulty,
          count: questionCount,
          types: ["mcq-single", "mcq-multi", "true-false", "short-answer", "long-answer", "numerical", "code"],
          instructions: "",
        }),
      });
      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json();

      const questions: Question[] = data.questions.map((q: ApiQuestion, i: number) => ({
        id: `studio_${Date.now()}_${i}`,
        type: q.type || "mcq-single",
        title: q.title || q.body?.slice(0, 50) || `Question ${i + 1}`,
        body: q.body || q.title || "",
        marks: q.marks || 2,
        negativeMarks: q.negative_marks || 0,
        topic: q.topic || topic || subject,
        difficulty: q.difficulty || "medium",
        options: q.options || undefined,
        correctAnswer: q.correct_answer || undefined,
      }));

      setMyQuestions((prev) => [...prev, ...questions]);
      setChatHistory((prev) => [...prev, {
        role: "assistant",
        content: `Generated **${questions.length}** questions for **${subject}**. They've been added to your question list below.`,
        questions,
      }]);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setChatLoading(false);
    }
  }, [subject, topic, difficulty, questionCount]);

  const handleChatMessage = useCallback(async () => {
    if (!chatInput.trim()) return;
    const userMsg: ChatMessage = { role: "user", content: chatInput.trim() };
    setChatHistory((prev) => [...prev, userMsg]);
    setChatInput("");
    setChatLoading(true);
    setChatError(null);

    try {
      const messages = chatHistory.map((c) => ({ role: c.role, content: c.content }));
      messages.push({ role: "user", content: userMsg.content });

      const systemPrompt = `You are an AI teaching assistant helping with exam creation.
Subject: ${subject || "Not specified"}
Topic: ${topic || "General"}
Difficulty: ${difficulty}
Available types: mcq-single, mcq-multi, true-false, short-answer, long-answer, numerical, code

When generating questions, output them in a JSON code block:
\`\`\`json
{"questions": [{"id": "q1", "type": "mcq-single", "title": "...", "body": "...", "marks": 2, "negative_marks": 0, "topic": "...", "difficulty": "medium", "options": [...], "correct_answer": "..."}]}
\`\`\``;

      const res = await fetch(`${API_BASE}/api/hf/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, system_prompt: systemPrompt }),
      });
      if (!res.ok) throw new Error("Chat failed");
      const data = await res.json();

      const assistantMsg: ChatMessage = { role: "assistant", content: data.reply };
      const match = data.reply.match(/```json\n?([\s\S]*?)\n?```/);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          if (parsed.questions) {
            const qs: Question[] = parsed.questions.map((q: ApiQuestion, i: number) => ({
              id: `chat_${Date.now()}_${i}`,
              type: q.type || "mcq-single",
              title: q.title || q.body?.slice(0, 50) || `Q${i + 1}`,
              body: q.body || "",
              marks: q.marks || 2,
              negativeMarks: q.negative_marks || 0,
              topic: q.topic || topic || subject,
              difficulty: q.difficulty || "medium",
              options: q.options || undefined,
              correctAnswer: q.correct_answer || undefined,
            }));
            assistantMsg.questions = qs;
          }
        } catch {
          // ignore invalid json format from model response
        }
      }
      setChatHistory((prev) => [...prev, assistantMsg]);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : "Chat failed");
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatHistory, subject, topic, difficulty]);

  const removeQuestion = (id: string) => {
    setMyQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex h-screen max-w-[1400px] flex-col">
        {/* Top Bar */}
        <div className="flex items-center justify-between border-b-[3px] border-ink px-6 py-3">
          <div className="flex items-center gap-4">
            <a href="/" className="text-graphite hover:text-ink">
              <Stamp size={20} className="text-stamp inline mr-2" />
            </a>
            <h1 className="font-display text-xl uppercase">AI Studio</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("chat")}
              className={`px-3 py-1 font-label text-label border-[2px] border-ink ${activeTab === "chat" ? "bg-ink text-paper" : "bg-paper text-ink"}`}
            >
              <Bot size={14} className="inline mr-1" /> AI Chat
            </button>
            <button
              onClick={() => setActiveTab("train")}
              className={`px-3 py-1 font-label text-label border-[2px] border-ink ${activeTab === "train" ? "bg-ink text-paper" : "bg-paper text-ink"}`}
            >
              <BarChart3 size={14} className="inline mr-1" /> Training
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left: Chat / Training */}
          <div className="flex w-[45%] flex-col border-r-[3px] border-ink">
            {activeTab === "chat" ? (
              <>
                {/* Subject Setup */}
                <div className="border-b-[3px] border-ink p-3 grid gap-2">
                  <div className="flex gap-2">
                    <input
                      placeholder="Subject"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="flex-1 border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-xs text-ink outline-none"
                    />
                    <input
                      placeholder="Topic (optional)"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      className="flex-1 border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-xs text-ink outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
                      className="border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-xs text-ink outline-none"
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                      <option value="mixed">Mixed</option>
                    </select>
                    <input
                      type="number"
                      value={questionCount}
                      onChange={(e) => setQuestionCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                      className="w-14 border-[2px] border-ink bg-paper-2 px-2 py-1 font-mono text-xs text-ink outline-none text-center"
                    />
                    <Button variant="primary" onClick={handleGenerateQuestions} disabled={chatLoading || !subject.trim()} className="text-xs">
                      {chatLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      Generate
                    </Button>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="flex-1 overflow-y-auto p-3 grid gap-3 content-start">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-10">
                      <Bot size={32} className="text-graphite/30 mx-auto mb-3" />
                      <p className="font-body text-sm text-graphite">Set a subject above and click Generate, or start typing a message.</p>
                    </div>
                  )}
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] border-[2px] border-ink p-2 ${msg.role === "user" ? "bg-ink text-paper" : "bg-paper text-ink"}`}>
                        <p className="font-body text-xs whitespace-pre-wrap">{msg.content}</p>
                        {msg.questions && (
                          <div className="mt-2 border-t-[2px] border-ink/30 pt-2">
                            <span className="font-label text-[10px] text-ledger">{msg.questions.length} question(s)</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {msg.questions.map((q, qi) => (
                                <span key={qi} className="chip !text-[10px] !border-[1px]">{QUESTION_TYPE_LABELS[q.type]?.split(" ")[0]} - {q.title.slice(0, 15)}</span>
                              ))}
                            </div>
                            <Button variant="default" onClick={() => setMyQuestions((prev) => [...prev, ...msg.questions!])} className="mt-2 text-[10px] py-1 h-auto">
                              <Plus size={10} /> Add to list
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {chatError && <div className="border-[2px] border-stamp p-2 font-body text-[10px] text-stamp">{chatError}</div>}
                </div>

                {/* Chat Input */}
                <div className="border-t-[3px] border-ink p-2 flex gap-2">
                  <textarea
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleChatMessage(); } }}
                    placeholder="Ask for questions, explanations, or help..."
                    rows={2}
                    className="flex-1 border-[2px] border-ink bg-paper px-2 py-1 font-body text-xs text-ink outline-none resize-none"
                  />
                  <Button variant="primary" onClick={handleChatMessage} disabled={chatLoading || !chatInput.trim()} className="self-end">
                    {chatLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </Button>
                </div>
              </>
            ) : (
              <LiveTrainingDashboard />
            )}
          </div>

          {/* Right: Questions Panel */}
          <div className="flex w-[55%] flex-col">
            <div className="border-b-[3px] border-ink px-4 py-3 flex items-center justify-between">
              <span className="font-label text-label text-graphite">
                My Questions ({myQuestions.length})
              </span>
              {myQuestions.length > 0 && (
                <Button variant="ghost" onClick={() => {
                  const blob = new Blob([JSON.stringify(myQuestions, null, 2)], { type: "application/json" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `questions-${Date.now()}.json`;
                  a.click();
                }} className="text-xs">
                  <FileText size={12} /> Export JSON
                </Button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4 grid gap-3 content-start">
              {myQuestions.length === 0 ? (
                <div className="text-center py-10">
                  <FileText size={32} className="text-graphite/30 mx-auto mb-3" />
                  <p className="font-body text-sm text-graphite">Use the AI Chat to generate questions. They'll appear here.</p>
                  {activeTab === "train" && (
                    <Button variant="default" onClick={() => setActiveTab("chat")} className="mt-3 text-xs">
                      <Bot size={12} /> Go to AI Chat
                    </Button>
                  )}
                </div>
              ) : (
                myQuestions.map((q, idx) => (
                  <div key={q.id} className="card-brutal p-3 stamp-in">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono text-xs text-graphite">Q{idx + 1}.</span>
                          <span className="chip !text-[10px] !border-[1px]">{QUESTION_TYPE_LABELS[q.type]?.split(" ")[0] || q.type}</span>
                          <span className="font-mono text-xs text-graphite">{q.marks} marks</span>
                          <span className="chip !text-[10px] !border-[1px]">{q.topic}</span>
                        </div>
                        <h3 className="font-display text-sm text-ink">{q.title}</h3>
                        <p className="font-body text-xs text-graphite mt-1 line-clamp-2">{q.body}</p>
                        {q.options && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {q.options.map((opt, oi) => (
                              <span key={oi} className="chip !text-[10px] !border-[1px]">{opt}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => removeQuestion(q.id)} className="border-[2px] border-ink p-1 text-stamp hover:bg-stamp hover:text-paper shrink-0">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
