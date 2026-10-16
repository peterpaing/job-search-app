"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FiMessageCircle, FiSend, FiX, FiZap } from "react-icons/fi";
import type { Job } from "./JobCard";

type ChatAnswer = {
  answer: string;
  cached: boolean;
  outOfScope?: boolean;
};

type SmartMatchChatProps = {
  job: Job;
  aiEnabled: boolean;
  disabled: boolean;
  onAsk: (
    question: string,
    onDelta: (delta: string) => void,
  ) => Promise<ChatAnswer>;
  onClose: () => void;
};

const suggestions = [
  "Explain my fit for this job.",
  "Summarize the requirements and uncertainties.",
  "What should I highlight in my application?",
  "Suggest interview practice questions.",
];

export default function SmartMatchChat({
  job,
  aiEnabled,
  disabled,
  onAsk,
  onClose,
}: SmartMatchChatProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const questionId = `${id}-question`;

  const [question, setQuestion] = useState("");
  const [submittedQuestion, setSubmittedQuestion] = useState("");
  const [answer, setAnswer] = useState<ChatAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const mounted = useRef(false);
  const pending = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mounted.current = true;
    inputRef.current?.focus();

    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (
        event.key !== "Escape" ||
        event.defaultPrevented ||
        document.querySelector("dialog[open]")
      ) {
        return;
      }

      event.preventDefault();
      onClose();
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    const messages = messagesRef.current;

    if (messages) {
      messages.scrollTop = messages.scrollHeight;
    }
  }, [answer, loading, error]);

  async function submitQuestion() {
    const value = question.trim();

    if (pending.current || disabled || !aiEnabled || value.length < 3) {
      return;
    }

    pending.current = true;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setSubmittedQuestion(value);
    setQuestion("");

    try {
      const result = await onAsk(value, (delta) => {
        if (!mounted.current) {
          return;
        }

        setAnswer((previous) => ({
          answer: (previous?.answer ?? "") + delta,
          cached: false,
        }));
      });

      if (mounted.current) {
        // The completed, validated result replaces the provisional text.
        setAnswer(result);
      }
    } catch (failure) {
      if (mounted.current) {
        // Do not present an interrupted answer as a successful answer.
        setAnswer(null);

        setError(
          failure instanceof Error
            ? failure.message
            : "Couldn’t generate an answer. Please try again.",
        );

        setQuestion(value);
      }
    } finally {
      pending.current = false;

      if (mounted.current) {
        setLoading(false);
      }
    }
  }

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className="border-border bg-background fixed right-4 bottom-4 z-[60] flex h-[min(640px,calc(100dvh-8rem))] w-[calc(100vw-2rem)] max-w-[440px] flex-col overflow-hidden rounded-3xl border shadow-[0_16px_60px_rgba(0,0,0,0.2)] sm:right-6 sm:bottom-6"
    >
      <header className="bg-primary text-background flex shrink-0 items-start justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <FiMessageCircle aria-hidden="true" className="h-4 w-4" />
            Ask about this job
          </h2>

          <p className="mt-2 text-sm leading-snug">{job.title}</p>

          <p className="mt-1 text-xs text-white/60">{job.company}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close job chat"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <FiX aria-hidden="true" className="h-5 w-5" />
        </button>
      </header>

      <div
        ref={messagesRef}
        className="application-notes min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5"
      >
        <div className="bg-surface rounded-2xl rounded-tl-sm p-4">
          <p className="text-primary text-sm leading-relaxed">
            What would you like to know about this role?
          </p>

          <p className="text-muted mt-2 text-xs leading-relaxed">
            Ask about your fit, the listing’s requirements, or preparing your
            application. This assistant doesn’t provide general coding
            tutorials.
          </p>
        </div>

        {!submittedQuestion && (
          <div className="space-y-2">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                disabled={disabled || loading || !aiEnabled}
                onClick={() => {
                  setQuestion(suggestion);
                  inputRef.current?.focus();
                }}
                className="border-border text-primary focus-visible:outline-primary hover:bg-surface block w-full rounded-xl border px-3 py-2.5 text-left text-xs leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {submittedQuestion && (
          <div className="bg-primary text-background ml-8 rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
            {submittedQuestion}
          </div>
        )}

        {loading && !answer && (
          <div
            role="status"
            aria-label="Generating answer"
            aria-live="polite"
            aria-busy="true"
            className="flex items-center gap-3 px-1 py-3"
          >
            <span
              aria-hidden="true"
              className="bg-primary h-2 w-2 shrink-0 rounded-full motion-safe:animate-pulse"
            />

            <span className="smartmatch-thinking text-sm font-medium">
              Thinking…
            </span>
          </div>
        )}

        {answer && (
          <div
            role="status"
            aria-live="polite"
            className="bg-surface mr-5 rounded-2xl rounded-tl-sm p-4"
          >
            <div className="text-muted mb-3 flex items-center gap-2 text-xs font-medium">
              <FiZap aria-hidden="true" />
              StackWing AI
            </div>

            <p className="text-primary text-sm leading-relaxed whitespace-pre-wrap">
              {answer.answer}
            </p>

            <p className="text-muted mt-4 text-xs leading-relaxed">
              {answer.outOfScope
                ? "This assistant is limited to the selected job."
                : answer.cached
                  ? "Private cached answer · no new AI generation."
                  : "AI guidance · verify details in the original listing."}
            </p>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"
          >
            {error}
          </p>
        )}

        {!aiEnabled && (
          <p className="text-muted rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
            AI is temporarily unavailable. Please try again later.
          </p>
        )}
      </div>

      <form
        className="border-border shrink-0 border-t p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submitQuestion();
        }}
      >
        <label htmlFor={questionId} className="sr-only">
          Your question
        </label>

        <div className="border-border flex items-end gap-2 rounded-2xl border p-2">
          <textarea
            ref={inputRef}
            id={questionId}
            value={question}
            maxLength={600}
            rows={2}
            disabled={disabled || loading || !aiEnabled}
            placeholder="Ask about your fit or this listing…"
            onChange={(event) => setQuestion(event.target.value)}
            className="application-notes text-primary focus-visible:outline-primary max-h-28 min-h-16 min-w-0 flex-1 resize-none overflow-y-auto rounded-xl bg-transparent px-2 py-2 text-sm leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing ||
                event.nativeEvent.keyCode === 229
              ) {
                return;
              }

              event.preventDefault();

              if (!event.repeat) {
                void submitQuestion();
              }
            }}
          />

          <button
            type="submit"
            aria-label="Send question"
            disabled={
              disabled || loading || !aiEnabled || question.trim().length < 3
            }
            className="bg-primary text-background focus-visible:outline-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FiSend aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        <p className="text-muted mt-2 text-xs leading-relaxed">
          Each question is independent. Closing the panel does not cancel a
          generation already started.
        </p>
      </form>
    </aside>
  );
}
