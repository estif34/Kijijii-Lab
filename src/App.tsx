import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  firebaseUpdateProfile,
  collection,
  doc,
  setDoc,
  getDoc,
  addDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDocFromServer,
  handleFirestoreError,
  OperationType
} from './firebase';
import { UserProfile, ChatSession, Message, QuizQuestion } from './types';
import { getTutorResponse, generateQuiz } from './services/gemini';
import { cn, formatDate } from './lib/utils';
import { 
  Send, 
  Plus, 
  LogOut, 
  BookOpen, 
  Camera, 
  Brain, 
  ChevronRight, 
  User as UserIcon,
  MessageSquare,
  Trophy,
  Loader2,
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChat, setActiveChat] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizTopic, setQuizTopic] = useState('');
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [gradeLevel, setGradeLevel] = useState<'Primary' | 'Secondary' | 'University'>('Secondary');
  const [searchQuery, setSearchQuery] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedQuizAnswer, setSelectedQuizAnswer] = useState<number | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizStep, setQuizStep] = useState(0);
  const [showQuizResult, setShowQuizResult] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const filteredChats = chats.filter(chat => 
    chat.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setUser(userDoc.data() as UserProfile);
        } else {
          const newUser: UserProfile = {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || 'Student',
            email: firebaseUser.email || '',
            points: 0,
            createdAt: serverTimestamp(),
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
          setUser(newUser);
          setShowProfileSetup(true);
        }
      } else {
        setUser(null);
        setActiveChat(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      const q = query(
        collection(db, 'chats'),
        where('userId', '==', user.uid),
        orderBy('lastMessageAt', 'desc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const chatList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSession));
        setChats(chatList);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, 'chats');
      });
      return () => unsubscribe();
    }
  }, [user]);

  useEffect(() => {
    if (activeChat) {
      const q = query(
        collection(db, 'chats', activeChat.id, 'messages'),
        orderBy('createdAt', 'asc')
      );
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const msgList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Message));
        setMessages(msgList);
      }, (error) => {
        handleFirestoreError(error, OperationType.LIST, `chats/${activeChat.id}/messages`);
      });
      return () => unsubscribe();
    } else {
      setMessages([]);
    }
  }, [activeChat]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleLogin = async () => {
    try {
      setAuthError(null);
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Login failed', error);
      setAuthError(error.message);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    try {
      if (isSignUp) {
        if (password !== confirmPassword) {
          setAuthError("Passwords do not match!");
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Set a default display name if it's a new user
        await firebaseUpdateProfile(userCredential.user, {
          displayName: email.split('@')[0]
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error('Email auth failed', error);
      setAuthError(error.message);
    }
  };

  const handleLogout = () => signOut(auth);

  const createNewChat = async () => {
    if (!user) return;
    const newChat = {
      userId: user.uid,
      title: 'New STEM Risto',
      lastMessageAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    };
    try {
      const docRef = await addDoc(collection(db, 'chats'), newChat);
      setActiveChat({ id: docRef.id, ...newChat } as ChatSession);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'chats');
    }
  };

  const sendMessage = async (e?: React.FormEvent, customText?: string, image?: string) => {
    e?.preventDefault();
    const text = customText || inputText;
    const finalImage = image || uploadedImage;
    
    if ((!text.trim() && !finalImage) || isSending || !user || !activeChat) return;

    setIsSending(true);
    setErrorMessage(null);
    
    // Store values for potential retry before clearing
    const currentInput = inputText;
    const currentImage = uploadedImage;
    
    setInputText('');
    setUploadedImage(null);

    try {
      const userMsg: any = {
        chatId: activeChat.id,
        role: 'user' as const,
        content: text,
        createdAt: serverTimestamp(),
      };
      
      if (finalImage) {
        userMsg.imageUrl = finalImage;
      }

      try {
        await addDoc(collection(db, 'chats', activeChat.id, 'messages'), userMsg);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `chats/${activeChat.id}/messages`);
      }

      // Update chat title if it's the first message
      if (messages.length === 0) {
        const newTitle = text.slice(0, 30) + '...';
        try {
          await setDoc(doc(db, 'chats', activeChat.id), { title: newTitle }, { merge: true });
          setActiveChat({ ...activeChat, title: newTitle });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `chats/${activeChat.id}`);
        }
      }

      // Filter out the message we just added if it already appeared in the messages state
      // to avoid sending it twice to Gemini
      const history = messages
        .filter(m => m.content !== text || m.role !== 'user')
        .map(m => ({ role: m.role, content: m.content }));
        
      const response = await getTutorResponse(text, history, finalImage);

      const assistantMsg = {
        chatId: activeChat.id,
        role: 'assistant' as const,
        content: response,
        createdAt: serverTimestamp(),
      };
      
      try {
        await addDoc(collection(db, 'chats', activeChat.id, 'messages'), assistantMsg);
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `chats/${activeChat.id}/messages`);
      }
      
      try {
        await setDoc(doc(db, 'chats', activeChat.id), { lastMessageAt: serverTimestamp() }, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `chats/${activeChat.id}`);
      }
    } catch (error: any) {
      console.error('Failed to send message', error);
      // Restore input on failure
      setInputText(currentInput);
      setUploadedImage(currentImage);
      
      let displayError = "Sema msee, something went wrong. Tafadhali jaribu tena.";
      try {
        const parsedError = JSON.parse(error.message);
        if (parsedError.error.includes('insufficient permissions')) {
          displayError = "Access denied. Please check your permissions or try logging in again.";
        }
      } catch {
        displayError = error.message || displayError;
      }
      setErrorMessage(displayError);
    } finally {
      setIsSending(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const startQuiz = async () => {
    if (!activeChat || messages.length < 2) return;
    setQuizTopic(activeChat.title);
    setIsSending(true);
    setQuizStep(0);
    setQuizScore(0);
    setSelectedQuizAnswer(null);
    setShowQuizResult(false);
    try {
      const questions = await generateQuiz(activeChat.title);
      setQuizQuestions(questions);
      setShowQuiz(true);
    } catch (error) {
      console.error('Quiz generation failed', error);
    } finally {
      setIsSending(false);
    }
  };

  const handleQuizAnswer = (optIdx: number) => {
    if (selectedQuizAnswer !== null) return;
    setSelectedQuizAnswer(optIdx);
    const isCorrect = quizQuestions[quizStep].options[optIdx] === quizQuestions[quizStep].correctAnswer;
    if (isCorrect) {
      setQuizScore(prev => prev + 1);
      // Update user points in Firestore
      if (user) {
        setDoc(doc(db, 'users', user.uid), { points: user.points + 50 }, { merge: true });
        setUser({ ...user, points: user.points + 50 });
      }
    }
  };

  const nextQuizStep = () => {
    if (quizStep < quizQuestions.length - 1) {
      setQuizStep(prev => prev + 1);
      setSelectedQuizAnswer(null);
    } else {
      setShowQuizResult(true);
    }
  };

  const updateProfile = async () => {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid), { gradeLevel }, { merge: true });
    setUser({ ...user, gradeLevel });
    setShowProfileSetup(false);
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#f5f5f0]">
        <Loader2 className="w-12 h-12 animate-spin text-[#5A5A40]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#f5f5f0] p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-[32px] shadow-xl text-center border border-[#006600]/10"
        >
          <div className="w-20 h-20 bg-[#006600] rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <Brain className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-4xl font-serif font-bold text-[#1a1a1a] mb-4">Kijiji Lab</h1>
          <p className="text-[#1a1a1a]/70 mb-8 font-serif italic">
            "Sema msee! Karibu kwa Kijiji Lab. Let's master STEM together using local ristos."
          </p>

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            <div className="text-left">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1a1a1a]/40 mb-1 ml-2">Email Address</label>
              <input 
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="msee@kijiji.com"
                required
                className="w-full px-6 py-4 rounded-2xl bg-[#f5f5f0] border-none focus:ring-2 focus:ring-[#006600] transition-all"
              />
            </div>
            <div className="text-left">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#1a1a1a]/40 mb-1 ml-2">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-6 py-4 rounded-2xl bg-[#f5f5f0] border-none focus:ring-2 focus:ring-[#006600] transition-all"
              />
            </div>

            {isSignUp && (
              <div className="text-left">
                <label className="block text-xs font-bold uppercase tracking-wider text-[#1a1a1a]/40 mb-1 ml-2">Confirm Password</label>
                <input 
                  type="password" 
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-6 py-4 rounded-2xl bg-[#f5f5f0] border-none focus:ring-2 focus:ring-[#006600] transition-all"
                />
              </div>
            )}

            {authError && (
              <p className="text-xs text-red-500 bg-red-50 p-3 rounded-xl border border-red-100">
                {authError}
              </p>
            )}

            <button 
              type="submit"
              className="w-full bg-[#006600] text-white py-4 rounded-full font-bold hover:bg-[#005500] transition-all hover:shadow-xl active:scale-95"
            >
              {isSignUp ? 'Join the Kijiji' : 'Sign In'}
            </button>
          </form>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#1a1a1a]/10"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white px-4 text-[#1a1a1a]/40 font-bold">Or continue with</span>
            </div>
          </div>

          <button 
            onClick={handleLogin}
            className="w-full bg-white border-2 border-[#1a1a1a]/10 text-[#1a1a1a] py-4 rounded-full font-bold flex items-center justify-center gap-3 hover:bg-[#f5f5f0] transition-all active:scale-95 mb-6"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
            Sign in with Google
          </button>

          <p className="text-sm text-[#1a1a1a]/60">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button 
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-[#BB0000] font-bold hover:underline"
            >
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex bg-[#f5f5f0] overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r border-[#006600]/10 flex flex-col hidden md:flex">
        <div className="p-6 border-bottom border-[#006600]/10">
          <div className="flex items-center gap-3 mb-8 group cursor-pointer">
            <div className="w-12 h-12 bg-[#006600] rounded-[18px] flex items-center justify-center shadow-lg group-hover:rotate-6 transition-transform">
              <Brain className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-serif font-bold text-[#1a1a1a] leading-none">Kijiji Lab</h1>
              <p className="text-[10px] text-[#006600]/60 uppercase tracking-[0.2em] font-bold mt-1">STEM Tutor</p>
            </div>
          </div>
          
          <button 
            onClick={createNewChat}
            className="w-full bg-[#BB0000] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 hover:bg-[#990000] transition-all hover:shadow-xl active:scale-95 mb-6"
          >
            <Plus className="w-5 h-5" />
            New Risto
          </button>

          <div className="relative">
            <input 
              type="text"
              placeholder="Search ristos..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#f5f5f0] border-none rounded-xl py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-[#006600]/20 text-[#1a1a1a] placeholder-[#006600]/40"
            />
            <MessageSquare className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#006600]/40" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {filteredChats.map((chat) => (
            <button
              key={chat.id}
              onClick={() => setActiveChat(chat)}
              className={cn(
                "w-full text-left p-4 rounded-2xl transition-all flex items-start gap-4 group",
                activeChat?.id === chat.id 
                  ? "bg-[#006600] text-white shadow-lg translate-x-1" 
                  : "hover:bg-[#f5f5f0] text-[#1a1a1a]"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                activeChat?.id === chat.id ? "bg-white/10" : "bg-[#006600]/5 group-hover:bg-[#006600]/10"
              )}>
                <MessageSquare className={cn("w-5 h-5", activeChat?.id === chat.id ? "text-white" : "text-[#006600]")} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold truncate text-sm">{chat.title}</p>
                <p className={cn("text-[10px] mt-1 font-medium", activeChat?.id === chat.id ? "text-white/60" : "text-[#5A5A40]/60")}>
                  {formatDate(chat.lastMessageAt)}
                </p>
              </div>
            </button>
          ))}
        </div>

        <div className="p-6 border-t border-[#006600]/10 bg-[#f5f5f0]/30">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-[#006600]/5 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#006600]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#006600]/60">Daily Progress</span>
              </div>
              <span className="text-xs font-bold text-[#006600]">{user.points} XP</span>
            </div>
            <div className="h-1.5 w-full bg-[#f5f5f0] rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min((user.points / 1000) * 100, 100)}%` }}
                className="h-full bg-[#006600]"
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#006600] rounded-full flex items-center justify-center text-white font-bold text-sm">
                {user.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#1a1a1a] truncate">{user.name}</p>
                <p className="text-[10px] text-[#006600]/60 font-medium">{user.gradeLevel} School</p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-[#BB0000]/10 rounded-lg transition-colors text-[#BB0000]/60 hover:text-[#BB0000]"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <header className="h-20 bg-white/80 backdrop-blur-md border-b border-[#006600]/10 flex items-center justify-between px-8 z-10">
              <div className="flex items-center gap-4">
                <div className="md:hidden">
                  <Brain className="w-8 h-8 text-[#006600]" />
                </div>
                <div>
                  <h2 className="font-serif font-bold text-[#1a1a1a]">{activeChat.title}</h2>
                  <p className="text-xs text-[#006600]/60 italic">Chatting with Mwalimu AI</p>
                </div>
              </div>
              <button 
                onClick={startQuiz}
                disabled={messages.length < 2 || isSending}
                className="bg-[#BB0000] text-white px-6 py-2 rounded-full text-sm font-bold hover:bg-[#990000] transition-all flex items-center gap-2 disabled:opacity-50 shadow-md active:scale-95"
              >
                <Trophy className="w-4 h-4" />
                Take Quiz
              </button>
            </header>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-4 max-w-3xl",
                    msg.role === 'user' ? "ml-auto flex-row-reverse" : "mr-auto"
                  )}
                >
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                    msg.role === 'user' ? "bg-white border border-[#006600]/10" : "bg-[#006600]"
                  )}>
                    {msg.role === 'user' ? <UserIcon className="w-5 h-5 text-[#006600]" /> : <Brain className="w-5 h-5 text-white" />}
                  </div>
                  <div className={cn(
                    "p-6 rounded-[32px] shadow-sm relative group",
                    msg.role === 'user' 
                      ? "bg-white text-[#1a1a1a] rounded-tr-none border border-[#006600]/10" 
                      : "bg-[#006600]/5 text-[#1a1a1a] rounded-tl-none border border-[#006600]/5"
                  )}>
                    {msg.imageUrl && (
                      <div className="relative mb-4 group/img">
                        <img 
                          src={msg.imageUrl} 
                          alt="Homework" 
                          className="max-w-full h-auto rounded-2xl border border-[#006600]/10 shadow-md" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                           <button className="bg-white text-[#006600] p-2 rounded-full shadow-lg">
                             <Camera className="w-5 h-5" />
                           </button>
                        </div>
                      </div>
                    )}
                    <div className="prose prose-stone max-w-none prose-p:leading-relaxed prose-p:mb-4 last:prose-p:mb-0">
                      <Markdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>{msg.content}</Markdown>
                    </div>
                    {msg.role === 'assistant' && (
                      <div className="absolute -bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                        <button className="bg-white border border-[#006600]/10 p-2 rounded-full shadow-sm hover:bg-[#f5f5f0] text-[#006600]">
                          <CheckCircle2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
              {isSending && (
                <div className="flex gap-4 max-w-3xl">
                  <div className="w-10 h-10 rounded-full bg-[#006600] flex items-center justify-center shrink-0 animate-pulse">
                    <Brain className="w-5 h-5 text-white" />
                  </div>
                  <div className="p-6 rounded-[32px] bg-[#006600]/5 border border-[#006600]/5 flex items-center gap-2">
                    <div className="w-2 h-2 bg-[#006600]/40 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-[#006600]/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-[#006600]/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}

              {errorMessage && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 bg-[#BB0000]/10 border border-[#BB0000]/20 rounded-2xl text-[#BB0000] text-sm flex items-center gap-3 max-w-3xl mx-auto"
                >
                  <div className="w-8 h-8 bg-[#BB0000] rounded-lg flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4 text-white rotate-45" />
                  </div>
                  <p className="font-medium">{errorMessage}</p>
                  <button 
                    onClick={() => sendMessage()}
                    className="ml-auto px-4 py-1.5 bg-[#BB0000] text-white rounded-lg text-xs font-bold hover:bg-[#990000] transition-colors"
                  >
                    Retry
                  </button>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-8 bg-white/50 backdrop-blur-md border-t border-[#5A5A40]/10">
              <form onSubmit={sendMessage} className="max-w-4xl mx-auto relative">
                {uploadedImage && (
                  <div className="absolute bottom-full mb-4 left-0 p-2 bg-white rounded-2xl shadow-xl border border-[#5A5A40]/10 flex items-center gap-3">
                    <img src={uploadedImage} className="w-16 h-16 object-cover rounded-lg" alt="Preview" referrerPolicy="no-referrer" />
                    <button 
                      type="button"
                      onClick={() => setUploadedImage(null)}
                      className="p-1 hover:bg-[#f5f5f0] rounded-full text-[#5A5A40]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-4 bg-white p-2 rounded-full shadow-lg border-none pr-4">
                  <label className="p-3 hover:bg-[#f5f5f0] rounded-full cursor-pointer transition-colors text-[#006600]">
                    <Camera className="w-6 h-6" />
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  </label>
                  <input
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Uliza swali yako hapa..."
                    className="flex-1 bg-transparent border-none outline-none focus:ring-0 focus:outline-none text-[#1a1a1a] placeholder-[#006600]/40 py-4"
                  />
                  <button
                    type="submit"
                    disabled={(!inputText.trim() && !uploadedImage) || isSending}
                    className="bg-[#006600] text-white p-4 rounded-full hover:bg-[#005500] transition-all disabled:opacity-50 shadow-md active:scale-95"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white/30">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl w-full"
            >
              <div className="w-24 h-24 bg-white rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-xl border border-[#006600]/10 rotate-3 animate-slam-in">
                <BookOpen className="w-12 h-12 text-[#006600]" />
              </div>
              <h2 className="text-4xl font-serif font-bold text-[#1a1a1a] mb-4">Sema, {user.name.split(' ')[0]}!</h2>
              <p className="text-lg text-[#1a1a1a]/60 mb-12 font-serif italic max-w-md mx-auto">
                "Ready to master <span className="text-[#BB0000] font-bold">STEM</span> with some local ristos? Pick a topic below or start a new risto."
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
                {[
                  { title: "Algebra Basics", icon: Brain, desc: "Solve for X using matatu fare ristos." },
                  { title: "Photosynthesis", icon: BookOpen, desc: "How plants cook like Mama Mboga." },
                  { title: "Forces & Motion", icon: Trophy, desc: "Physics of a speeding matatu." },
                  { title: "Chemical Reactions", icon: MessageSquare, desc: "Mixing things up in the lab." }
                ].map((topic, i) => (
                  <motion.button
                    key={topic.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                    onClick={() => {
                      createNewChat().then(() => {
                        // In a real app we'd send the first message here
                      });
                    }}
                    className="bg-white p-6 rounded-[32px] border border-[#006600]/10 text-left hover:shadow-xl hover:-translate-y-1 transition-all group"
                  >
                    <div className="w-10 h-10 bg-[#006600]/5 rounded-xl flex items-center justify-center mb-4 group-hover:bg-[#006600] group-hover:text-white transition-colors">
                      <topic.icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-bold text-[#1a1a1a] mb-1">{topic.title}</h3>
                    <p className="text-xs text-[#006600]/60 italic">{topic.desc}</p>
                  </motion.button>
                ))}
              </div>

              <button 
                onClick={createNewChat}
                className="bg-[#BB0000] text-white px-10 py-5 rounded-full font-bold hover:bg-[#990000] transition-all hover:scale-105 shadow-xl flex items-center gap-3 mx-auto active:scale-95"
              >
                <Plus className="w-6 h-6" />
                Anzisha Risto Mpya
              </button>
            </motion.div>
          </div>
        )}
      </main>

      {/* Quiz Modal */}
      <AnimatePresence>
        {showQuiz && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white max-w-2xl w-full rounded-[40px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 bg-[#5A5A40] text-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center">
                    <Trophy className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-serif font-bold leading-none">STEM Quiz</h3>
                    <p className="text-white/70 italic text-xs mt-1">Topic: {quizTopic}</p>
                  </div>
                </div>
                <button onClick={() => setShowQuiz(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>

              {!showQuizResult ? (
                <>
                  <div className="h-1.5 w-full bg-[#f5f5f0]">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${((quizStep + 1) / quizQuestions.length) * 100}%` }}
                      className="h-full bg-[#5A5A40]"
                    />
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-10">
                    <AnimatePresence mode="wait">
                      <motion.div 
                        key={quizStep}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="space-y-8"
                      >
                        <div className="space-y-4">
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#006600]/60">Question {quizStep + 1} of {quizQuestions.length}</span>
                          <div className="text-2xl font-serif font-bold text-[#1a1a1a] leading-tight prose prose-stone max-w-none">
                            <Markdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                              {quizQuestions[quizStep]?.question}
                            </Markdown>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          {quizQuestions[quizStep]?.options.map((opt, optIdx) => {
                            const isSelected = selectedQuizAnswer === optIdx;
                            const isCorrect = opt === quizQuestions[quizStep].correctAnswer;
                            const showResult = selectedQuizAnswer !== null;

                            return (
                              <button 
                                key={optIdx}
                                onClick={() => handleQuizAnswer(optIdx)}
                                disabled={showResult}
                                className={cn(
                                  "text-left p-6 rounded-[24px] border-2 transition-all flex items-center justify-between group",
                                  !showResult && "border-[#006600]/10 hover:border-[#006600]/30 hover:bg-[#f5f5f0]",
                                  showResult && isCorrect && "border-green-500 bg-green-50 text-green-700",
                                  showResult && isSelected && !isCorrect && "border-red-500 bg-red-50 text-red-700",
                                  showResult && !isSelected && !isCorrect && "border-[#006600]/5 opacity-50"
                                )}
                              >
                                <div className="font-bold prose prose-stone max-w-none">
                                  <Markdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                                    {opt}
                                  </Markdown>
                                </div>
                                {showResult && isCorrect && <CheckCircle2 className="w-5 h-5" />}
                                {showResult && isSelected && !isCorrect && <AlertCircle className="w-5 h-5" />}
                                {!showResult && <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />}
                              </button>
                            );
                          })}
                        </div>

                        {selectedQuizAnswer !== null && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="p-6 bg-[#f5f5f0] rounded-[24px] border border-[#006600]/10"
                          >
                            <div className="text-sm italic text-[#1a1a1a]/70 prose prose-stone max-w-none">
                              <span className="font-bold not-italic block mb-1 text-[#006600]">Mwalimu's Explanation:</span>
                              <Markdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
                                {quizQuestions[quizStep].explanation}
                              </Markdown>
                            </div>
                          </motion.div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>

                  <div className="p-8 bg-white border-t border-[#006600]/10 flex justify-end">
                    <button 
                      onClick={nextQuizStep}
                      disabled={selectedQuizAnswer === null}
                      className="bg-[#006600] text-white px-10 py-4 rounded-full font-bold hover:bg-[#005500] transition-all disabled:opacity-50 shadow-lg active:scale-95"
                    >
                      {quizStep < quizQuestions.length - 1 ? "Next Question" : "See Results"}
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center space-y-8">
                  <div className="w-24 h-24 bg-[#006600]/10 rounded-full flex items-center justify-center mx-auto">
                    <Trophy className="w-12 h-12 text-[#006600]" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-serif font-bold text-[#1a1a1a]">Fiti Sana!</h3>
                    <p className="text-[#006600]/60 italic mt-2">You scored {quizScore} out of {quizQuestions.length}</p>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    {Array.from({ length: quizQuestions.length }).map((_, i) => (
                      <div 
                        key={i} 
                        className={cn(
                          "w-3 h-3 rounded-full",
                          i < quizScore ? "bg-green-500" : "bg-red-500"
                        )} 
                      />
                    ))}
                  </div>
                  <p className="text-sm text-[#1a1a1a]/60 max-w-xs mx-auto">
                    You earned <span className="font-bold text-[#006600]">{quizScore * 50} XP</span> for this risto. Keep it up!
                  </p>
                  <button 
                    onClick={() => setShowQuiz(false)}
                    className="bg-[#006600] text-white px-12 py-4 rounded-full font-bold hover:bg-[#005500] transition-all shadow-xl"
                  >
                    Back to Risto
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile Setup Modal */}
      <AnimatePresence>
        {showProfileSetup && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white max-w-md w-full rounded-[40px] p-10 shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-[#5A5A40]/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <UserIcon className="w-10 h-10 text-[#5A5A40]" />
              </div>
              <h3 className="text-2xl font-serif font-bold text-[#1a1a1a] mb-2">Welcome to the Kijiji!</h3>
              <p className="text-[#5A5A40]/60 mb-8">Tell us your level so Mwalimu AI can teach you fiti.</p>
              
              <div className="space-y-3 mb-8">
                {(['Primary', 'Secondary', 'University'] as const).map((level) => (
                  <button
                    key={level}
                    onClick={() => setGradeLevel(level)}
                    className={cn(
                      "w-full p-4 rounded-2xl border transition-all text-left flex items-center justify-between",
                      gradeLevel === level 
                        ? "border-[#5A5A40] bg-[#5A5A40]/5 text-[#5A5A40]" 
                        : "border-[#5A5A40]/10 hover:border-[#5A5A40]/30"
                    )}
                  >
                    <span className="font-medium">{level} School</span>
                    {gradeLevel === level && <CheckCircle2 className="w-5 h-5" />}
                  </button>
                ))}
              </div>

              <button 
                onClick={updateProfile}
                className="w-full bg-[#5A5A40] text-white py-4 rounded-full font-bold hover:bg-[#4a4a35] transition-colors shadow-lg"
              >
                Let's Go!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
