/**
 * QuickTest — one-click model testing panel with full environment selection.
 * Shows results + inline simulation playback inside the same modal.
 */
import { useEffect, useRef, useState } from "react";
import { EnvTemplates } from "./EnvTemplates";
import { EnvBuilder } from "./EnvBuilder";
import { SimulationCanvas } from "./SimulationCanvas";
import { EnvMinimap } from "./EnvMinimap";
import type { ProfileOption, SimulationState, WorldSummary } from "../types";

interface TestResult {
  avg_reward: number;
  avg_steps: number;
  collision_rate: number;
  success_rate: number;
  goal_reach_rate?: number;
  env_has_goal?: boolean;
  model_has_goal?: boolean;
  obs_trimmed?: boolean;
  episode_rewards: number[];
  episode_steps: number[];
  episode_collisions: number[];
  trajectory?: SimulationState[];
}

interface QuickTestProps {
  apiBase: string;
  runId?: number | null;                       // pre-fills from the last training run
  defaultEnvProfile?: string;                  // pre-fills env from training config
  /** Robot design from the project — used to render the correct shape/color in playback */
  projectRobot?: {
    shape: string;
    color: string;
    sensorCount?: number;
    sensorFov?: number;
    sensorRange?: number;
    sensorPlacement?: string;
  };
  /** Pre-filled custom environment JSON (same one sent during training) so test uses matching sensors */
  defaultCustomJson?: string;
  onPlaybackStart: (frames: SimulationState[]) => void;
  onPlaybackStop: () => void;
  isPlaying: boolean;
  onClose: () => void;
}

export const QuickTest = ({
  apiBase,
  runId: initialRunId,
  defaultEnvProfile = "arena_basic",
  projectRobot,
  defaultCustomJson,
  onPlaybackStart,
  onPlaybackStop,
  isPlaying,
  onClose,
}: QuickTestProps) => {
  // ── run picker ──────────────────────────────────────────────────────────
  const [runs, setRuns] = useState<{ run_id: number; algorithm: string; status: string; total_steps: number }[]>([]);
  const [runId, setRunId] = useState<number | null>(initialRunId ?? null);

  // ── env selection ───────────────────────────────────────────────────────
  const [envProfile, setEnvProfile] = useState(defaultEnvProfile);
  const [envLabel, setEnvLabel] = useState(defaultEnvProfile.replaceAll("_", " "));
  const [envProfiles, setEnvProfiles] = useState<ProfileOption[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [customJson, setCustomJson] = useState(defaultCustomJson ?? "");
  const [showCustomJson, setShowCustomJson] = useState(false);

  // ── test config ─────────────────────────────────────────────────────────
  const [episodes, setEpisodes] = useState(5);
  const [deterministic, setDeterministic] = useState(false);
  const [maxSteps, setMaxSteps] = useState(1000);

  // ── selected env summary (for minimap) ───────────────────────────────────
  const [selectedEnvSummary, setSelectedEnvSummary] = useState<WorldSummary | null>(null);

  // ── fine-tune state ──────────────────────────────────────────────────────
  const [ftSteps, setFtSteps] = useState(20_000);
  const [ftLoading, setFtLoading] = useState(false);
  const [ftResult, setFtResult] = useState<{ total_steps: number; additional_steps: number } | null>(null);
  const [ftError, setFtError] = useState<string | null>(null);

  // ── state ────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  // ── inline playback ──────────────────────────────────────────────────────
  const [playFrames, setPlayFrames] = useState<SimulationState[] | null>(null);
  const [playIndex, setPlayIndex] = useState(0);
  const [playPlaying, setPlayPlaying] = useState(false);
  const [showSim, setShowSim] = useState(false);

  // Playback ticker
  useEffect(() => {
    if (!playPlaying || !playFrames) return;
    const id = window.setInterval(() => {
      setPlayIndex((i) => {
        const next = i + 1;
        if (!playFrames || next >= playFrames.length) {
          setPlayPlaying(false);
          return playFrames ? playFrames.length - 1 : 0;
        }
        return next;
      });
    }, 33);
    return () => window.clearInterval(id);
  }, [playPlaying, playFrames?.length]);

  // ── bootstrap: load env profiles + training runs ─────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [pr, rr] = await Promise.all([
          fetch(`${apiBase}/training-profiles`),
          fetch(`${apiBase}/training-runs?limit=30`),
        ]);
        if (pr.ok) {
          const p = await pr.json();
          const list: ProfileOption[] = (p.environment_profiles || []).map((e: any) => ({
            key: e.key, label: e.label, description: e.description || "",
            world_summary: e.world_summary ?? undefined,
          }));
          setEnvProfiles(list);
          // resolve label for the default profile
          const found = list.find((e) => e.key === envProfile);
          if (found) {
            setEnvLabel(found.label);
            if (found.world_summary) setSelectedEnvSummary(found.world_summary);
          }
        }
        if (rr.ok) {
          const data = await rr.json();
          const normalized = (Array.isArray(data) ? data : []).map((r: any) => ({
            run_id: r.run_id ?? r.id,
            algorithm: r.algorithm || "?",
            status: r.status || "?",
            total_steps: r.total_steps ?? r.steps ?? 0,
          }));
          setRuns(normalized);
          // auto-select the latest completed run if none pre-filled
          if (initialRunId == null) {
            const latest = normalized.find((r) => r.status === "completed");
            if (latest) setRunId(latest.run_id);
          }
        }
      } catch { /* silent */ }
    };
    load();
  }, [apiBase]);

  // ── run the test ─────────────────────────────────────────────────────────
  const runTest = async () => {
    if (!runId) { setError("Select a trained model run first."); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    setPlayFrames(null);
    setPlayPlaying(false);
    setShowSim(false);
    onPlaybackStop();

    let customEnvironment: Record<string, unknown> | undefined;
    if (customJson.trim()) {
      try { customEnvironment = JSON.parse(customJson); }
      catch { setLoading(false); setError("Custom JSON is invalid — fix it or clear it."); return; }
    }

    try {
      const res = await fetch(`${apiBase}/test-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          episodes: Math.max(1, Math.min(50, episodes)),
          environment_profile: envProfile,
          deterministic,
          max_steps: maxSteps,
          record_trajectory: true,
          record_episode: 0,
          frame_skip: 1,
          ...(customEnvironment ? { custom_environment: customEnvironment } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        if (Array.isArray(detail)) throw new Error(detail.map((d: any) => d.msg || JSON.stringify(d)).join("; "));
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail) || "Test failed");
      }
      const data: TestResult = await res.json();
      setResult(data);
      if (data.trajectory && data.trajectory.length > 0) {
        setPlayFrames(data.trajectory);
        setPlayIndex(0);
        setPlayPlaying(true);
        setShowSim(true);
        onPlaybackStart(data.trajectory);
      }
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth" }), 80);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test failed");
    } finally {
      setLoading(false);
    }
  };

  const handleEnvSelect = (key: string, label: string, worldSummary?: WorldSummary) => {
    setEnvProfile(key);
    setEnvLabel(label);
    if (worldSummary) setSelectedEnvSummary(worldSummary);
    setEnvProfiles((p) => p.find((e) => e.key === key) ? p : [...p, { key, label, description: "", world_summary: worldSummary }]);
  };

  // ── fine-tune ─────────────────────────────────────────────────────────────
  const runFineTune = async () => {
    if (!runId) { setFtError("Select a trained model run first."); return; }
    setFtLoading(true);
    setFtError(null);
    setFtResult(null);

    let customEnvironment: Record<string, unknown> | undefined;
    if (customJson.trim()) {
      try { customEnvironment = JSON.parse(customJson); }
      catch { setFtLoading(false); setFtError("Custom JSON is invalid."); return; }
    }

    try {
      const res = await fetch(`${apiBase}/fine-tune-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          steps: ftSteps,
          environment_profile: envProfile,
          ...(customEnvironment ? { custom_environment: customEnvironment } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail) || "Fine-tune failed");
      }
      const data = await res.json();
      setFtResult(data);
    } catch (e) {
      setFtError(e instanceof Error ? e.message : "Fine-tune failed");
    } finally {
      setFtLoading(false);
    }
  };

  const rewardColor = (v: number) =>
    v > 5 ? "text-emerald-300" : v > 0 ? "text-cyan-300" : "text-red-300";

  return (
    <>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className={`w-[96vw] max-h-[92vh] flex flex-col
                        bg-night-900 border border-night-700 rounded-2xl shadow-2xl overflow-hidden
                        transition-all duration-300 ${showSim ? "max-w-5xl" : "max-w-3xl"}`}>

          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-night-700 bg-night-800/80 flex-shrink-0">
            <div>
              <div className="font-bold text-slate-100 text-base">🧪 Test Trained Model</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Choose any environment — prebuilt, maze, goal, or your own — then run & watch
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg bg-night-700 hover:bg-night-600 text-slate-300 text-sm flex items-center justify-center"
            >✕</button>
          </div>

          <div className={`flex-1 flex overflow-hidden min-h-0 ${showSim ? "flex-row" : "flex-col"}`}>
            {/* Config + Results panel */}
            <div className={`overflow-y-auto p-4 space-y-4 ${showSim ? "w-[380px] flex-shrink-0 border-r border-night-700" : "flex-1"}`}>

            {/* ── Model Run Selector ── */}
            <div className="rounded-xl border border-night-700 bg-night-800/50 p-3">
              <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-widest">Model</div>
              <select
                value={runId ?? ""}
                onChange={(e) => setRunId(Number(e.target.value))}
                className="w-full rounded-lg border border-night-600 bg-night-900 px-3 py-2
                           text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
              >
                <option value="">— Select a trained run —</option>
                {runs.filter((r) => r.status === "completed").map((r) => (
                  <option key={r.run_id} value={r.run_id}>
                    Run #{r.run_id} · {r.algorithm} · {r.total_steps.toLocaleString()} steps
                  </option>
                ))}
              </select>
              {runs.filter((r) => r.status === "completed").length === 0 && (
                <div className="text-xs text-amber-400 mt-1.5">
                  ⚠️ No completed runs found. Train a model first.
                </div>
              )}
            </div>

            {/* ── Environment Selector ── */}
            <div className="rounded-xl border border-night-700 bg-night-800/50 p-3 space-y-2">
              <div className="flex items-center">
                <div className="text-xs text-slate-400 font-medium uppercase tracking-widest flex-1">
                  Test Environment
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setShowTemplates(true)}
                    className="text-xs px-2 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30
                               text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                  >
                    🗂️ Templates
                  </button>
                  <button
                    onClick={() => setShowBuilder(true)}
                    className="text-xs px-2 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30
                               text-purple-400 hover:bg-purple-500/20 transition-colors"
                  >
                    🛠️ Build
                  </button>
                </div>
              </div>

              {/* Current env display */}
              <div className="flex items-center gap-2 rounded-lg border border-night-600 bg-night-900 px-3 py-2">
                {selectedEnvSummary && (
                  <div className="flex-shrink-0 rounded overflow-hidden border border-night-600">
                    <EnvMinimap world={selectedEnvSummary} size={56} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-200 font-medium truncate">{envLabel}</div>
                  <div className="text-xs text-slate-500 font-mono truncate">{envProfile}</div>
                  {selectedEnvSummary?.has_goal && (
                    <div className="text-xs text-amber-400 mt-0.5">★ has goal target</div>
                  )}
                </div>
                <select
                  value={envProfile}
                  onChange={(e) => {
                    const found = envProfiles.find((p) => p.key === e.target.value);
                    setEnvProfile(e.target.value);
                    setEnvLabel(found?.label ?? e.target.value.replaceAll("_", " "));
                    if (found?.world_summary) setSelectedEnvSummary(found.world_summary);
                  }}
                  className="text-xs bg-night-800 border border-night-600 rounded px-2 py-1.5
                             text-slate-300 focus:outline-none max-w-[140px]"
                >
                  {envProfiles.map((e) => (
                    <option key={e.key} value={e.key}>{e.label}</option>
                  ))}
                </select>
              </div>

              {/* Custom JSON toggle */}
              <button
                onClick={() => setShowCustomJson((v) => !v)}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showCustomJson ? "▾ Hide" : "▸ Advanced:"} custom override JSON
              </button>
              {showCustomJson && (
                <div>
                  <textarea
                    value={customJson}
                    onChange={(e) => setCustomJson(e.target.value)}
                    rows={5}
                    placeholder='{"world": {"obstacles": [...], "goal": {"x": 500, "y": 400, "radius": 20}}}'
                    className="w-full rounded-lg border border-night-600 bg-night-900 p-2.5 text-xs
                               font-mono text-slate-300 focus:border-cyan-500 focus:outline-none resize-none"
                  />
                  <div className="text-xs text-slate-600 mt-0.5">
                    Overrides the selected environment. Useful for custom mazes / goal placement.
                  </div>
                </div>
              )}
            </div>

            {/* ── Test Config ── */}
            <div className="rounded-xl border border-night-700 bg-night-800/50 p-3">
              <div className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-widest">Options</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Episodes <span className="text-cyan-300 font-mono">{episodes}</span>
                  </label>
                  <input
                    type="range" min={1} max={20} value={episodes}
                    onChange={(e) => setEpisodes(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">
                    Max steps/ep <span className="text-cyan-300 font-mono">{maxSteps.toLocaleString()}</span>
                  </label>
                  <input
                    type="range" min={100} max={5000} step={100} value={maxSteps}
                    onChange={(e) => setMaxSteps(Number(e.target.value))}
                    className="w-full accent-cyan-500"
                  />
                </div>
                <div className="col-span-2 flex flex-col justify-center">
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deterministic}
                      onChange={(e) => setDeterministic(e.target.checked)}
                      className="accent-cyan-500"
                    />
                    Deterministic policy
                  </label>
                  <div className="text-xs text-slate-600 mt-1">
                    Off = stochastic (more varied). On = greedy (consistent).
                  </div>
                </div>
              </div>
            </div>

            {/* ── Error ── */}
            {error && (
              <div className="rounded-xl border border-red-500/40 bg-red-900/20 px-3 py-2 text-xs text-red-300">
                ⚠️ {error}
              </div>
            )}

            {/* ── Obs trimmed warning ── */}
            {result?.obs_trimmed && result?.env_has_goal && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-900/20 px-3 py-2 text-xs text-amber-300 space-y-0.5">
                <div className="font-semibold">⚠️ Goal info not available to this model</div>
                <div className="text-amber-400/70">
                  This model was trained without goal sensing. It cannot see or navigate toward the goal.
                  Train a new model on a goal environment (e.g. Goal Chase) to get goal-seeking behaviour.
                </div>
              </div>
            )}

            {/* ── Results ── */}
            {result && (
              <div ref={resultRef} className="rounded-xl border border-night-700 bg-night-800/50 p-3 space-y-3">
                <div className="text-xs text-slate-400 font-medium uppercase tracking-widest">Results</div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-night-900 border border-night-700 p-2.5 text-center">
                    <div className="text-xs text-slate-500 mb-0.5">Avg Reward</div>
                    <div className={`text-xl font-bold tabular-nums ${rewardColor(result.avg_reward)}`}>
                      {result.avg_reward > 0 ? "+" : ""}{result.avg_reward.toFixed(1)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-night-900 border border-night-700 p-2.5 text-center">
                    <div className="text-xs text-slate-500 mb-0.5">Avg Steps</div>
                    <div className="text-xl font-bold text-cyan-300 tabular-nums">
                      {result.avg_steps.toFixed(0)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-night-900 border border-night-700 p-2.5 text-center">
                    <div className="text-xs text-slate-500 mb-0.5">Collision Rate</div>
                    <div className={`text-xl font-bold tabular-nums ${result.collision_rate > 0.5 ? "text-red-300" : result.collision_rate > 0.2 ? "text-amber-300" : "text-emerald-300"}`}>
                      {(result.collision_rate * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div className="rounded-lg bg-night-900 border border-night-700 p-2.5 text-center">
                    <div className="text-xs text-slate-500 mb-0.5">
                      {result.goal_reach_rate != null ? "Goal Reach Rate" : "Success Rate"}
                    </div>
                    <div className={`text-xl font-bold tabular-nums ${(result.goal_reach_rate ?? result.success_rate) > 0.5 ? "text-emerald-300" : "text-amber-300"}`}>
                      {((result.goal_reach_rate ?? result.success_rate) * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                {/* Per-episode mini-chart */}
                {result.episode_rewards.length > 1 && (
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Episode rewards</div>
                    <div className="flex items-end gap-1 h-10">
                      {result.episode_rewards.map((r, i) => {
                        const max = Math.max(...result.episode_rewards.map(Math.abs), 1);
                        const h = Math.max(4, (Math.abs(r) / max) * 40);
                        return (
                          <div
                            key={i}
                            title={`Ep ${i + 1}: ${r > 0 ? "+" : ""}${r.toFixed(1)}`}
                            style={{ height: h }}
                            className={`flex-1 rounded-sm min-w-[4px] ${r > 0 ? "bg-emerald-500" : "bg-red-500"}`}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Playback controls */}
                {playFrames && playFrames.length > 0 && (
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setPlayIndex(0); setPlayPlaying(true); setShowSim(true); }}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r
                                 from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500
                                 text-white transition-all"
                    >
                      {playPlaying ? "↺ Restart" : showSim ? "▶ Replay" : "▶ Show Simulation"}
                    </button>
                    {playPlaying && (
                      <button
                        onClick={() => setPlayPlaying(false)}
                        className="px-4 py-2 rounded-lg text-xs font-semibold border border-night-600
                                   bg-night-800 text-slate-300 hover:text-white transition-colors"
                      >
                        ⏸
                      </button>
                    )}
                    {showSim && (
                      <button
                        onClick={() => setShowSim(false)}
                        className="px-3 py-2 rounded-lg text-xs border border-night-600
                                   bg-night-800 text-slate-400 hover:text-slate-200 transition-colors"
                      >
                        ✕ Hide
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── Fine-tune (Online Learning) ── */}
            <div className="rounded-xl border border-violet-700/50 bg-violet-900/10 p-3">
              <div className="text-xs text-violet-300 mb-1 font-medium uppercase tracking-widest">
                🧠 Continue Training (Fine-tune)
              </div>
              <div className="text-xs text-slate-500 mb-2">
                Keep training the selected model for more steps using the current environment.
                Updates the model in-place — run Test again to see improvement.
              </div>
              <div className="mb-2">
                <label className="text-xs text-slate-400 block mb-1">
                  Extra steps <span className="text-violet-300 font-mono font-bold">{ftSteps.toLocaleString()}</span>
                </label>
                <input
                  type="range" min={1000} max={200_000} step={1000} value={ftSteps}
                  onChange={(e) => setFtSteps(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
                <div className="flex justify-between text-xs text-slate-600 mt-0.5">
                  <span>1k</span><span>50k</span><span>100k</span><span>200k</span>
                </div>
              </div>
              {ftError && (
                <div className="text-xs text-red-300 mb-2">⚠️ {ftError}</div>
              )}
              {ftResult && (
                <div className="text-xs text-emerald-300 mb-2">
                  ✅ Fine-tuned +{ftResult.additional_steps.toLocaleString()} steps
                  → total {ftResult.total_steps.toLocaleString()} steps
                </div>
              )}
              <button
                onClick={runFineTune}
                disabled={ftLoading || !runId}
                className="w-full py-2 rounded-lg text-xs font-semibold
                           bg-gradient-to-r from-violet-600 to-purple-600
                           hover:from-violet-500 hover:to-purple-500
                           disabled:opacity-50 disabled:cursor-not-allowed
                           text-white transition-all"
              >
                {ftLoading
                  ? `⏳ Training ${ftSteps.toLocaleString()} more steps…`
                  : `▶ Fine-tune ${ftSteps.toLocaleString()} steps`}
              </button>
            </div>

            </div>{/* end config panel */}

            {/* ── Inline Simulation Panel ── */}
            {showSim && playFrames && (
              <div className="flex-1 flex flex-col overflow-hidden bg-night-950/50">
                <div className="flex items-center justify-between px-3 py-2 border-b border-night-700 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full ${playPlaying ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
                    <span className="text-xs text-slate-400 font-medium">
                      {playPlaying ? "Playing…" : "Paused"} · Frame {playIndex + 1} / {playFrames.length}
                    </span>
                    {/* Goal reached badge — show when on last frame and goal was reached */}
                    {!playPlaying && result && result.goal_reach_rate != null && result.goal_reach_rate > 0 && (
                      <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 border border-amber-500/50 text-amber-300">
                        ★ Goal reached {Math.round(result.goal_reach_rate * 100)}% episodes
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => { setPlayIndex(0); setPlayPlaying(true); }}
                      className="text-xs px-2.5 py-1.5 rounded bg-night-700 text-slate-300 hover:bg-night-600"
                    >
                      ↺
                    </button>
                    <button
                      onClick={() => setPlayPlaying((p) => !p)}
                      className="text-xs px-2.5 py-1.5 rounded bg-night-700 text-slate-300 hover:bg-night-600"
                    >
                      {playPlaying ? "⏸" : "▶"}
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-hidden p-2">
                  <SimulationCanvas
                    onSensors={() => {}}
                    apiBase={apiBase}
                    environmentProfile={envProfile}
                    isTrainingActive={false}
                    isTestMode={true}
                    testState={playFrames[playIndex]}
                    projectRobot={projectRobot}
                  />
                </div>
              </div>
            )}
          </div>{/* end flex row */}

          {/* ── Footer ── */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3
                          border-t border-night-700 bg-night-800/60">
            <div className="text-xs text-slate-500">
              {runId ? `Run #${runId} · ${envLabel}` : "Select a run to test"}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-3 py-2 rounded-lg text-xs border border-night-600 text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
              <button
                onClick={runTest}
                disabled={loading || !runId}
                className="px-5 py-2 rounded-lg text-xs font-bold bg-gradient-to-r
                           from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500
                           text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="h-3 w-3 rounded-full border-2 border-white border-t-transparent animate-spin inline-block" />
                    Running…
                  </span>
                ) : "🚀 Run Test"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Environment Templates modal */}
      {showTemplates && (
        <EnvTemplates
          apiBase={apiBase}
          currentKey={envProfile}
          onSelect={(key, label, worldSummary) => { handleEnvSelect(key, label, worldSummary); }}
          onCustomBuild={() => { setShowTemplates(false); setShowBuilder(true); }}
          onClose={() => setShowTemplates(false)}
          profiles={envProfiles}
        />
      )}

      {/* Environment Builder modal */}
      {showBuilder && (
        <EnvBuilder
          onExport={(json) => {
            try {
              const parsed = JSON.parse(json);
              setCustomJson(JSON.stringify(parsed, null, 2));
              setShowCustomJson(true);
              setEnvLabel("Custom Built");
            } catch { setCustomJson(json); }
            setShowBuilder(false);
          }}
          onClose={() => setShowBuilder(false)}
        />
      )}
    </>
  );
};
