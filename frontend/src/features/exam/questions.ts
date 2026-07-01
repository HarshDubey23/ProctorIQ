import type { ExamQuestion } from './types';

export const QUESTIONS: ExamQuestion[] = [
  {
    id: 1,
    topic: 'CS',
    question: 'What is the time complexity of binary search on a sorted array of size n?',
    options: ['O(n)', 'O(log n)', 'O(n²)', 'O(n log n)'],
    correctIndex: 1,
  },
  {
    id: 2,
    topic: 'CS',
    question: 'Which data structure operates on a Last-In-First-Out (LIFO) principle?',
    options: ['Queue', 'Stack', 'Array', 'Linked List'],
    correctIndex: 1,
  },
  {
    id: 3,
    topic: 'Aptitude',
    question: 'If 3x + 7 = 22, what is the value of x?',
    options: ['3', '5', '7', '9'],
    correctIndex: 1,
  },
  {
    id: 4,
    topic: 'Aptitude',
    question: 'A train 100 metres long passes a stationary pole in 5 seconds. What is its speed in m/s?',
    options: ['10 m/s', '15 m/s', '20 m/s', '25 m/s'],
    correctIndex: 2,
  },
  {
    id: 5,
    topic: 'Logic',
    question: 'All A are B. All B are C. Which conclusion must be true?',
    options: [
      'All C are A',
      'No A are C',
      'All A are C',
      'Some C are not B',
    ],
    correctIndex: 2,
  },
  {
    id: 6,
    topic: 'CS',
    question: 'What does the acronym SQL stand for?',
    options: [
      'Simple Query Language',
      'Structured Query Language',
      'Standard Query Logic',
      'Sequential Query Listing',
    ],
    correctIndex: 1,
  },
  {
    id: 7,
    topic: 'CS',
    question: 'Which of the following is NOT a fundamental principle of Object-Oriented Programming?',
    options: ['Encapsulation', 'Inheritance', 'Compilation', 'Polymorphism'],
    correctIndex: 2,
  },
  {
    id: 8,
    topic: 'Logic',
    question: 'What is the next number in the sequence? 2, 6, 18, 54, ?',
    options: ['108', '162', '144', '216'],
    correctIndex: 1,
  },
  {
    id: 9,
    topic: 'Aptitude',
    question: 'If 8 workers can build a wall in 12 days, how many workers are needed to build the same wall in 6 days?',
    options: ['12', '14', '16', '18'],
    correctIndex: 2,
  },
  {
    id: 10,
    topic: 'CS',
    question: 'Which HTML element is correct for creating a hyperlink?',
    options: [
      '<link url="...">text</link>',
      '<a href="...">text</a>',
      '<href url="...">text</href>',
      '<hyperlink url="...">text</hyperlink>',
    ],
    correctIndex: 1,
  },
];
