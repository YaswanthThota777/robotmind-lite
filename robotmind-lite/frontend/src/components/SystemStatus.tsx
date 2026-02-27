type SystemStatusProps = {
  isTraining: boolean;
  currentRun?: {
    algorithm: string;
    steps: number;
    environment: string;
  };
};

export const SystemStatus = ({ isTraining, currentRun }: SystemStatusProps) => {
  return (
    <div className="bg-gradient-to-br from-slate-900/90 to-slate-800/80 border border-slate-700/50 rounded-xl p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">System Status</h3>
        <div className={`flex items-center gap-2 px-2.5 py-1 rounded-md ${
          isTraining 
            ? 'bg-emerald-500/20 border border-emerald-500/40' 
            : 'bg-slate-700/40 border border-slate-600/40'
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${
            isTraining ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
          }`}></div>
          <span className={`text-xs font-medium ${
            isTraining ? 'text-emerald-300' : 'text-slate-400'
          }`}>
            {isTraining ? 'Training Active' : 'Ready'}
          </span>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Algorithms</div>
          <div className="text-base font-bold text-teal-300">6</div>
          <div className="text-xs text-slate-600 mt-0.5">PPO, DQN, SAC, A2C, TD3, DDPG</div>
        </div>
        
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Environments</div>
          <div className="text-base font-bold text-amber-300">3</div>
          <div className="text-xs text-slate-600 mt-0.5">V1 Flat-Ground Profiles</div>
        </div>
        
        <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Export</div>
          <div className="text-base font-bold text-emerald-300">ONNX</div>
          <div className="text-xs text-slate-600 mt-0.5">Production Ready</div>
        </div>
      </div>

      {isTraining && currentRun && (
        <div className="mt-3 pt-3 border-t border-slate-700/30">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Current Training</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-400">Algorithm:</span>
              <span className="text-teal-300 font-medium">{currentRun.algorithm}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Environment:</span>
              <span className="text-amber-300 font-medium text-xs">
                {currentRun.environment.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Target Steps:</span>
              <span className="text-emerald-300 font-medium">{currentRun.steps.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

