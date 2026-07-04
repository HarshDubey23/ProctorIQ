export type QuestionType = "mcq-single" | "mcq-multi" | "true-false" | "short-answer" | "long-answer" | "numerical" | "code";

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  body: string;
  marks: number;
  negativeMarks: number;
  topic: string;
  difficulty: "easy" | "medium" | "hard";
  options?: string[];
  correctAnswer?: string;
}

export interface PaperSection {
  id: string;
  title: string;
  questionIds: string[];
}

export interface Paper {
  id: string;
  title: string;
  subject: string;
  instructions: string;
  durationMinutes: number;
  startTime?: string;
  endTime?: string;
  sections: PaperSection[];
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  accessMode: "open" | "roster";
  roster?: string[];
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  "mcq-single": "MCQ (Single)",
  "mcq-multi": "MCQ (Multi)",
  "true-false": "True/False",
  "short-answer": "Short Answer",
  "long-answer": "Long/Essay",
  "numerical": "Numerical",
  "code": "Code",
};
