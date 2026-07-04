import { useState, useCallback, useMemo, useRef } from "react";
import {
  ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Search, Stamp,
  Copy, ArrowRight, Download, FileText, Shuffle, Lock, Globe,
  Users, Clock, Calendar, GripVertical, Sparkles, Bot
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import type { Question, QuestionType, PaperSection } from "./types";
import { QUESTION_TYPE_LABELS } from "./types";
import { TemplateGallery } from "./TemplateGallery";
import { HFChatPanel } from "./HFChatPanel";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
const HOST_ACCOUNT_KEY = "proctoriq_host_account";

type BuilderStep = "build" | "publish";

interface HostAccount {
  host_id: string;
  host_token: string;
}

function generateId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function generateExamCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function getOrCreateHostAccount(): Promise<HostAccount> {
  const existing = localStorage.getItem(HOST_ACCOUNT_KEY);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as HostAccount;
      if (parsed.host_id && parsed.host_token) return parsed;
    } catch {
      localStorage.removeItem(HOST_ACCOUNT_KEY);
    }
  }

  const response = await fetch(`${API_BASE}/api/hosts`, { method: "POST" });
  if (!response.ok) throw new Error("Failed to create host account");
  const account = await response.json() as HostAccount;
  localStorage.setItem(HOST_ACCOUNT_KEY, JSON.stringify(account));
  return account;
}

const EMPTY_QUESTION: Question = {
  id: "", type: "mcq-single", title: "", body: "", marks: 2,
  negativeMarks: 0, topic: "General", difficulty: "medium",
  options: ["", ""], correctAnswer: "",
};

export function PaperBuilderPage() {
  const [step, setStep] = useState<BuilderStep>("build");
  const [title, setTitle] = useState("Midterm Examination");
  const [subject, setSubject] = useState("Computer Science");
  const [instructions, setInstructions] = useState("Answer all questions. Duration is 60 minutes.");
  const [duration, setDuration] = useState("60");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [topicFilter, setTopicFilter] = useState<string>("all");
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleOptions, setShuffleOptions] = useState(false);
  const [accessMode, setAccessMode] = useState<"open" | "roster">("open");
  const [rosterText, setRosterText] = useState("");
  const [sections, setSections] = useState<PaperSection[]>([
    { id: "sec_1", title: "Section A", questionIds: [] },
  ]);
  const [activeSection, setActiveSection] = useState("sec_1");
  const [showNewQuestion, setShowNewQuestion] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [newQuestion, setNewQuestion] = useState<Question>({ ...EMPTY_QUESTION, id: generateId() });
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [paperId, setPaperId] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const qrRef = useRef<HTMLDivElement>(null);

  const filteredQuestions = useMemo(() => {
    let qs = questionBank;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      qs = qs.filter((q_) => q_.title.toLowerCase().includes(q) || q_.topic.toLowerCase().includes(q));
    }
    if (difficultyFilter !== "all") qs = qs.filter((q_) => q_.difficulty === difficultyFilter);
    if (topicFilter !== "all") qs = qs.filter((q_) => q_.topic === topicFilter);
    return qs;
  }, [searchQuery, difficultyFilter, topicFilter, questionBank]);

  const activeSectionIds = useMemo(
    () => sections.find((s) => s.id === activeSection)?.questionIds ?? [],
    [sections, activeSection],
  );

  const selectedQuestions = useMemo(
    () => activeSectionIds.map((id) => questionBank.find((q) => q.id === id)).filter(Boolean) as Question[],
    [activeSectionIds, questionBank],
  );

  const allSelectedIds = useMemo(
    () => sections.flatMap((s) => s.questionIds),
    [sections],
  );

  const totalMarks = useMemo(
    () => selectedQuestions.reduce((sum, q) => sum + q.marks, 0),
    [selectedQuestions],
  );

  const allTotalMarks = useMemo(
    () => allSelectedIds.reduce((sum, id) => {
      const q = questionBank.find((qq) => qq.id === id);
      return sum + (q?.marks ?? 0);
    }, 0),
    [allSelectedIds, questionBank],
  );

  const allTotalQuestions = useMemo(() => allSelectedIds.length, [allSelectedIds]);

  const topics = useMemo(() => [...new Set(questionBank.map((q) => q.topic))], [questionBank]);

  const handleAddQuestion = useCallback((qId: string) => {
    setSections((prev) => prev.map((s) =>
      s.id === activeSection && !s.questionIds.includes(qId)
        ? { ...s, questionIds: [...s.questionIds, qId] }
        : s
    ));
  }, [activeSection]);

  const handleRemoveQuestion = useCallback((qId: string) => {
    setSections((prev) => prev.map((s) =>
      s.id === activeSection
        ? { ...s, questionIds: s.questionIds.filter((i) => i !== qId) }
        : s
    ));
  }, [activeSection]);

  const handleMoveUp = useCallback((qId: string) => {
    setSections((prev) => prev.map((s) => {
      if (s.id !== activeSection) return s;
      const idx = s.questionIds.indexOf(qId);
      if (idx <= 0) return s;
      const next = [...s.questionIds];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return { ...s, questionIds: next };
    }));
  }, [activeSection]);

  const handleMoveDown = useCallback((qId: string) => {
    setSections((prev) => prev.map((s) => {
      if (s.id !== activeSection) return s;
      const idx = s.questionIds.indexOf(qId);
      if (idx === -1 || idx >= s.questionIds.length - 1) return s;
      const next = [...s.questionIds];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return { ...s, questionIds: next };
    }));
  }, [activeSection]);

  const handleCreateSection = useCallback(() => {
    const id = `sec_${Date.now()}`;
    setSections((prev) => [...prev, { id, title: `Section ${String.fromCharCode(65 + prev.length)}`, questionIds: [] }]);
    setActiveSection(id);
  }, []);

  const handleRenameSection = useCallback((secId: string, newTitle: string) => {
    setSections((prev) => prev.map((s) => s.id === secId ? { ...s, title: newTitle } : s));
  }, []);

  const handleDeleteSection = useCallback((secId: string) => {
    setSections((prev) => {
      const filtered = prev.filter((s) => s.id !== secId);
      if (activeSection === secId && filtered.length > 0) setActiveSection(filtered[0].id);
      return filtered;
    });
  }, [activeSection]);

  const handleAIDraft = useCallback((questions: Question[]) => {
    setQuestionBank((prev) => [...prev, ...questions]);
    for (const q of questions) {
      handleAddQuestion(q.id);
    }
  }, [handleAddQuestion]);

  const handleTemplateSelect = useCallback((questions: Question[]) => {
    setQuestionBank((prev) => [...prev, ...questions]);
    for (const q of questions) {
      handleAddQuestion(q.id);
    }
    setShowTemplates(false);
  }, [handleAddQuestion]);

  const handleCreateQuestion = useCallback(() => {
    if (!newQuestion.title.trim()) return;
    const q: Question = { ...newQuestion, id: generateId() };
    setQuestionBank((prev) => [...prev, q]);
    handleAddQuestion(q.id);
    setNewQuestion({ ...EMPTY_QUESTION, id: generateId() });
    setShowNewQuestion(false);
  }, [newQuestion, handleAddQuestion]);

  const handlePublish = useCallback(async () => {
    const payload = {
      title,
      subject,
      instructions,
      duration_minutes: parseInt(duration) || 60,
      shuffle_questions: shuffleQuestions,
      shuffle_options: shuffleOptions,
      questions: questionBank.map(q => ({
        id: q.id, type: q.type, title: q.title, body: q.body,
        marks: q.marks, negative_marks: q.negativeMarks,
        topic: q.topic, difficulty: q.difficulty,
        options: q.options, correct_answer: q.correctAnswer,
      })),
      sections: sections.map(s => ({ id: s.id, title: s.title, question_ids: s.questionIds })),
    };
    try {
      const account = await getOrCreateHostAccount();
      const resp = await fetch(`${API_BASE}/api/papers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Host-Token": account.host_token },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) throw new Error("Failed to publish paper");
      const paper = await resp.json();
      const hostToken = account.host_token;
      localStorage.setItem(`paper_token_${paper.id}`, paper.host_token);
      const code = generateExamCode();
      sessionStorage.setItem("exam_code", code);
      sessionStorage.setItem("paper_id", paper.id);
      setPaperId(paper.id);
      setHostToken(hostToken);
      setStep("publish");
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Failed to publish");
    }
  }, [title, subject, instructions, duration, shuffleQuestions, shuffleOptions, sections, questionBank]);

  const examCode = useMemo(() => sessionStorage.getItem("exam_code") ?? generateExamCode(), [step]);
  const seshPaperId = useMemo(() => sessionStorage.getItem("paper_id"), [step]);
  const displayPaperId = paperId || seshPaperId || "";
  const hostPageUrl = useMemo(() => displayPaperId ? `/host` : `/builder`, [displayPaperId]);

  const handleDownloadQR = useCallback(() => {
    const svgEl = qrRef.current?.querySelector("svg");
    if (!svgEl) return;
    const svgData = new XMLSerializer().serializeToString(svgEl);
    const canvas = document.createElement("canvas");
    canvas.width = 600;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      ctx.fillStyle = "#F4F1EA";
      ctx.fillRect(0, 0, 600, 600);
      ctx.drawImage(img, 50, 50, 500, 500);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `exam-${examCode}-qr.png`;
      a.click();
    };
    img.src = url;
  }, [examCode]);

  // ===== BUILD STEP =====
  if (step === "build") {
    return (
      <main className="min-h-screen bg-paper text-ink">
        <div className="mx-auto flex h-screen max-w-[1500px] flex-col">
          {/* TOP BAR */}
          <div className="flex items-center justify-between border-b-[3px] border-ink px-6 py-3">
            <div className="flex items-center gap-4">
              <a href="/" className="text-graphite hover:text-ink"><ArrowLeft size={20} /></a>
              <Stamp size={20} className="text-stamp" />
              <h1 className="font-display text-xl uppercase">Paper Builder</h1>
            </div>
            <div className="flex items-center gap-3">
              <a href="/studio" className="flex items-center gap-1 border-[2px] border-ink px-2 py-1 font-label text-label text-ink hover:bg-ink hover:text-paper">
                <Bot size={14} /> AI Studio
              </a>
              <span className="font-mono text-sm text-graphite">
                {allTotalQuestions} questions &middot; {allTotalMarks} marks
              </span>
              <Button variant="primary" onClick={handlePublish} disabled={allTotalQuestions === 0}>
                <Stamp size={16} /> Publish Exam
              </Button>
            </div>
          </div>

          {/* THREE-COLUMN LAYOUT */}
          <div className="flex flex-1 overflow-hidden">
            {/* ===== LEFT: Question Bank ===== */}
            <div className="flex w-[320px] flex-col border-r-[3px] border-ink bg-paper-2">
              <div className="flex items-center justify-between border-b-[3px] border-ink p-3">
                <span className="font-label text-label text-graphite">Question Bank</span>
                <button
                  onClick={() => { setShowNewQuestion(true); setNewQuestion({ ...EMPTY_QUESTION, id: generateId() }); }}
                  className="flex items-center gap-1 border-[2px] border-ink px-2 py-0.5 font-label text-label text-ink hover:bg-ink hover:text-paper"
                  aria-label="Create new question"
                >
                  <Plus size={12} /> New
                </button>
              </div>

              {/* AI Chat + Templates toggle */}
              <div className="border-b-[3px] border-ink p-3 grid gap-2">
                <div className="flex gap-2">
                  <button onClick={() => { setShowChat((p) => !p); setShowTemplates(false); }}
                    className={`flex items-center gap-1 flex-1 justify-center border-[2px] border-ink px-2 py-1 font-label text-label ${showChat ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-paper-2'}`}>
                    <Bot size={12} /> AI Chat
                  </button>
                  <button onClick={() => { setShowTemplates((p) => !p); setShowChat(false); }}
                    className={`flex items-center gap-1 flex-1 justify-center border-[2px] border-ink px-2 py-1 font-label text-label ${showTemplates ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-paper-2'}`}>
                    <FileText size={12} /> Templates
                  </button>
                </div>
                {showChat && <HFChatPanel onAddQuestions={handleAIDraft} paperContext={questionBank} />}
                {showTemplates && <TemplateGallery onSelectTemplate={handleTemplateSelect} />}
              </div>

              {/* Filters */}
              <div className="border-b-[3px] border-ink p-3 grid gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-graphite" />
                  <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search..." aria-label="Search questions"
                    className="w-full border-[2px] border-ink bg-paper px-7 py-1.5 font-body text-xs text-ink outline-none placeholder:text-graphite" />
                </div>
                <div className="flex gap-2">
                  <select value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)}
                    className="flex-1 border-[2px] border-ink bg-paper px-2 py-1 font-body text-xs text-ink outline-none" aria-label="Filter by difficulty">
                    <option value="all">All Difficulty</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)}
                    className="flex-1 border-[2px] border-ink bg-paper px-2 py-1 font-body text-xs text-ink outline-none" aria-label="Filter by topic">
                    <option value="all">All Topics</option>
                    {topics.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Question list */}
              <div className="flex-1 overflow-y-auto">
                {showNewQuestion && (
                  <div className="border-b-[2px] border-stamp bg-paper p-3">
                    <div className="grid gap-2">
                      <select value={newQuestion.type} onChange={(e) => setNewQuestion((p) => ({ ...p, type: e.target.value as QuestionType }))}
                        className="border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-xs text-ink outline-none" aria-label="Question type">
                        {Object.entries(QUESTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                      <input type="text" value={newQuestion.title} onChange={(e) => setNewQuestion((p) => ({ ...p, title: e.target.value }))}
                        placeholder="Question title" aria-label="Question title"
                        className="border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-xs text-ink outline-none" />
                      <textarea value={newQuestion.body} onChange={(e) => setNewQuestion((p) => ({ ...p, body: e.target.value }))}
                        placeholder="Question body" rows={3} aria-label="Question body"
                        className="border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-xs text-ink outline-none resize-none" />
                      <div className="flex gap-2">
                        <input type="number" value={newQuestion.marks} onChange={(e) => setNewQuestion((p) => ({ ...p, marks: parseInt(e.target.value) || 0 }))}
                          placeholder="Marks" aria-label="Marks"
                          className="w-16 border-[2px] border-ink bg-paper-2 px-2 py-1 font-mono text-xs text-ink outline-none" />
                        <select value={newQuestion.difficulty} onChange={(e) => setNewQuestion((p) => ({ ...p, difficulty: e.target.value as "easy" | "medium" | "hard" }))}
                          className="flex-1 border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-xs text-ink outline-none" aria-label="Difficulty">
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                        <input type="text" value={newQuestion.topic} onChange={(e) => setNewQuestion((p) => ({ ...p, topic: e.target.value }))}
                          placeholder="Topic" aria-label="Topic"
                          className="flex-1 border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-xs text-ink outline-none" />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="primary" onClick={handleCreateQuestion} className="flex-1 text-xs py-1.5">
                          <Plus size={12} /> Add
                        </Button>
                        <Button variant="ghost" onClick={() => setShowNewQuestion(false)} className="text-xs py-1.5">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                {filteredQuestions.length === 0 && !showNewQuestion && (
                  <div className="p-6 text-center">
                    <p className="font-body text-xs text-graphite mb-3">
                      No questions yet. Create one or use AI Chat to generate questions.
                    </p>
                    <div className="flex gap-2 justify-center">
                      <Button variant="default" onClick={() => { setShowNewQuestion(true); setNewQuestion({ ...EMPTY_QUESTION, id: generateId() }); }} className="text-xs">
                        <Plus size={12} /> Create Question
                      </Button>
                      <Button variant="ghost" onClick={() => { setShowChat((p) => !p); setShowTemplates(false); }} className="text-xs">
                        <Sparkles size={12} /> AI Chat
                      </Button>
                    </div>
                  </div>
                )}
                {filteredQuestions.map((q) => {
                  const isAdded = allSelectedIds.includes(q.id);
                  return (
                    <div key={q.id}
                      className={`flex items-center gap-2 border-b-[2px] border-ink p-3 cursor-pointer hover:bg-paper ${isAdded ? "bg-paper/50" : ""}`}
                      onClick={() => isAdded ? handleRemoveQuestion(q.id) : handleAddQuestion(q.id)}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="chip !text-[10px] !border-[1px]">{QUESTION_TYPE_LABELS[q.type].split(" ")[0]}</span>
                          <span className="font-body text-xs text-ink truncate">{q.title}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-xs text-graphite">{q.marks} marks</span>
                          <span className="chip !text-[10px] !border-[1px]">{q.difficulty}</span>
                          {q.negativeMarks > 0 && <span className="chip !text-[10px] !border-[1px] border-stamp text-stamp">-{q.negativeMarks}</span>}
                        </div>
                      </div>
                      {isAdded ? (
                        <span className="font-mono text-xs text-ledger">Added</span>
                      ) : (
                        <Plus size={16} className="text-graphite shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ===== CENTER: Paper Canvas ===== */}
            <div className="flex flex-1 flex-col">
              {/* Paper metadata bar */}
              <div className="border-b-[3px] border-ink p-3 grid gap-2 md:flex md:items-center md:gap-4">
                <label className="flex items-center gap-2">
                  <span className="font-label text-label text-graphite">Title</span>
                  <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                    className="border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-sm text-ink outline-none w-40" aria-label="Paper title" />
                </label>
                <label className="flex items-center gap-2">
                  <span className="font-label text-label text-graphite">Subject</span>
                  <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                    className="border-[2px] border-ink bg-paper-2 px-2 py-1 font-body text-sm text-ink outline-none w-36" aria-label="Subject" />
                </label>
                <label className="flex items-center gap-2">
                  <span className="font-label text-label text-graphite">Duration</span>
                  <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)}
                    className="border-[2px] border-ink bg-paper-2 px-2 py-1 font-mono text-sm text-ink outline-none w-14" min={1} aria-label="Duration in minutes" />
                  <span className="font-body text-xs text-graphite">min</span>
                </label>
              </div>

              {/* Advanced settings */}
              <div className="border-b-[3px] border-ink bg-paper-2 px-3 py-2 grid gap-2 md:flex md:items-center md:gap-6">
                <label className="flex items-center gap-2 text-xs">
                  <Shuffle size={12} className="text-graphite" />
                  <span className="font-body text-graphite">Shuffle questions</span>
                  <input type="checkbox" checked={shuffleQuestions} onChange={() => setShuffleQuestions((p) => !p)}
                    className="border-[2px] border-ink" />
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Shuffle size={12} className="text-graphite" />
                  <span className="font-body text-graphite">Shuffle options</span>
                  <input type="checkbox" checked={shuffleOptions} onChange={() => setShuffleOptions((p) => !p)}
                    className="border-[2px] border-ink" />
                </label>
                <label className="flex items-center gap-2 text-xs">
                  {accessMode === "open" ? <Globe size={12} className="text-ledger" /> : <Lock size={12} className="text-stamp" />}
                  <span className="font-body text-graphite">Access</span>
                  <select value={accessMode} onChange={(e) => setAccessMode(e.target.value as "open" | "roster")}
                    className="border-[2px] border-ink bg-paper px-1 py-0.5 font-body text-xs text-ink outline-none">
                    <option value="open">Open link</option>
                    <option value="roster">Roster-restricted</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Calendar size={12} className="text-graphite" />
                  <span className="font-body text-graphite">Start</span>
                  <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                    className="border-[2px] border-ink bg-paper px-1 py-0.5 font-mono text-xs text-ink outline-none w-36" />
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Calendar size={12} className="text-graphite" />
                  <span className="font-body text-graphite">End</span>
                  <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                    className="border-[2px] border-ink bg-paper px-1 py-0.5 font-mono text-xs text-ink outline-none w-36" />
                </label>
              </div>

              {/* Section tabs + instructions */}
              <div className="border-b-[3px] border-ink px-3 py-2">
                <div className="flex items-center gap-2 mb-2">
                  {sections.map((sec) => (
                    <button key={sec.id}
                      onClick={() => setActiveSection(sec.id)}
                      className={`px-3 py-1 font-label text-label ${
                        sec.id === activeSection
                          ? "bg-ink text-paper border-[2px] border-ink"
                          : "bg-paper-2 text-ink border-[2px] border-ink hover:bg-paper"
                      }`}>
                      {sec.title}
                    </button>
                  ))}
                  <button onClick={handleCreateSection}
                    className="px-2 py-1 border-[2px] border-ink bg-paper text-graphite hover:text-ink"
                    aria-label="Add section">
                    <Plus size={14} />
                  </button>
                  {activeSection !== sections[0]?.id && (
                    <button onClick={() => handleDeleteSection(activeSection)}
                      className="px-2 py-1 border-[2px] border-ink bg-paper text-stamp"
                      aria-label="Delete section">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <FileText size={12} className="text-graphite shrink-0" />
                  <input type="text" value={sections.find((s) => s.id === activeSection)?.title ?? ""}
                    onChange={(e) => handleRenameSection(activeSection, e.target.value)}
                    className="border-[2px] border-ink bg-paper-2 px-2 py-0.5 font-body text-xs text-ink outline-none w-32"
                    aria-label="Section name" />
                  <span className="font-mono text-xs text-graphite">
                    {selectedQuestions.length} questions &middot; {totalMarks} marks
                  </span>
                </div>
              </div>

              {/* Instructions */}
              <div className="border-b-[3px] border-ink px-3 py-2">
                <label className="flex items-center gap-2">
                  <FileText size={12} className="text-graphite shrink-0" />
                  <span className="font-label text-label text-graphite shrink-0">Instructions</span>
                  <input type="text" value={instructions} onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Exam instructions for students..." aria-label="Exam instructions"
                    className="flex-1 border-[2px] border-ink bg-paper-2 px-2 py-0.5 font-body text-xs text-ink outline-none" />
                </label>
              </div>

              {/* Roster input */}
              {accessMode === "roster" && (
                <div className="border-b-[3px] border-ink bg-paper-2 px-3 py-2">
                  <label className="flex items-start gap-2">
                    <Users size={12} className="text-graphite shrink-0 mt-1" />
                    <div className="flex-1">
                      <span className="font-label text-label text-graphite block mb-1">Approved emails / roll numbers (one per line)</span>
                      <textarea value={rosterText} onChange={(e) => setRosterText(e.target.value)}
                        rows={3} placeholder="student1@example.com&#10;student2@example.com&#10;ROLL123"
                        className="w-full border-[2px] border-ink bg-paper px-2 py-1 font-body text-xs text-ink outline-none resize-none" />
                    </div>
                  </label>
                </div>
              )}

              {/* Question canvas */}
              <div className="flex-1 overflow-y-auto p-4 bg-paper-2/30">
                {selectedQuestions.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center max-w-sm">
                      <FileText size={32} className="text-graphite/40 mx-auto mb-3" />
                      <p className="font-body text-sm text-graphite">
                        Create questions in the left panel, then they will appear here.
                      </p>
                      <div className="flex gap-2 justify-center mt-3">
                        <Button variant="default" onClick={() => { setShowNewQuestion(true); setNewQuestion({ ...EMPTY_QUESTION, id: generateId() }); }} className="text-xs">
                          <Plus size={12} /> Create Question
                        </Button>
                      <Button variant="ghost" onClick={() => { setShowChat((p) => !p); setShowTemplates(false); }} className="text-xs">
                        <Sparkles size={12} /> AI Chat
                      </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {selectedQuestions.map((q, idx) => (
                      <div key={q.id} className="card-brutal p-4 stamp-in">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="flex items-center gap-1 text-graphite">
                                <GripVertical size={14} className="cursor-grab" />
                                <span className="font-mono text-xs">Q{idx + 1}.</span>
                              </span>
                              <span className="chip !text-[10px] !border-[1px]">{QUESTION_TYPE_LABELS[q.type]}</span>
                              <span className="font-mono text-xs text-graphite">{q.marks} marks</span>
                              {q.negativeMarks > 0 && (
                                <span className="chip !text-[10px] !border-[1px] border-stamp text-stamp">-{q.negativeMarks}</span>
                              )}
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
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => handleMoveUp(q.id)} className="border-[2px] border-ink p-1 text-graphite hover:text-ink" aria-label="Move up"><ChevronUp size={14} /></button>
                            <button onClick={() => handleMoveDown(q.id)} className="border-[2px] border-ink p-1 text-graphite hover:text-ink" aria-label="Move down"><ChevronDown size={14} /></button>
                            <button onClick={() => handleRemoveQuestion(q.id)} className="border-[2px] border-ink p-1 text-stamp hover:bg-stamp hover:text-paper" aria-label="Remove"><Trash2 size={14} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ===== RIGHT: Mark Summary ===== */}
            <div className="flex w-[240px] flex-col border-l-[3px] border-ink bg-paper-2">
              <div className="border-b-[3px] border-ink p-3">
                <span className="font-label text-label text-graphite">Summary</span>
              </div>
              <div className="flex-1 overflow-y-auto p-3 grid gap-3 content-start">
                <div className="border-[2px] border-ink bg-paper p-3">
                  <span className="font-label text-label text-graphite block">Total Marks</span>
                  <span className="font-mono text-data-lg font-bold text-ink">{allTotalMarks}</span>
                </div>
                <div className="border-[2px] border-ink bg-paper p-3">
                  <span className="font-label text-label text-graphite block">Questions</span>
                  <span className="font-mono text-data-lg font-bold text-ink">{allTotalQuestions}</span>
                </div>
                <div className="border-[2px] border-ink bg-paper p-3">
                  <span className="font-label text-label text-graphite block">Sections</span>
                  <span className="font-mono text-data-lg font-bold text-ink">{sections.length}</span>
                </div>
                <div className="border-[2px] border-ink bg-paper p-3">
                  <span className="font-label text-label text-graphite block">Duration</span>
                  <span className="font-mono text-data-lg font-bold text-ink">{duration || "—"}</span>
                </div>
                <div className="border-[2px] border-ink bg-paper p-3">
                  <span className="font-label text-label text-graphite block">Avg Marks</span>
                  <span className="font-mono text-data-lg font-bold text-ink">
                    {allTotalQuestions > 0 ? (allTotalMarks / allTotalQuestions).toFixed(1) : "0"}
                  </span>
                </div>

                {/* By section */}
                {sections.length > 0 && (
                  <div className="border-[2px] border-ink bg-paper p-3">
                    <span className="font-label text-label text-graphite block mb-2">By Section</span>
                    {sections.map((sec) => {
                      const qs = sec.questionIds.map((id) => questionBank.find((q) => q.id === id)).filter(Boolean) as Question[];
                      const marks = qs.reduce((s, q) => s + q.marks, 0);
                      return (
                        <div key={sec.id} className="flex items-center justify-between text-xs py-0.5">
                          <span className="font-body text-graphite truncate mr-2">{sec.title}</span>
                          <span className="font-mono text-ink shrink-0">{qs.length} Q / {marks}M</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* By type */}
                <div className="border-[2px] border-ink bg-paper p-3">
                  <span className="font-label text-label text-graphite block mb-2">By Type</span>
                  {(["mcq-single", "mcq-multi", "true-false", "short-answer", "numerical", "code", "long-answer"] as QuestionType[]).map((type) => {
                    const count = allSelectedIds.filter((id) => questionBank.find((q) => q.id === id)?.type === type).length;
                    if (count === 0) return null;
                    const label = QUESTION_TYPE_LABELS[type].split(" ")[0];
                    return (
                      <div key={type} className="flex items-center justify-between text-xs py-0.5">
                        <span className="font-body text-graphite">{label}</span>
                        <span className="font-mono text-ink">{count}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Access mode */}
                <div className="border-[2px] border-ink bg-paper p-3">
                  <div className="flex items-center gap-2 text-xs">
                    {accessMode === "open" ? <Globe size={12} className="text-ledger" /> : <Lock size={12} className="text-stamp" />}
                    <span className="font-body text-graphite">{accessMode === "open" ? "Open link" : "Roster"}</span>
                  </div>
                  {shuffleQuestions && <div className="flex items-center gap-1 text-xs mt-1"><Shuffle size={10} className="text-graphite" /><span className="font-body text-graphite">Shuffle Q</span></div>}
                  {shuffleOptions && <div className="flex items-center gap-1 text-xs mt-1"><Shuffle size={10} className="text-graphite" /><span className="font-body text-graphite">Shuffle options</span></div>}
                  {startTime && <div className="flex items-center gap-1 text-xs mt-1"><Clock size={10} className="text-graphite" /><span className="font-body text-graphite">Scheduled</span></div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  // ===== PUBLISH STEP =====
  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center p-6">
        <Card className="w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Stamp size={20} className="text-stamp" />
              <CardTitle>Exam Published</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            {/* Paper info */}
            <div className="w-full border-[3px] border-ink bg-paper-2 p-4 text-center">
              <span className="chip !text-[10px]">Paper ID</span>
              <div className="font-mono text-sm text-ink mt-1 select-all">{displayPaperId}</div>
              {hostToken && (
                <div className="mt-2 font-mono text-[10px] text-graphite break-all select-all">
                  Host token: {hostToken.slice(0, 16)}...
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button variant="default" onClick={handleDownloadQR} className="text-xs px-4">
                <Download size={14} /> Download PNG
              </Button>
              <Button variant="ghost" onClick={() => {
                const svg = qrRef.current?.querySelector("svg");
                if (svg) {
                  const data = new XMLSerializer().serializeToString(svg);
                  const a = document.createElement("a");
                  a.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(data);
                  a.download = `exam-${examCode}-qr.svg`;
                  a.click();
                }
              }} className="text-xs px-4">
                <Download size={14} /> SVG
              </Button>
            </div>

            {/* Exam details */}
            <div className="w-full border-[3px] border-ink bg-paper-2 p-4 grid gap-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-sm uppercase text-ink">{title}</span>
                <span className="chip !border-[1px]">{accessMode === "open" ? "Open" : "Roster"}</span>
              </div>
              <div className="font-mono text-xs text-graphite flex items-center gap-4">
                <span>{subject}</span>
                <span>{allTotalQuestions} questions</span>
                <span>{allTotalMarks} marks</span>
                <span>{duration} min</span>
              </div>
              {instructions && <p className="font-body text-xs text-graphite border-t-[2px] border-ink pt-2 mt-1">{instructions}</p>}
            </div>

            {/* Action */}
            <div className="flex w-full gap-3">
              <Button variant="primary" className="flex-1" onClick={() => { window.location.href = hostPageUrl; }}>
                <ArrowRight size={16} /> Go to Host Dashboard
              </Button>
              <Button variant="default" onClick={() => {
                const pid = displayPaperId;
                if (pid) navigator.clipboard.writeText(pid).catch(() => {});
              }}>
                <Copy size={16} /> Copy Paper ID
              </Button>
            </div>

            {publishError && (
              <div className="w-full border-[3px] border-stamp bg-paper-2 px-3 py-2 font-body text-xs text-stamp" role="alert">
                {publishError}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
