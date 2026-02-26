/**
 * TrainingPage – fully self-contained project training workspace.
 * Does NOT use the legacy Sidebar or Header components to avoid
 * any stale-cache issues and to give a clean project-focused UI.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { SimulationCanvas } from "../components/SimulationCanvas";
import { ConsolePanel } from "../components/ConsolePanel";
import { NotificationBanner } from "../components/NotificationBanner";
import { ModelManager } from "../components/ModelManager";
import { SystemStatus } from "../components/SystemStatus";
import { RewardChart } from "../components/RewardChart";
import { EnvTemplates } from "../components/EnvTemplates";
import { EnvBuilder } from "../components/EnvBuilder";
import { QuickTest } from "../components/QuickTest";
import { useTrainingSocket } from "../hooks/useTrainingSocket";
import { robotDesignToEnvConfig, RobotPreviewSVG } from "../components/RobotDesigner";
import type {
  AppPage,
  ProfileOption,
  Project,
  ScenarioBuilderConfig,
  ScenarioMapConfig,
  SensorValue,
  SimulationState,
  TrainingConfig,
  TrainingTemplate,
} from "../types";

interface TrainingPageProps {
  project: Project;
  apiBase: string;
  onNavigate: (page: AppPage, projectId?: string) => void;
  onUpdateProject: (updated: Project) => void;
}

const STATUS_STYLE: Record<string, string> = {
  draft:    "text-slate-400 border-night-600 bg-night-800",
  training: "text-amber-300 border-amber-700 bg-amber-900/30",
  trained:  "text-emerald-300 border-emerald-700 bg-emerald-900/30",
};

export const TrainingPage = ({
  project,
  apiBase,
  onNavigate,
  onUpdateProject,
}: TrainingPageProps) => {
  const { robot } = project;

  // ── training config seeded from wizard ────────────────────────────────────
  const [trainingConfig, setTrainingConfig] = useState<TrainingConfig>({
    steps:              project.steps,
    algorithm:          project.algorithm,
    environmentProfile: project.environmentProfile,
    modelProfile:       project.modelProfile,
  });

  const [algorithms, setAlgorithms] = useState<ProfileOption[]>([
    { key: "PPO",  label: "PPO",  description: "Proximal Policy Optimization" },
    { key: "A2C",  label: "A2C",  description: "Advantage Actor-Critic" },
    { key: "DQN",  label: "DQN",  description: "Deep Q-Network" },
    { key: "SAC",  label: "SAC",  description: "Soft Actor-Critic" },
    { key: "TD3",  label: "TD3",  description: "Twin Delayed DDPG" },
    { key: "DDPG", label: "DDPG", description: "Deep Deterministic Policy Gradient" },
  ]);
  const [environmentProfiles, setEnvironmentProfiles] = useState<ProfileOption[]>([
    { key: "flat_ground_differential_v1", label: "Flat Ground Differential", description: "" },
    { key: "flat_ground_ackermann_v1",    label: "Flat Ground Ackermann",    description: "" },
    { key: "flat_ground_rover_v1",        label: "Flat Ground Rover",        description: "" },
  ]);
  const [modelProfiles, setModelProfiles] = useState<ProfileOption[]>([
    { key: "fast",     label: "Fast",     description: "Small network" },
    { key: "balanced", label: "Balanced", description: "Medium network" },
    { key: "deep",     label: "Deep",     description: "Large network" },
  ]);
  const [_templates, setTemplates] = useState<TrainingTemplate[]>([]);

  const baseCustomEnvJson = useMemo(() => {
    if (project.customEnvironmentJson) return project.customEnvironmentJson;
    return JSON.stringify(robotDesignToEnvConfig(robot), null, 2);
  }, [project]);

  const [customEnvironmentJson, setCustomEnvironmentJson] = useState(baseCustomEnvJson);

  const [scenarioBuilder] = useState<ScenarioBuilderConfig>({
    enabled: false, sensorNoiseStd: 0.02, headingDriftStd: 0.8,
    speedNoiseStd: 0.05, turnNoiseStd: 0.8, randomizeSpawn: true,
    speedScaleMin: 0.85, speedScaleMax: 1.15, turnScaleMin: 0.85, turnScaleMax: 1.15,
  });
  const [scenarioMap] = useState<ScenarioMapConfig>({
    enabled: false, worldWidth: 640, worldHeight: 480, wallMargin: 20,
    defaultObstacleWidth: 110, defaultObstacleHeight: 50,
    obstacles: [], zoom: 1, panX: 0, panY: 0,
  });

  const [sensors,          setSensors]          = useState<SensorValue[]>([]);
  const [consoleMessages,  setConsoleMessages]  = useState<string[]>([
    `🤖 Project: ${project.name}`,
    `🎯 ${project.algorithm} · ${project.environmentProfile} · ${project.modelProfile}`,
    `📊 ${project.steps.toLocaleString()} steps · ${robot.sensors.count} sensors`,
    "👉 Click Start Training to begin.",
  ]);
  const [trainingError,    setTrainingError]    = useState<string | null>(null);
  const [isTrainingActive, setIsTrainingActive] = useState(false);
  const [trainingComplete, setTrainingComplete] = useState(false);
  const [showEnvTemplates, setShowEnvTemplates] = useState(false);
  const [showEnvBuilder, setShowEnvBuilder]     = useState(false);
  const [showQuickTest, setShowQuickTest]       = useState(false);
  const [testPlayback, setTestPlayback] = useState<{
    frames: SimulationState[]; index: number; playing: boolean;
  } | null>(null);
  const [showTestLab,      setShowTestLab]      = useState(false);
  const [notification,     setNotification]     = useState<{
    message: string; type: "success" | "error" | "info" | "warning";
  } | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [showModelManager, setShowModelManager] = useState(false);
  const [isStarting,       setIsStarting]       = useState(false);
  // Tracks when the user just clicked Stop so we don't auto-reactivate training
  // from a stale polling response before the DB update propagates.
  const cancellingRef = useRef(false);
  const [activeTab,        setActiveTab]        = useState<"control"|"sensors"|"advanced">("control");
  const [syncedProfile,    setSyncedProfile]    = useState(false);

  const { metrics, status, resetMetrics } = useTrainingSocket(apiBase);
  const trainingMetrics = useMemo(() => metrics.slice(-60), [metrics]);

  // Detect training completion → show Test / Train Again UX
  useEffect(() => {
    if (status.deploymentReady && isTrainingActive) {
      setIsTrainingActive(false);
      setTrainingComplete(true);
      onUpdateProject({ ...project, status: "trained" });
      setConsoleMessages((p) => [
        "🏆 Training complete! Model ready to test.",
        ...p.slice(0, 5),
      ]);
    }
  }, [status.deploymentReady, status.trainingState]);

  // If backend reports idle/stopped while we think training is active, sync up
  useEffect(() => {
    if (status.trainingState !== "running") {
      // Clear the cancelling flag once the backend confirms it stopped
      cancellingRef.current = false;
    }
    if (isTrainingActive && status.trainingState && status.trainingState !== "running") {
      setIsTrainingActive(false);
    }
    // Auto-detect: if a training run is active on the backend (e.g. after page reload)
    // and the local state doesn't know about it yet, sync up.
    if (!isTrainingActive && !trainingComplete && status.trainingState === "running" && !cancellingRef.current) {
      setIsTrainingActive(true);
    }
  }, [status.trainingState]);

  // playback ticker
  useEffect(() => {
    if (!testPlayback?.playing) return;
    const id = window.setInterval(() => {
      setTestPlayback((p) => {
        if (!p) return p;
        const next = p.index + 1;
        return next >= p.frames.length ? { ...p, index: p.frames.length - 1, playing: false } : { ...p, index: next };
      });
    }, 33);
    return () => window.clearInterval(id);
  }, [testPlayback?.playing, testPlayback?.frames.length]);

  // bootstrap
  useEffect(() => {
    const run = async () => {
      try {
        const [ar, pr, tr] = await Promise.all([
          fetch(`${apiBase}/training-algorithms`),
          fetch(`${apiBase}/training-profiles`),
          fetch(`${apiBase}/training-templates`),
        ]);
        if (ar.ok) {
          const p = await ar.json();
          setAlgorithms(
            (Array.isArray(p) ? p : p.value || []).map((i: Record<string,string>) => ({
              key: i.key, label: i.model_label || i.key,
              description: i.control_mode || i.key,
            }))
          );
        }
        if (pr.ok) {
          const p = await pr.json();
          if (p.environment_profiles) setEnvironmentProfiles(p.environment_profiles);
          if (p.model_profiles)       setModelProfiles(p.model_profiles);
        }
        if (tr.ok) {
          const p = await tr.json();
          setTemplates(Array.isArray(p) ? p : []);
        }
      } catch { /* keep defaults */ }
    };
    run();
  }, []);

  // sync live profile — gate canvas render until POST resolves
  useEffect(() => {
    setSyncedProfile(false);
    let env: Record<string, unknown> | undefined;
    if (customEnvironmentJson.trim()) {
      try { env = JSON.parse(customEnvironmentJson); } catch {
        setSyncedProfile(true);
        return;
      }
    }
    fetch(`${apiBase}/environment/live-profile`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: trainingConfig.environmentProfile, custom_environment: env }),
    })
      .catch(() => {})
      .finally(() => setSyncedProfile(true));
  }, [trainingConfig.environmentProfile, customEnvironmentJson]);

  const handleStartTraining = async () => {
    try {
      setIsStarting(true);
      setTrainingError(null);
      setConsoleMessages((p) => [`🚀 Starting training at ${new Date().toLocaleTimeString()}…`, ...p.slice(0,5)]);

      let env: Record<string,unknown> | undefined;
      if (customEnvironmentJson.trim()) env = JSON.parse(customEnvironmentJson);

      const res = await fetch(`${apiBase}/start-training`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps:               trainingConfig.steps,
          algorithm:           trainingConfig.algorithm,
          environment_profile: trainingConfig.environmentProfile,
          model_profile:       trainingConfig.modelProfile,
          ...(env && { custom_environment: env }),
        }),
      });

      if (res.status === 409) {
        const e = await res.json();
        const msg = e.detail || "Training already running";
        setTrainingError(msg);
        setNotification({ message: msg, type: "warning" });
        setShowNotification(true);
        setConsoleMessages((p) => [`⚠️ ${msg}`, "💡 Stop the current run first.", ...p.slice(0,4)]);
        return;
      }
      if (!res.ok) {
        const e = await res.json();
        const msg = e.detail || "Failed to start training";
        setTrainingError(msg);
        setNotification({ message: msg, type: "error" });
        setShowNotification(true);
        setConsoleMessages((p) => [`❌ ${msg}`, ...p.slice(0,4)]);
        return;
      }

      const result = await res.json();
      resetMetrics();
      setIsTrainingActive(true);
      setNotification({ message: `Training started! Run: ${result.run_id}`, type: "success" });
      setShowNotification(true);
      onUpdateProject({ ...project, status: "training" });
      setConsoleMessages((p) => [
        `✅ Training running (Run: ${result.run_id || "?"})`,
        `📊 ${trainingConfig.algorithm} · ${trainingConfig.modelProfile} · ${trainingConfig.steps.toLocaleString()} steps`,
        `🤖 Robot: ${robot.name} · ${robot.shape} · ${robot.sensors.count} sensors`,
        ...p.slice(0,3),
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setTrainingError(msg);
      setNotification({ message: "Cannot connect to backend", type: "error" });
      setShowNotification(true);
      setConsoleMessages((p) => [`❌ ${msg}`, ...p.slice(0,4)]);
    } finally {
      setIsStarting(false);
    }
  };

  const handleCancelTraining = async () => {
    // Raise the flag BEFORE the request so the auto-detect effect doesn't
    // re-activate training during the brief DB propagation window.
    cancellingRef.current = true;
    try {
      const res    = await fetch(`${apiBase}/cancel-training`, { method: "POST" });
      const result = await res.json();
      setIsTrainingActive(false);
      setTrainingError(null);
      onUpdateProject({ ...project, status: "draft" });
      setNotification({ message: "Training stopped", type: "info" });
      setShowNotification(true);
      setConsoleMessages((p) => [`⏹️ Stopped: ${result.message || "cleared"}`, "🔄 Ready.", ...p.slice(0,4)]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to cancel";
      setConsoleMessages((p) => [`❌ Stop error: ${msg}`, ...p.slice(0,5)]);
    }
  };

  const handleTrainAgain = () => {
    setTrainingComplete(false);
    setTrainingError(null);
    setIsTrainingActive(false);
    setConsoleMessages((p) => ["🔄 Ready for a new training run.", ...p.slice(0, 3)]);
  };

  const envLabel = environmentProfiles.find(e => e.key === trainingConfig.environmentProfile)?.label
    ?? trainingConfig.environmentProfile.replaceAll("_", " ");
  const modelLabel = modelProfiles.find(m => m.key === trainingConfig.modelProfile)?.label
    ?? trainingConfig.modelProfile;

  // ── Smart environment info + model suggestion ─────────────────────────────
  const selectedEnvProfile = environmentProfiles.find(e => e.key === trainingConfig.environmentProfile);
  const envHasGoal = selectedEnvProfile?.world_summary?.has_goal ?? false;
  const isContinuousAlgo = ["SAC", "TD3", "DDPG"].includes(trainingConfig.algorithm);
  const isComplexEnv = ["warehouse_dense", "narrow_corridor", "maze", "city", "goal_chase", "drone", "legged", "apple_field"]
    .some(k => trainingConfig.environmentProfile.toLowerCase().includes(k));
  // deep for goal/complex envs or continuous algos; fast for simple discrete training
  const suggestedModelKey = (envHasGoal || isComplexEnv) ? "deep" : isContinuousAlgo ? "balanced" : "balanced";
  const envObjective = envHasGoal
    ? { label: "🎯 Goal-seeking", hint: "Reach target · avoid obstacles · +100 reward on reach", color: "text-amber-300 border-amber-700/40 bg-amber-900/20" }
    : isComplexEnv
    ? { label: "🏗️ Complex navigation", hint: "Navigate dense/complex layout · maximise safe distance", color: "text-blue-300 border-blue-700/40 bg-blue-900/20" }
    : { label: "🧭 Free navigation", hint: "Avoid obstacles · explore · maximise displacement reward", color: "text-cyan-300 border-cyan-700/40 bg-cyan-900/20" };

  return (
    <div className="h-screen flex flex-col bg-night-900 text-slate-100 overflow-hidden">

      <NotificationBanner
        message={notification?.message || ""}
        type={notification?.type || "info"}
        show={showNotification}
        onClose={() => setShowNotification(false)}
      />

      {/* ── Top nav bar ──────────────────────────────────────────────────── */}
      <nav className="flex-shrink-0 h-14 flex items-center justify-between px-5
                      border-b border-night-700 bg-night-900/95 backdrop-blur-sm z-10">
        {/* Left: back + project identity */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => onNavigate("home")}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200
                       px-2.5 py-1.5 rounded-lg hover:bg-night-800 transition-colors flex-shrink-0"
          >
            ← Projects
          </button>
          <div className="w-px h-4 bg-night-700 flex-shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-600 to-violet-600
                            flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {project.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-100 leading-none truncate">{project.name}</div>
              <div className="text-xs text-slate-500 mt-0.5 capitalize truncate">
                {robot.movementType} · {robot.shape} · {robot.sensors.count} sensors
              </div>
            </div>
          </div>
          <span className={`flex-shrink-0 px-2.5 py-0.5 rounded-full border text-xs font-semibold capitalize
                            ${STATUS_STYLE[project.status] ?? STATUS_STYLE.draft}`}>
            {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
          </span>
          {/* Quick-glance training chips */}
          <div className="hidden lg:flex items-center gap-1.5 ml-1">
            <span className="px-2.5 py-0.5 rounded-md bg-violet-900/30 border border-violet-700/40
                             text-xs text-violet-300 font-mono">
              {trainingConfig.algorithm}
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-night-800 border border-night-700
                             text-xs text-slate-400 truncate max-w-[160px]">
              {envLabel.replace(/flat ground /i, "").replace(/ \(v\d\)/i, "")}
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-night-800 border border-night-700
                             text-xs text-slate-400">
              {(trainingConfig.steps / 1000).toFixed(0)}K steps
            </span>
          </div>
        </div>

        {/* Right: actions + live badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowModelManager(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-night-700
                       bg-night-800 hover:bg-night-700 text-xs text-slate-300 transition-colors"
          >
            📦 Models
          </button>
          {isTrainingActive && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-700/40
                            bg-emerald-900/20 text-xs text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </div>
          )}
        </div>
      </nav>

      {/* ── Main 3-column layout ─────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left panel – robot identity + specs */}
        <aside className="w-[240px] flex-shrink-0 flex flex-col gap-3 p-4 overflow-y-auto
                          border-r border-night-700 bg-gradient-to-b from-night-900 to-night-800">
          {/* Robot preview */}
          <div className="rounded-xl border border-night-700 bg-night-800/60 p-3
                          flex flex-col items-center gap-2">
            <RobotPreviewSVG design={robot} size={110} />
            <div className="text-center">
              <div className="text-sm font-bold text-slate-100 truncate w-full max-w-[160px]">{robot.name}</div>
              <div className="text-xs text-slate-500 mt-0.5 capitalize">{robot.shape} · {robot.movementType}</div>
            </div>
          </div>

          {/* Robot specs */}
          <div className="rounded-xl border border-night-700 bg-night-800/60 p-2.5">
            <div className="text-xs uppercase tracking-widest text-violet-400 mb-2">Robot</div>
            {[
              ["Sensors",  `${robot.sensors.count} rays`],
              ["FOV",      `${robot.sensors.fov}°`],
              ["Range",    `${robot.sensors.range}px`],
              ["Layout",   robot.sensors.placement],
              ["Speed",    `${robot.speed}px/s`],
              ["Turning",  `${robot.turnRate}°`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center py-0.5
                                       border-b border-night-700/40 last:border-0 text-xs">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-300 font-mono capitalize">{v}</span>
              </div>
            ))}
          </div>

          {/* Compact live strip – full stats live in the right Control panel */}
          {isTrainingActive && (
            <div className="rounded-xl border border-amber-700/40 bg-amber-900/10 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-amber-400">Live</span>
                  <span className="text-xs text-amber-300 font-mono">
                  Ep&nbsp;<strong>{status.episode}</strong>
                  &nbsp;·&nbsp;
                  {status.reward >= 0 ? "+" : ""}{status.reward.toFixed(1)}
                </span>
              </div>
              {status.totalSteps != null && status.totalSteps > 0 && (
                <>
                  <div className="h-1.5 rounded-full bg-night-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all"
                      style={{ width: `${((status.completedSteps ?? 0) / status.totalSteps) * 100}%` }}
                    />
                  </div>
                  <div className="text-xs text-slate-500 text-right">
                    {(((status.completedSteps ?? 0) / status.totalSteps) * 100).toFixed(1)}% complete
                  </div>
                </>
              )}
            </div>
          )}
        </aside>

        {/* Center – canvas fills all available space, slim log at bottom */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 p-3 min-h-0">
            {syncedProfile ? (
              <SimulationCanvas
                onSensors={setSensors}
                apiBase={apiBase}
                environmentProfile={trainingConfig.environmentProfile}
                isTrainingActive={isTrainingActive}
                trainingEpisode={status.episode}
                trainingReward={status.reward}
                projectRobot={robot ? {
                  shape:           robot.shape,
                  color:           robot.color,
                  sensorCount:     robot.sensors.count,
                  sensorFov:       robot.sensors.fov,
                  sensorRange:     robot.sensors.range,
                  sensorPlacement: robot.sensors.placement,
                } : undefined}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <span className="text-slate-400 text-sm animate-pulse">⚙️ Preparing simulation environment…</span>
              </div>
            )}
          </div>
          <ConsolePanel messages={consoleMessages} />
        </main>

        {/* Right panel – two zones: scrollable content + sticky action buttons */}
        <aside className="w-[340px] flex-shrink-0 flex flex-col border-l border-night-700
                          bg-gradient-to-b from-night-900 to-night-800 overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-night-700 flex-shrink-0">
            {(["control", "sensors", "advanced"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`flex-1 py-3 text-xs font-semibold capitalize tracking-wide transition-colors
                  ${activeTab === t
                    ? "text-cyan-300 border-b-2 border-cyan-500 bg-night-800/40"
                    : "text-slate-500 hover:text-slate-300"}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {activeTab === "control" && (
              <>
                {/* Live stats strip – visible at a glance, no scrolling needed */}
                {isTrainingActive && (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Episode", value: status.episode,           color: "text-emerald-300" },
                      { label: "Reward",  value: status.reward.toFixed(1),  color: status.reward >= 0 ? "text-cyan-300" : "text-red-300" },
                      { label: "Loss",    value: status.loss.toFixed(4),    color: "text-amber-300" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-lg border border-night-700 bg-night-900/60 p-2 text-center">
                        <div className="text-xs text-slate-500 mb-0.5 uppercase tracking-wide">{label}</div>
                        <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Reward chart – only shown while training is active */}
                {isTrainingActive && (
                <div className="rounded-xl border border-night-700 bg-night-800/60 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs uppercase tracking-widest text-cyan-400">Reward</div>
                    <div className="text-xs text-slate-500">last 60 ep</div>
                  </div>
                  <RewardChart data={trainingMetrics} />
                </div>
                )}

                {/* Training config */}
                <div className="rounded-xl border border-night-700 bg-night-800/60 p-3 space-y-2.5">
                  <div className="text-xs uppercase tracking-widest text-amber-400">Config</div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Algorithm</label>
                    <select
                      className="w-full rounded-lg border border-night-600 bg-night-900 px-3 py-2.5
                                 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                      value={trainingConfig.algorithm}
                      onChange={(e) => setTrainingConfig({ ...trainingConfig, algorithm: e.target.value as TrainingConfig["algorithm"] })}
                    >
                      {algorithms.map((a) => (
                        <option key={a.key} value={a.key}>{a.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center mb-1">
                      <label className="text-xs text-slate-400 flex-1">Environment</label>
                      <button
                        onClick={() => setShowEnvTemplates(true)}
                        className="text-xs px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/20 transition-colors"
                      >
                        🗂️ Templates
                      </button>
                    </div>
                    <select
                      className="w-full rounded-lg border border-night-600 bg-night-900 px-3 py-2.5
                                 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                      value={trainingConfig.environmentProfile}
                      onChange={(e) => setTrainingConfig({ ...trainingConfig, environmentProfile: e.target.value })}
                    >
                      {environmentProfiles.map((e) => (
                        <option key={e.key} value={e.key}>{e.label}</option>
                      ))}
                    </select>
                    {/* Training objective hint */}
                    <div className={`mt-1.5 flex flex-col gap-0.5 rounded-lg border px-2.5 py-1.5 ${envObjective.color}`}>
                      <span className="text-xs font-semibold">{envObjective.label}</span>
                      <span className="text-xs opacity-80">{envObjective.hint}</span>
                    </div>
                  </div>

                  <div>
                    <label className="flex justify-between text-xs text-slate-400 mb-1.5">
                      Model size
                      {trainingConfig.modelProfile !== suggestedModelKey && (
                        <button
                          onClick={() => setTrainingConfig({ ...trainingConfig, modelProfile: suggestedModelKey })}
                          className="text-cyan-400 hover:text-cyan-300 transition-colors"
                        >
                          → Use suggested: {suggestedModelKey}
                        </button>
                      )}
                    </label>
                    <select
                      className="w-full rounded-lg border border-night-600 bg-night-900 px-3 py-2.5
                                 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none"
                      value={trainingConfig.modelProfile}
                      onChange={(e) => setTrainingConfig({ ...trainingConfig, modelProfile: e.target.value })}
                    >
                      {modelProfiles.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}{m.key === suggestedModelKey ? " ✓ Suggested" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex justify-between text-xs text-slate-400 mb-1.5">
                      Steps
                      <span className="text-cyan-300 font-mono">{trainingConfig.steps.toLocaleString()}</span>
                    </label>
                    <input
                      type="range" min={1000} max={200000} step={1000}
                      value={trainingConfig.steps}
                      onChange={(e) => setTrainingConfig({ ...trainingConfig, steps: Number(e.target.value) })}
                      className="w-full accent-cyan-500"
                    />
                    <div className="flex justify-between text-xs text-slate-600 mt-0.5">
                      <span>1K</span><span>100K</span><span>200K</span>
                    </div>
                  </div>
                </div>

                {/* Start / stop — removed from scroll, handled by sticky zone below */}
                {trainingError && (
                  <div className="rounded-xl border border-red-500/40 bg-red-900/20 p-3 text-xs text-red-300">
                    ⚠️ {trainingError}
                  </div>
                )}
              </>
            )}

            {activeTab === "sensors" && (
              <div className="rounded-xl border border-night-700 bg-night-800/60 p-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-widest text-purple-400">Sensor Rays</div>
                  <div className="text-xs text-slate-500">{sensors.length} rays</div>
                </div>
                {sensors.length === 0 ? (
                  <div className="rounded-lg border border-night-700 px-3 py-8 text-center
                                  text-xs text-slate-500 italic">
                    Start simulation to see sensor data
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {sensors.map((s) => {
                      const pct = 1 - s.distance;
                      return (
                        <div key={s.index}
                          className="rounded-lg border border-night-700 bg-night-900/60 px-3 py-2">
                            <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-500">Ray {s.index + 1}</span>
                            <span className={`font-bold font-mono ${pct > 0.7 ? "text-red-400" : pct > 0.4 ? "text-amber-300" : "text-emerald-300"}`}>
                              {s.distance.toFixed(2)}
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-night-800">
                            <div
                              className={`h-full rounded-full transition-all ${pct > 0.7 ? "bg-red-500" : pct > 0.4 ? "bg-amber-400" : "bg-emerald-400"}`}
                              style={{ width: `${Math.min(pct * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === "advanced" && (
              <div className="space-y-3">
                <div className="rounded-xl border border-night-700 bg-night-800/60 p-3">
                  <div className="text-xs uppercase tracking-widest text-slate-400 mb-2">Custom Environment JSON</div>
                  <textarea
                    className="w-full rounded-lg border border-night-600 bg-night-900 p-2.5 text-xs
                               font-mono text-slate-300 focus:border-cyan-500 focus:outline-none resize-none"
                    rows={10}
                    value={customEnvironmentJson}
                    onChange={(e) => setCustomEnvironmentJson(e.target.value)}
                    placeholder="{}"
                  />
                  <div className="text-xs text-slate-600 mt-1">
                    Override robot/environment settings per run
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* — Sticky action buttons, always visible at bottom — */}
          <div className="flex-shrink-0 p-3 pt-0 space-y-2 border-t border-night-700 bg-night-900/90">
            {trainingComplete ? (
              <>
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-900/20 p-2.5 text-center">
                  <div className="text-emerald-300 font-semibold text-sm">🎉 Training Complete!</div>
                  <div className="text-xs text-slate-400 mt-0.5">Your model is ready to test.</div>
                </div>
                <button
                  onClick={() => setShowQuickTest(true)}
                  className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-900/30 transition-all active:scale-95"
                >
                  🧪 Test Model
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={handleTrainAgain}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold border border-night-700 bg-night-800 text-slate-300 hover:border-cyan-700/50 hover:text-cyan-300 transition-colors"
                  >
                    🔄 Train Again
                  </button>
                  {status.deploymentReady && status.runId && (
                    <a
                      href={`${apiBase}/download-model?format=bundle&run_id=${status.runId}`}
                      target="_blank" rel="noreferrer"
                      className="flex-1 flex items-center justify-center rounded-xl py-2 border border-cyan-700/40 bg-cyan-900/10 text-cyan-300 text-xs font-semibold hover:bg-cyan-900/20 transition-colors"
                    >
                      📦 Download
                    </a>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={handleStartTraining}
                  disabled={isStarting || isTrainingActive}
                  className={`w-full rounded-xl py-3 text-sm font-bold transition-all active:scale-95
                             ${
                               isStarting || isTrainingActive
                                 ? "bg-gradient-to-r from-emerald-700 to-cyan-700 opacity-60 cursor-not-allowed"
                                 : "bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 shadow-lg shadow-emerald-900/30"
                             } text-white`}
                >
                  {isStarting ? "⏳ Starting…" : isTrainingActive ? "🎯 Training in Progress…" : "🚀 Start Training"}
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={handleCancelTraining}
                    disabled={!isTrainingActive}
                    className="flex-1 rounded-xl py-2 text-xs font-semibold transition-all
                               border border-night-700 bg-night-800 text-slate-400
                               hover:border-red-700/50 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    ⏹️ Stop
                  </button>
                  {status.deploymentReady && status.runId ? (
                    <a
                      href={`${apiBase}/download-model?format=bundle&run_id=${status.runId}`}
                      target="_blank" rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-1 rounded-xl py-2
                                 border border-cyan-700/40 bg-cyan-900/10 text-cyan-300 text-xs font-semibold
                                 hover:bg-cyan-900/20 transition-colors"
                    >
                      📦 Download
                    </a>
                  ) : (
                    <div className="flex-1 flex items-center justify-center rounded-xl py-2
                                    border border-night-700 text-slate-600 text-xs">
                      {status.deploymentReady ? "Ready ✓" : "Not trained"}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
      </div>{/* end 3-col */}

      {/* Quick Test modal */}
      {showQuickTest && (
        <QuickTest
          apiBase={apiBase}
          runId={status.runId ?? null}
          defaultEnvProfile={trainingConfig.environmentProfile}
          projectRobot={robot ? {
            shape:           robot.shape,
            color:           robot.color,
            sensorCount:     robot.sensors.count,
            sensorFov:       robot.sensors.fov,
            sensorRange:     robot.sensors.range,
            sensorPlacement: robot.sensors.placement,
          } : undefined}
          defaultCustomJson={customEnvironmentJson}
          onPlaybackStart={(frames) => {
            setTestPlayback({ frames, index: 0, playing: true });
            setShowTestLab(true);
          }}
          onPlaybackStop={() => { setTestPlayback(null); setShowTestLab(false); }}
          isPlaying={Boolean(testPlayback?.playing)}
          onClose={() => setShowQuickTest(false)}
        />
      )}

      {/* Environment Templates picker */}
      {showEnvTemplates && (
        <EnvTemplates
          apiBase={apiBase}
          currentKey={trainingConfig.environmentProfile}
          onSelect={(key, label) => {
            setTrainingConfig((c) => ({ ...c, environmentProfile: key }));
            setEnvironmentProfiles((p) =>
              p.find((e) => e.key === key) ? p : [...p, { key, label, description: "" }]
            );
          }}
          onCustomBuild={() => { setShowEnvTemplates(false); setShowEnvBuilder(true); }}
          onClose={() => setShowEnvTemplates(false)}
        />
      )}

      {/* Environment Builder */}
      {showEnvBuilder && (
        <EnvBuilder
          onExport={(json) => {
            setCustomEnvironmentJson(() => {
              try {
                const newParts = JSON.parse(json);
                return JSON.stringify(newParts, null, 2);
              } catch { return json; }
            });
            setShowEnvBuilder(false);
            setActiveTab("advanced");
          }}
          onClose={() => setShowEnvBuilder(false)}
        />
      )}

      {/* Model Manager overlay */}
      {showModelManager && (
        <ModelManager
          apiBase={apiBase}
          onClose={() => setShowModelManager(false)}
          onTestPlaybackStart={(frames) => { setTestPlayback({ frames, index: 0, playing: true }); setShowTestLab(true); }}
          onTestPlaybackStop={() => { setTestPlayback(null); setShowTestLab(false); }}
          isTestMode={Boolean(testPlayback)}
        />
      )}

      {/* Test Lab overlay */}
      {showTestLab && testPlayback && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-[95vw] max-w-5xl bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-100">Test Lab</div>
                <div className="text-xs text-slate-400">Rollout playback</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTestPlayback((p) => p ? { ...p, index: 0, playing: true } : p)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-600/20 border border-cyan-500/50 text-cyan-200 text-xs font-semibold"
                >
                  Replay
                </button>
                <button
                  onClick={() => { setTestPlayback(null); setShowTestLab(false); }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-600 text-xs"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="p-5">
              <SimulationCanvas
                onSensors={() => {}}
                apiBase={apiBase}
                environmentProfile={trainingConfig.environmentProfile}
                isTrainingActive={false}
                isTestMode={true}
                testState={testPlayback.frames[testPlayback.index]}
                projectRobot={robot ? {
                  shape:           robot.shape,
                  color:           robot.color,
                  sensorCount:     robot.sensors.count,
                  sensorFov:       robot.sensors.fov,
                  sensorRange:     robot.sensors.range,
                  sensorPlacement: robot.sensors.placement,
                } : undefined}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
