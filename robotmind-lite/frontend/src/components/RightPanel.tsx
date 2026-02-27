import type {
  ProfileOption,
  Project,
  ScenarioBuilderConfig,
  SensorValue,
  TrainingConfig,
  TrainingMetric,
  TrainingStatus,
  TrainingTemplate,
} from "../types";
import { useState } from "react";
import { RewardChart } from "./RewardChart";
import { RobotPreviewSVG } from "./RobotDesigner";

type RightPanelProps = {
  apiBase: string;
  metrics: TrainingMetric[];
  status: TrainingStatus;
  sensors: SensorValue[];
  config: TrainingConfig;
  algorithms: ProfileOption[];
  environmentProfiles: ProfileOption[];
  modelProfiles: ProfileOption[];
  templates: TrainingTemplate[];
  scenarioBuilder: ScenarioBuilderConfig;
  scenarioMapEnabled: boolean;
  onScenarioBuilderChange: (next: ScenarioBuilderConfig) => void;
  customEnvironmentJson: string;
  customModelJson: string;
  algorithmParamsJson: string;
  onCustomEnvironmentJsonChange: (value: string) => void;
  onCustomModelJsonChange: (value: string) => void;
  onAlgorithmParamsJsonChange: (value: string) => void;
  onConfigChange: (next: TrainingConfig) => void;
  onStartTraining: () => void;
  onCancelTraining: () => void;
  trainingError: string | null;
  /** When supplied, replaces the generic preset chooser with project-specific info */
  project?: Project;
};

export const RightPanel = ({
  apiBase,
  metrics,
  status,
  sensors,
  config,
  algorithms,
  environmentProfiles,
  modelProfiles,
  templates,
  scenarioBuilder,
  scenarioMapEnabled,
  onScenarioBuilderChange,
  customEnvironmentJson,
  customModelJson,
  algorithmParamsJson,
  onCustomEnvironmentJsonChange,
  onCustomModelJsonChange,
  onAlgorithmParamsJsonChange,
  onConfigChange,
  onStartTraining,
  onCancelTraining,
  trainingError,
  project,
}: RightPanelProps) => {
  const [isTrainingStarting, setIsTrainingStarting] = useState(false);

  // Derive selectedPreset from config so it always matches the actual settings
  const selectedPreset =
    config.environmentProfile === "flat_ground_ackermann_v1"
      ? "flat_ackermann_v1"
      : config.environmentProfile === "flat_ground_rover_v1"
      ? "flat_rover_v1"
      : "flat_diff_v1";

  const quickPresets = [
    {
      key: "smart_nav_v1",
      title: "🧠 Smart Navigator",
      subtitle: "LSTM Memory + 8 Arenas",
      description:
        "Maximum intelligence: LSTM memory, 24 sensors, 300° FOV, 8 diverse arenas. Recommended 300k+ steps.",
      icon: "🧠",
      config: {
        environmentProfile: "smart_nav_v1",
        algorithm: "PPO_LSTM",
        modelProfile: "navigator",
        steps: 300000,
      },
    },
    {
      key: "flat_diff_v1",
      title: "🟢 Differential Drive",
      subtitle: "V1 Flat-Ground",
      description: "Two-wheel differential steering. Best for simple navigation.",
      icon: "🚗",
      config: {
        environmentProfile: "flat_ground_differential_v1",
        algorithm: "PPO",
        modelProfile: "balanced",
        steps: 100000,
      },
    },
    {
      key: "flat_ackermann_v1",
      title: "🔵 Ackermann Steering",
      subtitle: "V1 Flat-Ground",
      description: "Car-like steering. Realistic vehicle dynamics.",
      icon: "🏎️",
      config: {
        environmentProfile: "flat_ground_ackermann_v1",
        algorithm: "PPO",
        modelProfile: "balanced",
        steps: 150000,
      },
    },
    {
      key: "flat_rover_v1",
      title: "🟠 Rover/Skid-Steer",
      subtitle: "V1 Flat-Ground",
      description: "Four-wheel skid steering. High maneuverability.",
      icon: "🚙",
      config: {
        environmentProfile: "flat_ground_rover_v1",
        algorithm: "PPO",
        modelProfile: "balanced",
        steps: 150000,
      },
    },
  ];

  const applyPreset = (presetKey: string) => {
    const preset = quickPresets.find((item) => item.key === presetKey);
    if (!preset) return;
    onConfigChange({
      ...config,
      algorithm: preset.config.algorithm,
      environmentProfile: preset.config.environmentProfile,
      modelProfile: preset.config.modelProfile,
      steps: preset.config.steps,
    });
    onCustomEnvironmentJsonChange("");
    onCustomModelJsonChange("");
    onAlgorithmParamsJsonChange("");
    onScenarioBuilderChange({ ...scenarioBuilder, enabled: false });
  };

  const handleStartTraining = async () => {
    setIsTrainingStarting(true);
    try {
      onStartTraining();
    } finally {
      setTimeout(() => setIsTrainingStarting(false), 2000);
    }
  };

  return (
    <aside className="flex h-full flex-col gap-6 border-l border-slate-800 bg-gradient-to-b from-slate-950 to-slate-900 p-6 overflow-y-auto">

      {/* ── Project context card (wizard flow) OR preset chooser (generic flow) ─ */}
      {project ? (
        /* Project-aware header */
        <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-500/5 to-amber-500/5 p-5 shadow-xl">
          <div className="flex items-start gap-4">
            <RobotPreviewSVG design={project.robot} size={80} />
            <div className="flex-1 overflow-hidden">
              <div className="text-xs uppercase tracking-[0.3em] text-teal-400 mb-0.5">Active Project</div>
              <div className="text-base font-bold text-slate-100 truncate">{project.name}</div>
              <div className="mt-2 space-y-1">
                {[
                  ["Shape",    project.robot.shape],
                  ["Movement", project.robot.movementType],
                  ["Sensors",  `${project.robot.sensors.count} rays • ${project.robot.sensors.fov}°`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between text-[11px]">
                    <span className="text-slate-500">{k}</span>
                    <span className="text-slate-300 font-mono capitalize">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Generic preset chooser (shown when no project) */
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.3em] text-emerald-400">Version 1</div>
              <div className="text-lg font-bold text-slate-100">Choose Your Model</div>
            </div>
            <div className="rounded-full border border-emerald-500/40 bg-emerald-500/20 px-3 py-1.5 text-xs text-emerald-200">
              ✓ Production Ready
            </div>
          </div>
          <div className="grid gap-3">
            {quickPresets.map((preset) => (
              <button
                key={preset.key}
                className={`group rounded-xl border px-4 py-3.5 text-left transition-all ${
                  selectedPreset === preset.key
                    ? "border-emerald-400/60 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 shadow-lg scale-105"
                    : "border-slate-700 bg-slate-900/60 hover:border-emerald-500/30 hover:bg-slate-800/80"
                }`}
                onClick={() => applyPreset(preset.key)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{preset.icon}</span>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-slate-100">{preset.title}</div>
                    <div className="text-[10px] font-medium text-emerald-400">{preset.subtitle}</div>
                    <div className="mt-1.5 text-xs text-slate-400">{preset.description}</div>
                  </div>
                  {selectedPreset === preset.key && <span className="text-xl text-emerald-400">✓</span>}
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/60 p-3">
            <div className="text-xs font-medium text-slate-300 mb-1.5">Training Steps</div>
            <div className="text-[10px] text-slate-500 mb-2">
              More steps = smarter model. &lt;50k steps often produces poor results.
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                { v: 50000,  label: "50k",  tip: "Minimum useful" },
                { v: 100000, label: "100k", tip: "Recommended" },
                { v: 200000, label: "200k", tip: "Strong" },
                { v: 500000, label: "500k", tip: "Best quality" },
              ].map(({ v, label, tip }) => (
                <button
                  key={v}
                  title={tip}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    config.steps === v
                      ? "bg-teal-500/30 border border-teal-500/50 text-teal-200"
                      : "border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                  }`}
                  onClick={() => onConfigChange({ ...config, steps: v })}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-[0.3em] text-teal-400">Live Metrics</div>
          <div className="text-xs text-slate-400">Real-time</div>
        </div>
        <RewardChart data={metrics} />
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
        <div className="text-xs uppercase tracking-[0.3em] text-amber-400 mb-4">Training Control</div>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">Algorithm</label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              value={config.algorithm}
              onChange={(event) => onConfigChange({ ...config, algorithm: event.target.value as TrainingConfig["algorithm"] })}
            >
              {algorithms.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">Environment</label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              value={config.environmentProfile}
              onChange={(event) => onConfigChange({ ...config, environmentProfile: event.target.value })}
            >
              {environmentProfiles.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">Model Profile</label>
            <select
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-200 focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
              value={config.modelProfile}
              onChange={(event) => onConfigChange({ ...config, modelProfile: event.target.value })}
            >
              {modelProfiles.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="text-xs font-semibold text-emerald-300">Training Status</div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-slate-950/60 px-3 py-2">
              <div className="text-slate-400">Episode</div>
              <div className="mt-1 text-lg font-bold text-emerald-300">{status.episode}</div>
            </div>
            <div className="rounded-lg bg-slate-950/60 px-3 py-2">
              <div className="text-slate-400">Reward</div>
              <div className="mt-1 text-lg font-bold text-teal-300">{status.reward.toFixed(2)}</div>
            </div>
            <div className="rounded-lg bg-slate-950/60 px-3 py-2">
              <div className="text-slate-400">Loss</div>
              <div className="mt-1 text-lg font-bold text-amber-300">{status.loss.toFixed(4)}</div>
            </div>
            <div className="rounded-lg bg-slate-950/60 px-3 py-2">
              <div className="text-slate-400">Status</div>
              <div className={`mt-1 text-sm font-bold ${status.deploymentReady ? "text-emerald-300" : "text-slate-400"}`}>
                {status.deploymentReady ? "✓ Ready" : "Training..."}
              </div>
            </div>
          </div>
          {/* Step progress bar */}
          {status.totalSteps != null && status.totalSteps > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>Steps</span>
                <span className="tabular-nums">
                  {(status.completedSteps ?? 0).toLocaleString()} / {status.totalSteps.toLocaleString()}
                </span>
              </div>
              <div className="relative h-1.5 w-full rounded-full bg-slate-950/80 overflow-hidden border border-slate-700">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                  style={{ width: `${((status.completedSteps ?? 0) / status.totalSteps) * 100}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 text-right">
                {(((status.completedSteps ?? 0) / status.totalSteps) * 100).toFixed(1)}% complete
              </div>
            </div>
          )}
        </div>

        {status.deploymentReady && status.runId ? (
          <a
            className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-teal-500/40 bg-gradient-to-r from-teal-500/20 to-blue-500/20 px-4 py-3 text-sm font-semibold text-teal-100 transition hover:from-teal-500/30 hover:to-blue-500/30 shadow-lg"
            href={`${apiBase}/download-model?format=bundle&run_id=${status.runId}`}
            target="_blank"
            rel="noreferrer"
          >
            <span>📦</span>
            Download Deployment Bundle
          </a>
        ) : null}

        <button
          className="group mt-4 w-full rounded-xl border-2 border-emerald-500/50 bg-gradient-to-r from-emerald-500/20 to-green-500/20 px-4 py-3.5 text-base font-bold text-emerald-100 transition-all duration-300 hover:from-emerald-500/40 hover:to-green-500/40 hover:border-emerald-400 hover:shadow-[0_0_20px_rgba(34,197,94,0.3)] active:scale-95 disabled:opacity-50 disabled:hover:shadow-none disabled:active:scale-100 flex items-center justify-center gap-2 shadow-lg relative overflow-hidden"
          onClick={handleStartTraining}
          disabled={isTrainingStarting || status.trainingState === 'running'}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-400/0 via-emerald-400/20 to-emerald-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
          {isTrainingStarting ? (
            <>
              <span className="animate-spin text-xl">⏳</span>
              <span className="animate-pulse">Starting Training...</span>
            </>
          ) : status.trainingState === 'running' ? (
            <>
              <span className="animate-pulse text-xl">🎯</span>
              <span>Training in Progress...</span>
            </>
          ) : (
            <>
              <span className="text-xl group-hover:scale-110 transition-transform duration-300">🚀</span>
              <span className="relative z-10">Start Training</span>
            </>
          )}
        </button>

        {trainingError && (
          <div className="mt-3 rounded-xl border border-red-500/50 bg-gradient-to-r from-red-500/20 to-amber-500/20 p-4 shadow-lg">
            <div className="text-xs font-semibold text-red-300 flex items-center gap-2">
              <span className="text-lg">⚠️</span>
              Training Error
            </div>
            <div className="mt-2 text-sm text-red-200">{trainingError}</div>
          </div>
        )}

        <button
          className="group mt-3 w-full rounded-xl border-2 border-amber-500/50 bg-gradient-to-r from-amber-500/20 to-orange-500/20 px-4 py-3 text-sm font-semibold text-amber-200 transition-all duration-300 hover:from-amber-500/40 hover:to-orange-500/40 hover:border-amber-400 hover:shadow-[0_0_15px_rgba(245,158,11,0.3)] active:scale-95 disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg relative overflow-hidden"
          onClick={onCancelTraining}
          disabled={status.trainingState !== 'running'}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-amber-400/0 via-amber-400/20 to-amber-400/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
          <span className="text-lg group-hover:scale-110 transition-transform duration-300">⏹️</span>
          <span className="relative z-10">Stop Training</span>
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-[0.3em] text-amber-400">Sensor Data</div>
          <div className="text-xs text-slate-400">{sensors.length} sensor{sensors.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="space-y-2 max-h-72 overflow-y-auto text-xs">
          {sensors.length === 0 ? (
            <div className="rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-6 text-center text-slate-500 italic">
              No sensor data — start simulation
            </div>
          ) : (
            <div className="space-y-1.5">
              {sensors.map((sensor) => {
                const d = sensor.distance;
                // Urgency levels based on normalized distance
                const isSafe   = d > 0.55;
                const isWarn   = d > 0.30 && d <= 0.55;
                const isDanger = d <= 0.30;
                const barColor  = isSafe   ? "bg-emerald-500"
                                : isWarn   ? "bg-amber-400"
                                :            "bg-red-500";
                const textColor = isSafe   ? "text-emerald-300"
                                : isWarn   ? "text-amber-300"
                                :            "text-red-400";
                const badge     = isSafe   ? { text: "SAFE",   cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" }
                                : isWarn   ? { text: "WARN",   cls: "bg-amber-400/20  text-amber-300  border-amber-400/30"  }
                                :            { text: "DANGER", cls: "bg-red-500/20    text-red-400    border-red-500/30"    };
                const name = sensor.label ?? `Sensor ${sensor.index + 1}`;
                return (
                  <div
                    key={sensor.index}
                    className={`rounded-lg border bg-slate-950/60 px-3 py-2 transition-colors ${
                      isDanger ? "border-red-500/40" : isWarn ? "border-amber-400/30" : "border-slate-700"
                    }`}
                  >
                    {/* Row 1: name + badge + value */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-slate-200">{name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badge.cls}`}>
                          {badge.text}
                        </span>
                        <span className={`font-mono font-bold tabular-nums ${textColor}`}>
                          {(d * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    {/* Row 2: distance bar */}
                    <div className="relative h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`absolute inset-y-0 left-0 rounded-full transition-all duration-150 ${barColor}`}
                        style={{ width: `${Math.max(2, d * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {/* Summary footer when there are sensors */}
        {sensors.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-800 grid grid-cols-3 gap-2 text-[10px]">
            {(["SAFE", "WARN", "DANGER"] as const).map((level) => {
              const count = sensors.filter(s =>
                level === "SAFE"   ? s.distance > 0.55 :
                level === "WARN"   ? s.distance > 0.30 && s.distance <= 0.55 :
                                     s.distance <= 0.30
              ).length;
              const cls = level === "SAFE"   ? "text-emerald-400"
                        : level === "WARN"   ? "text-amber-400"
                        :                     "text-red-400";
              return (
                <div key={level} className="rounded-lg bg-slate-950/60 px-2 py-1.5 text-center">
                  <div className={`font-bold text-sm ${cls}`}>{count}</div>
                  <div className="text-slate-500">{level}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
};
