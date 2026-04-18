import React, { useState, useEffect, useRef } from 'react';
import { Transaction } from '../types';
import { generateFinancialInsights, chatWithCoach } from '../services/geminiService';
import { Sparkles, Loader2, Send, User, Bot, RefreshCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'model';
  text: string;
}

interface InsightPanelProps {
  transactions: Transaction[];
}

const InsightPanel: React.FC<InsightPanelProps> = ({ transactions }) => {
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isChatting) {
      scrollToBottom();
    }
  }, [chatMessages, isChatting]);

  const handleGenerate = async () => {
    setLoading(true);
    const result = await generateFinancialInsights(transactions);
    setInsight(result);
    setChatMessages([{ role: 'model', text: result }]);
    setLoading(false);
  };

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!userInput.trim() || loading) return;

    const userMsg = userInput.trim();
    setUserInput('');
    setIsChatting(true);
    
    const newMessages: Message[] = [...chatMessages, { role: 'user', text: userMsg }];
    setChatMessages(newMessages);
    
    setLoading(true);
    const response = await chatWithCoach(transactions, chatMessages, userMsg);
    setChatMessages([...newMessages, { role: 'model', text: response }]);
    setLoading(false);
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-5 text-white shadow-2xl overflow-hidden relative border border-slate-700/50">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-slate-500 opacity-10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-64 h-64 bg-slate-500 opacity-10 rounded-full blur-3xl pointer-events-none"></div>
        
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-slate-500/20 rounded-2xl backdrop-blur-md border border-slate-500/30">
                  <Sparkles className="text-slate-400" size={24} />
              </div>
              <div>
                <h3 className="text-xl font-black tracking-tight">AI Financial Coach</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Powered by Gemini</p>
              </div>
            </div>
            {insight && (
              <button 
                onClick={() => { setInsight(null); setChatMessages([]); setIsChatting(false); }}
                className="p-2 hover:bg-white/10 rounded-xl transition-colors text-slate-400 hover:text-white"
                title="Reset Chat"
              >
                <RefreshCw size={18} />
              </button>
            )}
          </div>

          {!insight && !loading && (
            <div className="py-4 text-center space-y-4">
              <div className="max-w-md mx-auto">
                <p className="text-slate-300 text-lg font-medium leading-relaxed">
                  Ottieni un'analisi personalizzata e interattiva delle tue finanze. 
                  L'AI analizzerà le tue transazioni per darti consigli su misura.
                </p>
              </div>
              <button 
                onClick={handleGenerate}
                disabled={transactions.length === 0}
                className="mx-auto bg-slate-100 text-slate-900 px-8 py-4 rounded-2xl font-black text-lg hover:bg-white transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 shadow-xl shadow-black/20"
              >
                <Sparkles size={24} />
                Inizia Analisi
              </button>
              {transactions.length === 0 && (
                <p className="text-xs text-slate-500 font-bold uppercase">Inserisci almeno una transazione per iniziare</p>
              )}
            </div>
          )}

          {loading && chatMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-300">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-slate-500/20 border-t-slate-400 rounded-full animate-spin"></div>
                <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-400 animate-pulse" size={24} />
              </div>
              <p className="mt-6 font-bold tracking-wide uppercase text-sm">Analisi in corso...</p>
            </div>
          )}

          {chatMessages.length > 0 && (
            <div className="space-y-6">
              <div className={`space-y-4 overflow-y-auto pr-2 custom-scrollbar ${isChatting ? 'max-h-[300px]' : ''}`}>
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                      msg.role === 'user' ? 'bg-white/20 text-white' : 'bg-slate-500/20 text-slate-400'
                    }`}>
                      {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                    </div>
                    <div className={`max-w-[85%] rounded-2xl p-4 text-sm leading-relaxed ${
                      msg.role === 'user' 
                        ? 'bg-white/10 border border-white/20 text-white' 
                        : 'bg-white/5 border border-white/10 text-slate-200'
                    }`}>
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-xl bg-slate-500/20 text-slate-400 flex items-center justify-center shrink-0">
                      <Bot size={16} />
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <form onSubmit={handleSendMessage} className="relative mt-4">
                <input 
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  placeholder="Chiedi qualcosa al tuo coach..."
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-6 pr-14 text-sm focus:outline-none focus:border-slate-500/50 transition-colors placeholder:text-slate-500"
                />
                <button 
                  type="submit"
                  disabled={!userInput.trim() || loading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2.5 bg-slate-100 text-slate-900 rounded-xl hover:bg-white disabled:opacity-50 transition-all"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          )}
        </div>
    </div>
  );
};

export default InsightPanel;