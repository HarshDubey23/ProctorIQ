import { useCallback } from "react";
import { FileText, Stamp } from "lucide-react";
import type { Question } from "./types";

interface Template {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  totalMarks: number;
  duration: number;
  questions: Question[];
}

const TEMPLATES: Template[] = [
  {
    id: "t1", title: "20-Q MCQ Quiz", description: "Standard multiple-choice assessment covering core concepts.", questionCount: 20, totalMarks: 40, duration: 30,
    questions: [
      { id: "tm1", type: "mcq-single", title: "Sample MCQ 1", body: "What is the capital of France?", marks: 2, negativeMarks: 0, topic: "General", difficulty: "easy", options: ["London", "Paris", "Berlin", "Madrid"], correctAnswer: "Paris" },
      { id: "tm2", type: "mcq-single", title: "Sample MCQ 2", body: "Which planet is known as the Red Planet?", marks: 2, negativeMarks: 0, topic: "Science", difficulty: "easy", options: ["Venus", "Mars", "Jupiter", "Saturn"], correctAnswer: "Mars" },
      { id: "tm3", type: "mcq-single", title: "Sample MCQ 3", body: "What is 5 + 7?", marks: 2, negativeMarks: 0, topic: "Math", difficulty: "easy", options: ["10", "11", "12", "13"], correctAnswer: "12" },
      { id: "tm4", type: "mcq-single", title: "Sample MCQ 4", body: "Which gas do plants absorb from the atmosphere?", marks: 2, negativeMarks: 0, topic: "Science", difficulty: "easy", options: ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"], correctAnswer: "Carbon Dioxide" },
      { id: "tm5", type: "mcq-single", title: "Sample MCQ 5", body: "What is the largest ocean on Earth?", marks: 2, negativeMarks: 0, topic: "Geography", difficulty: "easy", options: ["Atlantic", "Indian", "Arctic", "Pacific"], correctAnswer: "Pacific" },
    ],
  },
  {
    id: "t2", title: "Coding Test", description: "Programming-focused assessment with code questions and test cases.", questionCount: 10, totalMarks: 50, duration: 60,
    questions: [
      { id: "tc1", type: "code", title: "FizzBuzz", body: "Write a function that prints numbers 1 to n, replacing multiples of 3 with 'Fizz' and 5 with 'Buzz'.", marks: 5, negativeMarks: 0, topic: "Programming", difficulty: "easy" },
      { id: "tc2", type: "code", title: "Palindrome Check", body: "Write a function that checks if a given string is a palindrome.", marks: 5, negativeMarks: 0, topic: "Programming", difficulty: "easy" },
    ],
  },
  {
    id: "t3", title: "Viva-Style Long Answer", description: "Essay and long-format questions for oral-style examination.", questionCount: 5, totalMarks: 40, duration: 45,
    questions: [
      { id: "tv1", type: "long-answer", title: "Essay Question 1", body: "Discuss the impact of artificial intelligence on modern education.", marks: 8, negativeMarks: 0, topic: "General", difficulty: "medium" },
    ],
  },
];

interface TemplateGalleryProps {
  onSelectTemplate: (questions: Question[]) => void;
}

export function TemplateGallery({ onSelectTemplate }: TemplateGalleryProps) {
  const handleSelect = useCallback((template: Template) => {
    const questions = template.questions.map((q, i) => ({
      ...q,
      id: `tpl_${template.id}_${i}_${Date.now()}`,
    }));
    onSelectTemplate(questions);
  }, [onSelectTemplate]);

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-graphite" />
        <span className="font-label text-label text-graphite">Starter Templates</span>
      </div>
      {TEMPLATES.map((template) => (
        <div key={template.id} className="border-[3px] border-ink bg-paper p-4 hover:shadow-brutal-sm transition-shadow cursor-pointer"
          onClick={() => handleSelect(template)}
          role="button" tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSelect(template); }}
          aria-label={`Load template: ${template.title}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-display text-sm uppercase text-ink">{template.title}</span>
            <Stamp size={14} className="text-stamp" />
          </div>
          <p className="font-body text-xs text-graphite mb-2">{template.description}</p>
          <div className="flex items-center gap-3 font-mono text-[10px] text-graphite">
            <span>{template.questionCount} questions</span>
            <span>{template.totalMarks} marks</span>
            <span>{template.duration} min</span>
          </div>
        </div>
      ))}
      <p className="font-body text-[10px] text-graphite">Starter templates are bundled examples for faster paper setup.</p>
    </div>
  );
}
