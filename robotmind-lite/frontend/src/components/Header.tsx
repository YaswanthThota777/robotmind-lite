type HeaderProps = {
  onShowWelcome?: () => void;
  onShowModelManager?: () => void;
};

export const Header = ({ onShowWelcome, onShowModelManager }: HeaderProps) => {
  return (
    <header className="flex items-center justify-between border-b border-night-700 bg-gradient-to-r from-night-900 to-night-800 px-8 py-6 shadow-lg">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-cyan-500 text-2xl shadow-lg">
          🤖
        </div>
        <div>
          <div className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">RobotMind Lite</div>
          <div className="text-xs text-slate-400">Version 1 • Flat-Ground Models</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {onShowModelManager && (
          <button
            onClick={onShowModelManager}
            className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20 transition flex items-center gap-2 font-medium"
          >
            <span>📦</span>
            <span>Models</span>
          </button>
        )}
        {onShowWelcome && (
          <button
            onClick={onShowWelcome}
            className="rounded-full border border-purple-500/40 bg-purple-500/10 px-4 py-2 text-sm text-purple-200 hover:bg-purple-500/20 transition flex items-center gap-2"
          >
            <span>❓</span>
            <span>Help</span>
          </button>
        )}
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400"></span>
          <span>Live</span>
        </div>
        <div className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200">
          Production Ready
        </div>
      </div>
    </header>
  );
};
