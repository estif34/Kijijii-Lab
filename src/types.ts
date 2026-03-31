export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  gradeLevel?: 'Primary' | 'Secondary' | 'University';
  points: number;
  createdAt: any;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string;
  lastMessageAt: any;
  createdAt: any;
}

export interface Message {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  content: string;
  imageUrl?: string;
  createdAt: any;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}
