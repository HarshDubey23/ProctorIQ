import type { Question } from "./types";

// Starter question bank used by the manual paper builder browse panel.
export const MOCK_QUESTIONS: Question[] = [
  { id: "q1", type: "mcq-single", title: "TCP/IP Model Layers", body: "Which layer of the TCP/IP model is responsible for routing packets between networks?", marks: 2, negativeMarks: 0, topic: "Networking", difficulty: "medium", options: ["Application", "Transport", "Internet", "Network Access"], correctAnswer: "Internet" },
  { id: "q2", type: "mcq-single", title: "Big O Notation", body: "What is the time complexity of binary search on a sorted array?", marks: 2, negativeMarks: 0.5, topic: "Algorithms", difficulty: "easy", options: ["O(1)", "O(log n)", "O(n)", "O(n²)"], correctAnswer: "O(log n)" },
  { id: "q3", type: "true-false", title: "HTTP is Stateless", body: "HTTP is a stateless protocol.", marks: 1, negativeMarks: 0, topic: "Web", difficulty: "easy", options: ["True", "False"], correctAnswer: "True" },
  { id: "q4", type: "short-answer", title: "Define REST", body: "What does REST stand for in API design?", marks: 3, negativeMarks: 0, topic: "Web", difficulty: "medium" },
  { id: "q5", type: "code", title: "FizzBuzz", body: "Write a function that prints numbers 1 to n, replacing multiples of 3 with 'Fizz', multiples of 5 with 'Buzz', and multiples of both with 'FizzBuzz'.", marks: 5, negativeMarks: 0, topic: "Programming", difficulty: "easy" },
  { id: "q6", type: "long-answer", title: "Explain ACID Properties", body: "Explain the ACID properties of database transactions with a real-world example.", marks: 8, negativeMarks: 0, topic: "Databases", difficulty: "hard" },
  { id: "q7", type: "numerical", title: "Calculate IP Subnet", body: "How many usable host addresses are in a /26 subnet?", marks: 2, negativeMarks: 0.5, topic: "Networking", difficulty: "medium", correctAnswer: "62" },
  { id: "q8", type: "mcq-single", title: "SQL JOIN Types", body: "Which SQL JOIN returns all rows from the left table and matching rows from the right table?", marks: 2, negativeMarks: 0, topic: "Databases", difficulty: "easy", options: ["INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN"], correctAnswer: "LEFT JOIN" },
  { id: "q9", type: "mcq-multi", title: "Functional Programming", body: "Which of the following are functional programming concepts? (Select all that apply)", marks: 3, negativeMarks: 0.5, topic: "Programming", difficulty: "medium", options: ["Immutability", "Side Effects", "Pure Functions", "Shared State", "Recursion"], correctAnswer: "Immutability,Pure Functions,Recursion" },
  { id: "q10", type: "short-answer", title: "CSS Specificity", body: "Explain how CSS specificity determines which styles are applied when multiple rules target the same element.", marks: 4, negativeMarks: 0, topic: "Web", difficulty: "medium" },
  { id: "q11", type: "code", title: "Promise.all vs Sequential", body: "Write a function that fetches data from 3 URLs concurrently using Promise.all, handling errors gracefully.", marks: 6, negativeMarks: 0, topic: "Programming", difficulty: "medium" },
  { id: "q12", type: "true-false", title: "Symmetric Encryption", body: "In symmetric encryption, the same key is used for both encryption and decryption.", marks: 1, negativeMarks: 0, topic: "Security", difficulty: "easy", options: ["True", "False"], correctAnswer: "True" },
];
