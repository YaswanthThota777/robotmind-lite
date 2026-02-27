import { useEffect, useState } from "react";

type ConsolePanelProps = {
  messages: string[];
};

export const ConsolePanel = ({ messages }: ConsolePanelProps) => {
  const [open, setOpen] = useState(false);

  // Auto-open on new messages, auto-close after 6 s if no more arrive
  useEffect(() => {
    if (messages.length > 0) {
      setOpen(true);
      const t = window.setTimeout(() => setOpen(false), 6000);
      return () => window.clearTimeout(t);
    }
  }, [messages.length]);

  const getMessageColor = (message: string) => {
    if (message.includes("✅")) return "text-emerald-300";
    if (message.includes("❌") || message.includes("ERROR")) return "text-red-300";
    if (message.includes("⚠️") || message.includes("CONFLICT")) return "text-amber-300";
    if (message.includes("🚀")) return "text-teal-300";
    if (message.includes("💡")) return "text-blue-300";
    return "text-slate-400";
  };

  const latest = messages[0] ?? "";

  return (
    <div className="flex-shrink-0 border-t border-slate-800 bg-slate-950/90">
      {/* One-line summary bar – always visible */}
      <button
        className="flex w-full items-center justify-between px-4 py-2 hover:bg-slate-900/60 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs text-slate-500 uppercase tracking-widest flex-shrink-0">Log</span>
          {latest && (
            <span className={`text-xs font-mono truncate ${getMessageColor(latest)}`}>
              {latest}
            </span>
          )}
        </div>
        <span className="text-xs text-slate-600 flex-shrink-0 ml-2">{open ? "▼" : "▶"}</span>
      </button>

      {open && (
        <div className="max-h-28 overflow-y-auto px-4 pb-2 space-y-1">
          {messages.map((message, index) => (
            <div
              key={`${message}-${index}`}
              className={`text-xs font-mono py-0.5 ${getMessageColor(message)}`}
            >
              {message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

