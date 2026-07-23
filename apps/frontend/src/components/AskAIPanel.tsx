import { useState } from 'react';
import { useAskDeployment } from '../lib/query';

interface Exchange {
  question: string;
  answer: string;
}

const SUGGESTIONS = [
  'Is this deployment healthy?',
  'What would it cost to run 3 replicas?',
  'Are there any security issues I should fix first?',
];

export function AskAIPanel({ deploymentId }: { deploymentId: string }) {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<Exchange[]>([]);
  const [unconfigured, setUnconfigured] = useState(false);
  const { mutate, isPending } = useAskDeployment(deploymentId);

  const ask = (question: string) => {
    if (!question.trim() || isPending) return;
    mutate(question, {
      onSuccess: (res) => {
        if (!res.aiConfigured) {
          setUnconfigured(true);
          return;
        }
        setHistory((h) => [...h, { question, answer: res.answer }]);
      },
    });
    setInput('');
  };

  if (unconfigured) {
    return (
      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-500">
        Ask AI unavailable — no ANTHROPIC_API_KEY configured.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 p-4">
      <h2 className="text-sm font-medium text-slate-700">Ask AI about this deployment</h2>

      {history.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
          {history.map((ex, i) => (
            <div key={i} className="flex flex-col gap-1">
              <p className="text-sm font-medium text-slate-900">{ex.question}</p>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{ex.answer}</p>
            </div>
          ))}
        </div>
      )}

      {isPending && <p className="text-sm text-slate-400">Thinking...</p>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about this deployment..."
          disabled={isPending}
          className="flex-1 rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Ask
        </button>
      </form>
    </div>
  );
}
