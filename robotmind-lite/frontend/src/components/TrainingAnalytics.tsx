import { useState, useEffect } from "react";

type TrainingMetric = {
  episode: number;
  reward: number;
  loss?: number;
  reward_mean?: number;
};

type AnalyticsProps = {
  apiBase: string;
  runId: number;
};

export const TrainingAnalytics = ({ apiBase, runId }: AnalyticsProps) => {
  const [metrics, setMetrics] = useState<TrainingMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMetrics();
  }, [runId]);

  const loadMetrics = async () => {
    try {
      const response = await fetch(`${apiBase}/training-runs/${runId}/metrics?limit=500`);
      if (response.ok) {
        const data = await response.json();
        setMetrics(data);
      }
    } catch (error) {
      console.error("Failed to load metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    if (metrics.length === 0) return null;

    const rewards = metrics.map((m) => {
      const direct = Number(m.reward);
      if (Number.isFinite(direct)) return direct;
      const fallback = Number(m.reward_mean);
      return Number.isFinite(fallback) ? fallback : 0;
    });
    const avgReward = rewards.reduce((a, b) => a + b, 0) / rewards.length;
    const maxReward = Math.max(...rewards);
    const minReward = Math.min(...rewards);
    const recentRewards = rewards.slice(-20);
    const recentAvg = recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length;

    return { avgReward, maxReward, minReward, recentAvg };
  };

  const stats = calculateStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-6 w-6 border-3 border-cyan-500 border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">Average Reward</div>
            <div className="text-lg font-bold text-cyan-300">
              {stats.avgReward.toFixed(2)}
            </div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">Best Reward</div>
            <div className="text-lg font-bold text-emerald-300">
              {stats.maxReward.toFixed(2)}
            </div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">Recent Avg (20 ep)</div>
            <div className="text-lg font-bold text-purple-300">
              {stats.recentAvg.toFixed(2)}
            </div>
          </div>
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-3">
            <div className="text-xs text-slate-500 mb-1">Total Episodes</div>
            <div className="text-lg font-bold text-amber-300">
              {metrics.length}
            </div>
          </div>
        </div>
      )}

      <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg p-4">
        <div className="text-sm font-semibold text-slate-300 mb-3">Reward Trend</div>
        <div className="relative h-48">
          <svg viewBox="0 0 500 150" className="w-full h-full">
            <defs>
              <linearGradient id="rewardGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.3" />
                <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {metrics.length > 1 && (() => {
                    const rewards = metrics.map((m) => {
                      const direct = Number(m.reward);
                      if (Number.isFinite(direct)) return direct;
                      const fallback = Number(m.reward_mean);
                      return Number.isFinite(fallback) ? fallback : 0;
                    });
              const maxReward = Math.max(...rewards);
              const minReward = Math.min(...rewards);
              const range = maxReward - minReward || 1;

              const points = metrics.map((m, i) => {
                      const reward = Number.isFinite(Number(m.reward))
                        ? Number(m.reward)
                        : (Number.isFinite(Number(m.reward_mean)) ? Number(m.reward_mean) : 0);
                const x = (i / (metrics.length - 1)) * 480 + 10;
                      const y = 140 - ((reward - minReward) / range) * 120;
                return `${x},${y}`;
              }).join(" ");

              const areaPoints = `10,140 ${points} ${480 + 10},140`;

              return (
                <>
                  <polyline
                    points={areaPoints}
                    fill="url(#rewardGradient)"
                  />
                  <polyline
                    points={points}
                    fill="none"
                    stroke="rgb(16, 185, 129)"
                    strokeWidth="2"
                  />
                </>
              );
            })()}
          </svg>
        </div>
      </div>
    </div>
  );
};
