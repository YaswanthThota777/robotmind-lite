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
  draft:    "text-slate-400 border-slate-700 bg-slate-900",
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

  // -- training config seeded from wizard ------------------------------------
  const [trainingConfig, setTrainingConfig] = useState<TrainingConfig>({
    steps:              project.steps,
    algorithm:          project.algorithm,
    environmentProfile: project.environmentProfile,
    modelProfile:       project.modelProfile,
    memoryMode:         project.memoryMode ?? "visited_grid",
    goalRandomize:      project.goalRandomize ?? true,
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
    { key: "flat_ground_differential_v1",  label: "Flat Ground Differential",    description: "" },
    { key: "flat_ground_ackermann_v1",     label: "Flat Ground Ackermann",       description: "" },
    { key: "flat_ground_rover_v1",         label: "Flat Ground Rover",           description: "" },
    { key: "arena_basic",                  label: "Arena Basic",                 description: "" },
    { key: "warehouse_dense",              label: "Warehouse Dense",             description: "" },
    { key: "corridor_sprint",              label: "Narrow Corridors",            description: "" },
    { key: "autonomous_driving_city",      label: "City Streets",                description: "" },
    { key: "legged_robot_terrain",         label: "Rough Terrain",               description: "" },
    { key: "drone_flight_indoor",          label: "Indoor Drone",                description: "" },
    { key: "humanoid_balance_lab",         label: "Humanoid Balance Lab",        description: "" },
    { key: "software_anomaly_graph",       label: "Anomaly Graph",               description: "" },
    { key: "goal_chase",                   label: "Goal Chase",                  description: "" },
    { key: "apple_field",                  label: "Apple Field",                 description: "" },
    { key: "flat_ground_cluttered_v2",     label: "Cluttered Room",              description: "" },
    { key: "flat_ground_multi_room",       label: "Multi-Room Navigation",       description: "" },
    { key: "flat_ground_stress_test",      label: "Stress Test",                 description: "" },
    { key: "flat_ground_dead_end_recovery",label: "Dead-End Recovery",           description: "" },
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
  const [isStopping,       setIsStopping]       = useState(false);
  const [activeRuns,        setActiveRuns]       = useState<Array<{ id: number; environment: string; model_label: string; status: string }>>([]);
  const [selectedRunId,     setSelectedRunId]    = useState<number | null>(null);
  // Tracks when the user just clicked Stop so we don't auto-reactivate training
  // from a stale polling response before the DB update propagates.
  const cancellingRef = useRef(false);
  // Incremented every time a new training run succeeds — forces SimulationCanvas
  // to fully remount (fresh canvas, no stale old-run pixels).
  const [trainingKey,      setTrainingKey]      = useState(0);
  // The run_id that THIS project component started. Auto-detect will only fire
  // for this run — prevents other projects' training from bleeding in as "active".
  const activeRunIdRef = useRef<number | null>(null);
  // Prevent repeated auto-resume console spam after polling.
  const autoResumeRef = useRef(false);
  const [activeTab,        setActiveTab]        = useState<"control"|"sensors"|"advanced">("control");
  const [syncedProfile,    setSyncedProfile]    = useState(false);

  const { metrics, status, resetMetrics } = useTrainingSocket(apiBase);
  const trainingMetrics = useMemo(() => metrics.slice(-60), [metrics]);
  const backendIsRunning = status.trainingState === "running";

  // Detect training completion - show Test / Train Again UX
  useEffect(() => {
    if (status.deploymentReady && isTrainingActive) {
      setIsTrainingActive(false);
      setTrainingComplete(true);
      onUpdateProject({ ...project, status: "trained" });
      setConsoleMessages((p) => [
        "✅ Training complete! Model ready to test.",
        ...p.slice(0, 5),
      ]);
    }
  }, [status.deploymentReady, status.trainingState]);

  // Poll active runs so user can attach to live training after reload
  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(`${apiBase}/training-runs?limit=20`);
        if (!res.ok) return;
        const runs = await res.json();
        if (!active || !Array.isArray(runs)) return;
        const running = runs
          .filter((r) => r.status === "running")
          .map((r) => ({
            id: Number(r.id ?? r.run_id),
            environment: String(r.environment ?? ""),
            model_label: String(r.model_label ?? ""),
            status: String(r.status ?? ""),
          }))
          .filter((r) => Number.isFinite(r.id));
        setActiveRuns(running);
        if (running.length === 0) {
          setSelectedRunId(null);
          return;
        }
        if (selectedRunId && !running.find((r) => r.id === selectedRunId)) {
          setSelectedRunId(null);
        }
        if (status.trainingState === "running" && selectedRunId == null && status.runId) {
          setSelectedRunId(Number(status.runId));
        }
      } catch {
        // ignore polling errors
      }
    };

    poll();
    const id = window.setInterval(poll, 3000);
    return () => {
      active = false;
      window.clearInterval(id);
    };
  }, [apiBase, selectedRunId, status.runId, status.trainingState]);

  // If backend reports idle/stopped while we think training is active, sync up
  useEffect(() => {
    if (status.trainingState !== "running") {
      // Clear the cancelling flag once the backend confirms it stopped
      cancellingRef.current = false;
      autoResumeRef.current = false;
    }
    if (isTrainingActive && status.trainingState && status.trainingState !== "running") {
      setIsTrainingActive(false);
    }
    // Auto-detect: if a training run is active on the backend (e.g. after page reload)
    // and the local state doesn't know about it yet, sync up.
    // ONLY fire if the running run_id matches a run WE started — prevents other
    // projects' training from being shown as active on this project's page.
    if (!trainingComplete && status.trainingState === "running" && !cancellingRef.current) {
      if (activeRunIdRef.current == null) {
        activeRunIdRef.current = status.runId ?? null;
      }
      if (!isTrainingActive) {
        setIsTrainingActive(true);
      }
      if (!autoResumeRef.current && status.runId) {
        setTrainingKey((k) => k + 1);
        setConsoleMessages((p) => [`🔁 Resumed live training (Run: ${status.runId})`, ...p.slice(0, 4)]);
        autoResumeRef.current = true;
      }
    }
  }, [status.trainingState, status.runId]);

  useEffect(() => {
    if (selectedRunId == null) return;
    activeRunIdRef.current = selectedRunId;
    setIsTrainingActive(true);
    setTrainingKey((k) => k + 1);
    setConsoleMessages((p) => [`🎯 Viewing training run ${selectedRunId}`, ...p.slice(0, 4)]);
  }, [selectedRunId]);

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
      if (customEnvironmentJson.trim()) {
        try {
          env = JSON.parse(customEnvironmentJson);
        } catch {
          const msg = "Custom environment JSON is invalid.";
          setTrainingError(msg);
          setNotification({ message: msg, type: "error" });
          setShowNotification(true);
          setConsoleMessages((p) => [`❌ ${msg}`, ...p.slice(0,4)]);
          return;
        }
      }

      // Best-effort sync so live preview matches the selected environment on start.
      try {
        await fetch(`${apiBase}/environment/live-profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: trainingConfig.environmentProfile, custom_environment: env }),
        });
      } catch {
        setNotification({ message: "Live environment preview could not be updated.", type: "warning" });
        setShowNotification(true);
      }

      const res = await fetch(`${apiBase}/start-training`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps:               trainingConfig.steps,
          algorithm:           trainingConfig.algorithm,
          environment_profile: trainingConfig.environmentProfile,
          model_profile:       trainingConfig.modelProfile,
          memory_mode:         memoryMode,
          goal_randomize:      envHasGoal ? goalRandomize : undefined,
          ...(env && { custom_environment: env }),
        }),
      });

      if (res.status === 409) {
        const e = await res.json();
        const msg = e.detail || "Training already running";
        setTrainingError(msg);
        setNotification({ message: msg, type: "warning" });
        setShowNotification(true);
        setConsoleMessages((p) => [`⚠️ ${msg}`, "⚠️ Stop the current run first.", ...p.slice(0,4)]);
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
      setTrainingKey(k => k + 1);   // remount canvas — clears old simulation frame
      activeRunIdRef.current = result.run_id ?? null;  // bind this run to this project
      setIsTrainingActive(true);
      setNotification({ message: `Training started! Run: ${result.run_id}`, type: "success" });
      setShowNotification(true);
      onUpdateProject({ ...project, status: "training" });
      setConsoleMessages((p) => [
        `🟢 Training running (Run: ${result.run_id || "?"})`,
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
      setIsStopping(true);
      const res    = await fetch(`${apiBase}/cancel-training`, { method: "POST" });
      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}));
        const msg = errorPayload?.detail || "Failed to stop training";
        setNotification({ message: msg, type: "error" });
        setShowNotification(true);
        setConsoleMessages((p) => [`❌ Stop error: ${msg}`, ...p.slice(0,5)]);
        return;
      }
      const result = await res.json();
      setIsTrainingActive(false);
      setTrainingError(null);
      onUpdateProject({ ...project, status: "draft" });
      setNotification({ message: "Training stopped", type: "info" });
      setShowNotification(true);
      setConsoleMessages((p) => [`⏹️ Stopped: ${result.message || "cleared"}`, "✅ Ready.", ...p.slice(0,4)]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to cancel";
      setConsoleMessages((p) => [`❌ Stop error: ${msg}`, ...p.slice(0,5)]);
    } finally {
      setIsStopping(false);
    }
  };

  const handleTrainAgain = () => {
    setTrainingComplete(false);
    setTrainingError(null);
    setIsTrainingActive(false);
    setConsoleMessages((p) => ["✅ Ready for a new training run.", ...p.slice(0, 3)]);
  };

  const envLabel = environmentProfiles.find(e => e.key === trainingConfig.environmentProfile)?.label
    ?? trainingConfig.environmentProfile.replaceAll("_", " ");
  const modelLabel = modelProfiles.find(m => m.key === trainingConfig.modelProfile)?.label
    ?? trainingConfig.modelProfile;

  // -- Smart environment info + model suggestion -----------------------------
  const selectedEnvProfile = environmentProfiles.find(e => e.key === trainingConfig.environmentProfile);
  const envHasGoal = selectedEnvProfile?.world_summary?.has_goal ?? false;
  const isContinuousAlgo = ["SAC", "TD3", "DDPG"].includes(trainingConfig.algorithm);
  const isComplexEnv = ["warehouse_dense", "narrow_corridor", "corridor_sprint", "maze", "city", "goal_chase", "drone", "legged", "apple_field", "cluttered", "multi_room", "stress_test", "dead_end", "humanoid", "anomaly"]
    .some(k => trainingConfig.environmentProfile.toLowerCase().includes(k));
  // deep for goal/complex envs or continuous algos; fast for simple discrete training
  const suggestedModelKey = (envHasGoal || isComplexEnv) ? "deep" : isContinuousAlgo ? "balanced" : "balanced";
  const envObjective = envHasGoal
    ? { label: "🎯 Goal-seeking", hint: "Reach target · avoid obstacles · +100 reward on reach", color: "text-amber-300 border-amber-700/40 bg-amber-900/20" }
    : isComplexEnv
    ? { label: "🏗️ Complex navigation", hint: "Navigate dense/complex layout · maximise safe distance", color: "text-blue-300 border-blue-700/40 bg-blue-900/20" }
    : { label: "🧭 Free navigation", hint: "Avoid obstacles · explore · maximise displacement reward", color: "text-teal-300 border-teal-700/40 bg-teal-900/20" };
  const memoryMode = trainingConfig.memoryMode ?? "visited_grid";
  const goalRandomize = trainingConfig.goalRandomize ?? true;

  return (
    <div className="h-screen flex flex-col rm-grid-bg text-slate-100 overflow-hidden">

      <NotificationBanner
        message={notification?.message || ""}
        type={notification?.type || "info"}
        show={showNotification}
        onClose={() => setShowNotification(false)}
      />

      {/* -- Top nav bar ---------------------------------------------------- */}
      <nav className="flex-shrink-0 h-16 flex items-center justify-between px-6
              border-b border-slate-800/60 bg-[#0b1120]/80 backdrop-blur-md z-10">
        {/* Left: back + project identity */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => onNavigate("home")}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200
                       px-2.5 py-1.5 rounded-lg hover:bg-slate-900 transition-colors flex-shrink-0"
          >
            Back to Projects
          </button>
          <div className="w-px h-4 bg-slate-800 flex-shrink-0" />
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-amber-400
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
            <span className="px-2.5 py-0.5 rounded-md bg-teal-900/30 border border-teal-700/40
                             text-xs text-teal-200 font-mono">
              {trainingConfig.algorithm}
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-slate-900 border border-slate-800
                             text-xs text-slate-400 truncate max-w-[160px]">
              {envLabel.replace(/flat ground /i, "").replace(/ \(v\d\)/i, "")}
            </span>
            <span className="px-2.5 py-0.5 rounded-md bg-slate-900 border border-slate-800
                             text-xs text-slate-400">
              {(trainingConfig.steps / 1000).toFixed(0)}K steps
            </span>
          </div>
        </div>

        {/* Right: actions + live badge */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowModelManager(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-800
                       bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 transition-colors"
          >
            Models
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

      {/* -- Main 3-column layout ------------------------------------------- */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Left panel - robot identity + specs */}
        <aside className="w-[220px] flex-shrink-0 flex flex-col gap-3 p-4 overflow-y-auto rm-scrollbar
              border-r border-slate-800/60 bg-[#0b1120]/70">
          {/* Robot preview */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3
                          flex flex-col items-center gap-2">
            <RobotPreviewSVG design={robot} size={110} />
            <div className="text-center">
              <div className="text-sm font-bold text-slate-100 truncate w-full max-w-[160px]">{robot.name}</div>
              <div className="text-xs text-slate-500 mt-0.5 capitalize">{robot.shape} · {robot.movementType}</div>
            </div>
          </div>

          {/* Robot specs */}
          <div className="rounded-xl border border-slate-800/70 bg-[#0f172a]/70 p-2.5">
            <div className="text-xs uppercase tracking-widest text-amber-300 mb-2">Robot</div>
            {[
              ["Sensors",  `${robot.sensors.count} rays`],
              ["FOV",      `${robot.sensors.fov}deg`],
              ["Range",    `${robot.sensors.range}px`],
              ["Layout",   robot.sensors.placement],
              ["Speed",    `${robot.speed}px/s`],
              ["Turning",  `${robot.turnRate}deg`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between items-center py-0.5
                                       border-b border-slate-800/40 last:border-0 text-xs">
                <span className="text-slate-500">{k}</span>
                <span className="text-slate-300 font-mono capitalize">{v}</span>
              </div>
            ))}
          </div>

          {/* Compact live strip - full stats live in the right Control panel */}
          {isTrainingActive && (
            <div className="rounded-xl border border-amber-600/40 bg-amber-900/10 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-widest text-amber-400">Live</span>
                  <span className="text-xs text-amber-300 font-mono">
                  Ep&nbsp;<strong>{status.episode}</strong>
                  &nbsp;|&nbsp;
                  {status.reward >= 0 ? "+" : ""}{status.reward.toFixed(1)}
                </span>
              </div>
              {status.totalSteps != null && status.totalSteps > 0 && (
                <>
                  <div className="h-1.5 rounded-full bg-slate-900 overflow-hidden">
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

        {/* Center - canvas fills all available space, slim log at bottom */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="flex-1 p-4 min-h-0">
            <div className="h-full rounded-2xl border border-slate-800/70 bg-[#0b1120]/70 shadow-2xl shadow-black/40 overflow-hidden">
              {syncedProfile ? (
                <SimulationCanvas
                  key={trainingKey}
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
                <div className="flex h-full flex-col items-center justify-center gap-5 p-10">
                  <div className="flex flex-col gap-3 w-full max-w-sm">
                    <div className="rm-skeleton h-4 w-3/4 mx-auto" />
                    <div className="rm-skeleton h-4 w-1/2 mx-auto" />
                  </div>
                  <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
                    <div className="rm-skeleton h-16" />
                    <div className="rm-skeleton h-16" />
                    <div className="rm-skeleton h-16" />
                  </div>
                  <div className="rm-skeleton h-32 w-full max-w-sm" />
                  <p className="text-slate-500 text-xs tracking-wide">Syncing environment&hellip;</p>
                </div>
              )}
            </div>
          </div>
          <ConsolePanel messages={consoleMessages} />
        </main>

        {/* Right panel - two zones: scrollable content + sticky action buttons */}
        <aside className="w-[360px] flex-shrink-0 flex flex-col border-l border-slate-800/60
              bg-[#0b1120]/70 overflow-hidden">

          {/* Tab bar */}
          <div className="flex border-b border-slate-800 flex-shrink-0">
            {(["control", "sensors", "advanced"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={`flex-1 py-3 text-xs font-semibold capitalize tracking-wide transition-colors
                  ${activeTab === t
                    ? "text-teal-300 border-b-2 border-teal-500 bg-slate-900/40"
                    : "text-slate-500 hover:text-slate-300"}`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 rm-scrollbar">
            {activeTab === "control" && (
              <>
                {/* Live stats strip - visible at a glance, no scrolling needed */}
                {isTrainingActive && (
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Episode", value: status.episode,           color: "text-emerald-300" },
                      { label: "Reward",  value: status.reward.toFixed(1),  color: status.reward >= 0 ? "text-teal-300" : "text-red-300" },
                      { label: "Loss",    value: status.loss.toFixed(4),    color: "text-amber-300" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-center">
                        <div className="text-xs text-slate-500 mb-0.5 uppercase tracking-wide">{label}</div>
                        <div className={`text-sm font-bold tabular-nums ${color}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Reward chart - only shown while training is active */}
                {isTrainingActive && (
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs uppercase tracking-widest text-teal-400">Reward</div>
                    <div className="text-xs text-slate-500">last 60 ep</div>
                  </div>
                  <RewardChart data={trainingMetrics} />
                </div>
                )}

                {/* Training config */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2.5">
                  <div className="text-xs uppercase tracking-widest text-amber-400">Config</div>

                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Algorithm</label>
                    <select
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5
                                 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
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
                        className="text-xs px-2 py-0.5 rounded bg-teal-500/10 border border-teal-500/30 text-teal-400 hover:bg-teal-500/20 transition-colors"
                      >
                        Templates
                      </button>
                    </div>
                    <select
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5
                                 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
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
                    <label className="block text-xs text-slate-400 mb-1.5">Memory mode</label>
                    <select
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5
                                 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
                      value={memoryMode}
                      onChange={(e) => setTrainingConfig({ ...trainingConfig, memoryMode: e.target.value as "standard" | "visited_grid" })}
                    >
                      <option value="visited_grid">Intelligent (Visited Grid) - recommended</option>
                      <option value="standard">Standard (No memory)</option>
                    </select>
                  </div>

                  {envHasGoal && (
                    <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                      <div>
                        <div className="text-xs text-slate-300 font-semibold">Randomize goal each episode</div>
                        <div className="text-[11px] text-slate-500">Improves generalization for unseen goal placements.</div>
                      </div>
                      <button
                        onClick={() => setTrainingConfig({ ...trainingConfig, goalRandomize: !goalRandomize })}
                        className={`relative w-11 h-6 rounded-full border transition-all
                          ${goalRandomize ? "bg-emerald-600 border-emerald-500" : "bg-slate-900 border-slate-800"}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all
                          ${goalRandomize ? "left-5" : "left-0.5"}`} />
                      </button>
                    </div>
                  )}

                  <div>
                    <label className="flex justify-between text-xs text-slate-400 mb-1.5">
                      Model size
                      {trainingConfig.modelProfile !== suggestedModelKey && (
                        <button
                          onClick={() => setTrainingConfig({ ...trainingConfig, modelProfile: suggestedModelKey })}
                          className="text-teal-400 hover:text-teal-300 transition-colors"
                        >
                          ? Use suggested: {suggestedModelKey}
                        </button>
                      )}
                    </label>
                    <select
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5
                                 text-sm text-slate-200 focus:border-teal-500 focus:outline-none"
                      value={trainingConfig.modelProfile}
                      onChange={(e) => setTrainingConfig({ ...trainingConfig, modelProfile: e.target.value })}
                    >
                      {modelProfiles.map((m) => (
                        <option key={m.key} value={m.key}>
                          {m.label}{m.key === suggestedModelKey ? " ? Suggested" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex justify-between text-xs text-slate-400 mb-1.5">
                      Steps
                      <span className="text-teal-300 font-mono">{trainingConfig.steps.toLocaleString()}</span>
                    </label>
                    <input
                      type="range" min={1000} max={200000} step={1000}
                      value={trainingConfig.steps}
                      onChange={(e) => setTrainingConfig({ ...trainingConfig, steps: Number(e.target.value) })}
                      className="w-full accent-teal-500"
                    />
                    <div className="flex justify-between text-xs text-slate-600 mt-0.5">
                      <span>1K</span><span>100K</span><span>200K</span>
                    </div>
                  </div>
                </div>

                {/* Start / stop - removed from scroll, handled by sticky zone below */}
                {trainingError && (
                  <div className="rounded-xl border border-red-500/40 bg-red-900/20 p-3 text-xs text-red-300">
                    Error: {trainingError}
                  </div>
                )}
              </>
            )}

            {activeTab === "sensors" && (
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between mb-3">
                  <div className="text-xs uppercase tracking-widest text-teal-300">Sensor Rays</div>
                  <div className="text-xs text-slate-500">{sensors.length} rays</div>
                </div>
                {sensors.length === 0 ? (
                  <div className="rounded-lg border border-slate-800 px-3 py-8 text-center
                                  text-xs text-slate-500 italic">
                    Start simulation to see sensor data
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {sensors.map((s) => {
                      const pct = 1 - s.distance;
                      return (
                        <div key={s.index}
                          className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                            <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-500">Ray {s.index + 1}</span>
                            <span className={`font-bold font-mono ${pct > 0.7 ? "text-red-400" : pct > 0.4 ? "text-amber-300" : "text-emerald-300"}`}>
                              {s.distance.toFixed(2)}
                            </span>
                          </div>
                          <div className="h-1 rounded-full bg-slate-900">
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
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                  <div className="text-xs uppercase tracking-widest text-slate-400 mb-2">Custom Environment JSON</div>
                  <textarea
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs
                               font-mono text-slate-300 focus:border-teal-500 focus:outline-none resize-none"
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

          {/* Sticky action buttons, always visible at bottom */}
          <div className="flex-shrink-0 p-3 pt-0 space-y-2 border-t border-slate-800 bg-slate-950/90">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[11px] uppercase tracking-widest text-slate-500">
                  Select Training Run
                </label>
                {backendIsRunning && (
                  <span className="text-[10px] text-emerald-300">backend: running</span>
                )}
              </div>
              <select
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2
                           text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
                value={selectedRunId ?? ""}
                onChange={(e) => setSelectedRunId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">
                  {activeRuns.length > 0 ? "Choose active run…" : "No active runs detected"}
                </option>
                {activeRuns.map((run) => {
                  const env = run.environment.includes(":") ? run.environment.split(":")[1] : run.environment;
                  const label = env ? env.replaceAll("_", " ") : "unknown";
                  return (
                    <option key={run.id} value={run.id}>
                      Run {run.id} · {label}
                    </option>
                  );
                })}
              </select>
              {activeRuns.length === 0 && (
                <div className="mt-1 text-[11px] text-slate-500">
                  Start a run, or wait a few seconds for detection after reload.
                </div>
              )}
            </div>
            {trainingComplete ? (
              <>
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-900/20 p-2.5 text-center">
                  <div className="text-emerald-300 font-semibold text-sm">Training Complete!</div>
                  <div className="text-xs text-slate-400 mt-0.5">Your model is ready to test.</div>
                </div>
                <button
                  onClick={() => setShowQuickTest(true)}
                  className="w-full py-3 rounded-xl text-sm font-bold bg-gradient-to-r from-teal-500 to-amber-500 hover:from-teal-400 hover:to-amber-400 text-white shadow-lg shadow-black/30 transition-all active:scale-95"
                >
                  Test Model
                </button>
                <div className="flex gap-2">
                  <button
                    onClick={handleTrainAgain}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold border border-slate-800 bg-slate-900 text-slate-300 hover:border-teal-700/50 hover:text-teal-300 transition-colors"
                  >
                    Train Again
                  </button>
                  {status.deploymentReady && status.runId && (
                    <a
                      href={`${apiBase}/download-model?format=bundle&run_id=${status.runId}`}
                      target="_blank" rel="noreferrer"
                      className="flex-1 flex items-center justify-center rounded-xl py-2 border border-teal-700/40 bg-teal-900/10 text-teal-300 text-xs font-semibold hover:bg-teal-900/20 transition-colors"
                    >
                      Download
                    </a>
                  )}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={handleStartTraining}
                  disabled={isStarting || isStopping || isTrainingActive || backendIsRunning}
                  className={`w-full rounded-xl py-3 text-sm font-bold transition-all active:scale-95
                             ${
                               isStarting || isStopping || isTrainingActive || backendIsRunning
                                 ? "bg-gradient-to-r from-emerald-700 to-teal-700 opacity-60 cursor-not-allowed"
                                 : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-lg shadow-emerald-900/30"
                             } text-white`}
                >
                  {isStarting
                    ? "Starting..."
                    : isStopping
                      ? "Stopping..."
                      : (isTrainingActive || backendIsRunning)
                        ? "Training in Progress..."
                        : "Start Training"}
                </button>

                <div className="flex gap-2">
                  <button
                    onClick={handleCancelTraining}
                    disabled={!isTrainingActive && !backendIsRunning}
                    className="flex-1 rounded-xl py-2 text-xs font-semibold transition-all
                               border border-slate-800 bg-slate-900 text-slate-400
                               hover:border-red-700/50 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Stop
                  </button>
                  {status.deploymentReady && status.runId ? (
                    <a
                      href={`${apiBase}/download-model?format=bundle&run_id=${status.runId}`}
                      target="_blank" rel="noreferrer"
                      className="flex-1 flex items-center justify-center gap-1 rounded-xl py-2
                                 border border-teal-700/40 bg-teal-900/10 text-teal-300 text-xs font-semibold
                                 hover:bg-teal-900/20 transition-colors"
                    >
                      Download
                    </a>
                  ) : (
                    <div className="flex-1 flex items-center justify-center rounded-xl py-2
                                    border border-slate-800 text-slate-600 text-xs">
                      {status.deploymentReady ? "Ready" : "Not trained"}
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
          <div className="w-[96vw] max-w-6xl h-[82vh] bg-[#0b1120] border border-slate-800/70 rounded-3xl shadow-2xl overflow-hidden rm-fade-up flex flex-col">
            <div className="px-6 py-4 border-b border-slate-800/70 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-100">Test Lab</div>
                <div className="text-xs text-slate-400">Full-screen rollout playback</div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setTestPlayback((p) => p ? { ...p, index: 0, playing: true } : p)}
                  className="px-3 py-1.5 rounded-lg bg-teal-600/20 border border-teal-500/50 text-teal-200 text-xs font-semibold"
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
            <div className="flex-1 p-5 overflow-hidden">
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

