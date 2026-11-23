import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Bot, Database, Send, Sparkles, Trash2, User } from 'lucide-react';
import { api } from '../services/api';
import { useToast } from '../context/ToastContext';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { ChatMessage } from '../types/finance';

const STARTER_QUESTIONS = [
  'How much did I spend on food this month?',
  'Compare my spending this month with last month.',
  'What is my highest expense category?',
  'How much did I spend on shopping?',
  'Am I likely to exceed my monthly budget?',
  'Where can I reduce my expenses?',
  'How much money can I save next month?',
];

function renderFormattedText(content: string) {
  return content.split('\n').map((line, i) => {
    const parts = line.split(/(\*\*.*?\*\*)/g);
    return (
      <p key={i} className={i > 0 ? 'mt-1.5' : ''}>
        {parts.map((part, j) =>
          part.startsWith('**') && part.endsWith('**') ? (
            <strong key={j} className="font-semibold text-slate-950 dark:text-white">
              {part.slice(2, -2)}
            </strong>
          ) : (
            <React.Fragment key={j}>{part}</React.Fragment>
          )
        )}
      </p>
    );
  });
}

export function AssistantPage() {
  const { pushToast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedContextId, setExpandedContextId] = useState<number | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .getChatHistory()
      .then((res) => setMessages(res.messages))
      .catch(() => {
        // ignore initial load error
      });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const sendQuestion = async (questionText: string) => {
    const clean = questionText.trim();
    if (!clean || sending) return;
    setError(null);
    setInput('');
    setSending(true);

    const tempId = -Date.now();
    setMessages((prev) => [
      ...prev,
      { id: tempId, role: 'user', content: clean, createdAt: new Date().toISOString() },
    ]);

    try {
      const res = await api.sendChatMessage(clean);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== tempId),
        res.userMessage,
        res.assistantMessage,
      ]);
      if (res.notice) setNotice(res.notice);
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setError(err instanceof Error ? err.message : 'Assistant request failed.');
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    await api.clearChatHistory();
    setMessages([]);
    setNotice(null);
    setClearConfirmOpen(false);
    pushToast({ title: 'Chat history cleared', variant: 'info' });
  };

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
            AI Financial Assistant (RAG)
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Ask natural questions about your finances. Every response is grounded strictly in your authenticated SQL database records via Gemini RAG.
          </p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setClearConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 glass-card hover:border-rose-400/50 hover:text-rose-600 dark:hover:text-rose-400 rounded-xl self-start sm:self-auto transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear History</span>
          </button>
        )}
      </div>

      {notice && (
        <div className="p-3 rounded-xl glass-card text-xs text-slate-600 dark:text-slate-300">
          {notice}
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-3 rounded-xl bg-rose-500/12 border border-rose-500/30 text-sm text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      {/* Suggested Starter Prompts */}
      <div className="flex flex-wrap gap-2">
        {STARTER_QUESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={sending}
            onClick={() => void sendQuestion(q)}
            className="px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 glass-card hover:border-blue-500/50 hover:text-blue-700 dark:hover:text-sky-300 rounded-xl transition-all active:scale-[0.98] text-left disabled:opacity-60"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Frosted Glass Chat Studio */}
      <div className="glass-card rounded-3xl flex flex-col min-h-[480px] max-h-[640px] overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
          {messages.length === 0 ? (
            <div className="py-14 text-center max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/25 text-blue-600 dark:text-sky-400 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                Database-Grounded Personal Finance Assistant
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                Select one of the prompts above or ask any question below. Every rupee figure is retrieved directly from your SQL ledger before answering.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-blue-600/20">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/20'
                      : 'bg-slate-900/[0.04] dark:bg-white/[0.06] border border-slate-900/10 dark:border-white/10 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {msg.role === 'user' ? msg.content : renderFormattedText(msg.content)}

                  {msg.role === 'assistant' && msg.retrievedSummary && (
                    <div className="mt-3 pt-2.5 border-t border-slate-900/10 dark:border-white/10">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          {msg.mode === 'gemini'
                            ? 'Source: Google Gemini + User SQL Retrieval'
                            : 'Source: Local SQL Retrieval Analytics'}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedContextId((prev) => (prev === msg.id ? null : msg.id))
                          }
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-sky-400 hover:underline font-medium"
                        >
                          <Database className="w-3 h-3" />
                          <span>
                            {expandedContextId === msg.id ? 'Hide Retrieved Context' : 'Inspect Retrieved SQL Context'}
                          </span>
                        </button>
                      </div>
                      {expandedContextId === msg.id && (
                        <pre className="mt-2 p-3 rounded-xl bg-slate-950 text-slate-200 border border-white/10 text-[11px] font-mono overflow-x-auto max-h-52">
                          {JSON.stringify(msg.retrievedSummary, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>

                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-xl bg-slate-900/10 dark:bg-white/10 text-slate-700 dark:text-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </motion.div>
            ))
          )}

          {sending && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="px-4 py-3 rounded-2xl bg-slate-900/[0.04] dark:bg-white/[0.06] border border-slate-900/10 dark:border-white/10 text-sm text-slate-500 dark:text-slate-300 flex items-center gap-2">
                <span>Retrieving SQL records & generating grounded answer</span>
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-bounce" />
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-bounce [animation-delay:120ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-bounce [animation-delay:240ms]" />
                </span>
              </div>
            </motion.div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Floating Frosted Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendQuestion(input);
          }}
          className="p-3.5 border-t border-slate-900/10 dark:border-white/10 bg-white/50 dark:bg-white/[0.03] flex gap-2.5"
        >
          <label htmlFor="rag-chat-input" className="sr-only">
            Ask a financial question
          </label>
          <input
            id="rag-chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your spending, budget, or savings…"
            className="flex-1 px-4 py-2.5 glass-input rounded-xl text-sm"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl shadow-md shadow-blue-600/25 transition-all active:scale-[0.98] disabled:opacity-60 whitespace-nowrap"
          >
            <Send className="w-4 h-4" />
            <span>Ask</span>
          </button>
        </form>
      </div>

      <ConfirmDialog
        open={clearConfirmOpen}
        title="Clear conversation history?"
        description="This removes saved AI assistant chat messages from your database. Your financial transactions and receipts are unaffected."
        confirmLabel="Clear Chat"
        destructive
        onCancel={() => setClearConfirmOpen(false)}
        onConfirm={() => void handleClear()}
      />
    </div>
  );
}
