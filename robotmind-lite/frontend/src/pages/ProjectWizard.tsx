/**
 * ProjectWizard – 5-step flow for creating a new robot project.
 *   1. Robot Design   (shape, movement, physics)
 *   2. Environment    (preset arena or custom map)
 *   3. Algorithm      (PPO / DQN / SAC …)
 *   4. Training Setup (steps, model profile, noise)
 *   5. Review & Launch
 */
import { useState } from "react";
import type { Project, RobotDesign, ProfileOption, AppPage } from "../types";
import { RobotDesigner, robotDesignToEnvConfig, RobotPreviewSVG } from "../components/RobotDesigner";

// ── defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_ROBOT: RobotDesign = {
  name:         "My Robot",
  shape:        "circle",
  movementType: "differential",
  size:         15,
  speed:        130,
  turnRate:     12,
  color:        "#22c55e",
  sensors: {
    count:     8,
    range:     140,
    fov:       120,
    placement: "front_sides",
  },
};

const STEP_LABELS = [
  "Robot Design",
  "Environment",
  "Algorithm",
  "Training Setup",
  "Review",
];

// ── environment presets ───────────────────────────────────────────────────────

const ENV_PRESETS = [
  {
    key: "flat_ground_differential_v1",
    label: "Office / Warehouse",
    icon: "🏭",
    desc: "Corridors, doorways, clutter. Indoor navigation.",
    tags: ["flat", "corridors", "differential"],
  },
  {
    key: "flat_ground_ackermann_v1",
    label: "Parking / Road",
    icon: "🚘",
    desc: "Parking lots, roads, lane-keeping, intersections.",
    tags: ["flat", "roads", "ackermann"],
  },
  {
    key: "flat_ground_rover_v1",
    label: "Warehouse Racks",
    icon: "📦",
    desc: "Loading docks, tight aisles, pallet navigation.",
    tags: ["flat", "racks", "rover"],
  },
  {
    key: "arena_basic",
    label: "Training Arena",
    icon: "🏟️",
    desc: "Open arena with obstacles. Baseline RL experiments.",
    tags: ["arena", "obstacles"],
  },
  {
    key: "warehouse_dense",
    label: "Dense Warehouse",
    icon: "🏗️",
    desc: "High-obstacle layout. Difficult navigation challenge.",
    tags: ["dense", "obstacles"],
  },
  {
    key: "corridor_sprint",
    label: "Narrow Corridors",
    icon: "🚪",
    desc: "Tight passages with long sensor range needed. High-speed navigation through vertical wall channels.",
    tags: ["corridors", "tight", "fast"],
  },
  {
    key: "goal_chase",
    label: "Goal Chase",
    icon: "🎯",
    desc: "Navigate to the glowing goal target. +100 reward on reach. Ideal for goal-seeking behaviour.",
    tags: ["goal", "navigation"],
  },
  {
    key: "apple_field",
    label: "Apple Field",
    icon: "🍏",
    desc: "Open field — reach the goal target quickly with few obstacles. Good for continuous control.",
    tags: ["goal", "open", "flat-ground"],
  },
  {
    key: "flat_ground_cluttered_v2",
    label: "Cluttered Room",
    icon: "🗂️",
    desc: "Dense scatter of small objects — chairs, boxes, pillars. Trains collision avoidance in real-world cluttered spaces.",
    tags: ["cluttered", "indoor", "flat-ground"],
  },
  {
    key: "flat_ground_multi_room",
    label: "Multi-Room",
    icon: "🏠",
    desc: "Three connected rooms with narrow doorways. Trains hallway traversal and room-to-room goal-seeking.",
    tags: ["multi-room", "doorways", "flat-ground"],
  },
  {
    key: "flat_ground_stress_test",
    label: "Stress Test",
    icon: "💪",
    desc: "Maximum sensor noise and heading drift. Forces the model to generalise. Use as final robustness check before deployment.",
    tags: ["noise", "robustness", "advanced"],
  },
  {
    key: "flat_ground_dead_end_recovery",
    label: "Dead-End Recovery",
    icon: "↩️",
    desc: "U-shaped dead ends and blind channels force the robot to reverse and re-plan. Enables backward action.",
    tags: ["dead-end", "recovery", "advanced"],
  },
  {
    key: "humanoid_balance_lab",
    label: "Humanoid Balance Lab",
    icon: "🧍",
    desc: "Complex central structures and narrow gaps for humanoid-style navigation challenges. Continuous-only.",
    tags: ["humanoid", "continuous", "advanced"],
  },
  {
    key: "software_anomaly_graph",
    label: "Anomaly Graph",
    icon: "🕸️",
    desc: "Abstract graph-like obstacle topology for software/system navigation tasks.",
    tags: ["graph", "abstract"],
  },
  {
    key: "autonomous_driving_city",
    label: "City Streets",
    icon: "🌆",
    desc: "Street-like layout with poles, crossings, traffic.",
    tags: ["city", "driving"],
  },
  {
    key: "legged_robot_terrain",
    label: "Rough Terrain",
    icon: "⛰️",
    desc: "Rocky terrain for legged/rover locomotion.",
    tags: ["terrain", "legged"],
  },
  {
    key: "drone_flight_indoor",
    label: "Indoor Drone",
    icon: "🚁",
    desc: "Tight indoor obstacle field for aerial navigation.",
    tags: ["drone", "indoor"],
  },
];

// ── algorithm cards ───────────────────────────────────────────────────────────

const ALGO_CARDS = [
  {
    key: "PPO",
    label: "PPO",
    fullName: "Proximal Policy Optimization",
    icon: "🟢",
    tag: "Recommended",
    tagColor: "text-emerald-300 bg-emerald-900/30 border-emerald-700",
    desc: "Best for beginners. Stable, reliable, works well for most navigation tasks.",
    best: ["Obstacle avoidance", "Path navigation", "General purpose"],
    mode: "discrete",
  },
  {
    key: "A2C",
    label: "A2C",
    fullName: "Advantage Actor-Critic",
    icon: "🔵",
    tag: "Fast",
    tagColor: "text-blue-300 bg-blue-900/30 border-blue-700",
    desc: "Trains quickly. Good for rapid iteration and simple environments.",
    best: ["Quick prototyping", "Low compute", "Simple navigation"],
    mode: "discrete",
  },
  {
    key: "DQN",
    label: "DQN",
    fullName: "Deep Q-Network",
    icon: "🟣",
    tag: "Proven",
    tagColor: "text-teal-200 bg-teal-900/30 border-teal-700",
    desc: "Value-based learning. Proven effective for discrete navigation tasks.",
    best: ["Discrete actions", "Navigation", "Collision avoidance"],
    mode: "discrete",
  },
  {
    key: "SAC",
    label: "SAC",
    fullName: "Soft Actor-Critic",
    icon: "🟡",
    tag: "Advanced",
    tagColor: "text-amber-300 bg-amber-900/30 border-amber-700",
    desc: "Maximum entropy RL. Great for continuous control and smooth motion.",
    best: ["Smooth control", "Ackermann", "City driving"],
    mode: "continuous",
  },
  {
    key: "TD3",
    label: "TD3",
    fullName: "Twin Delayed DDPG",
    icon: "🔴",
    tag: "Precision",
    tagColor: "text-red-300 bg-red-900/30 border-red-700",
    desc: "Stable continuous control. Reduced overestimation bias.",
    best: ["Precise control", "Drone flight", "High accuracy"],
    mode: "continuous",
  },
  {
    key: "DDPG",
    label: "DDPG",
    fullName: "Deep Deterministic Policy Gradient",
    icon: "🟤",
    tag: "Foundation",
    tagColor: "text-amber-700 bg-amber-900/20 border-amber-800",
    desc: "Smooth deterministic actions. Foundation for TD3/SAC.",
    best: ["Continuous motion", "Smooth paths"],
    mode: "continuous",
  },
];

const MODEL_PROFILES = [
  {
    key: "fast",
    label: "Fast",
    icon: "⚡",
    desc: "Small network (64×64). Quick training, lower memory. Good for prototyping.",
    steps_hint: "5K–20K steps",
  },
  {
    key: "balanced",
    label: "Balanced",
    icon: "⚖️",
    desc: "Medium network (128×128). Best balance of accuracy and training time.",
    steps_hint: "15K–50K steps",
  },
  {
    key: "deep",
    label: "Deep",
    icon: "🧠",
    desc: "Large network (256×256). Maximum accuracy. Needs more training time.",
    steps_hint: "50K–200K steps",
  },
];

// ── wizard component ──────────────────────────────────────────────────────────

interface ProjectWizardProps {
  onNavigate: (page: AppPage, projectId?: string) => void;
  onCreateProject: (project: Project) => void;
  environmentProfiles: ProfileOption[];
}

export const ProjectWizard = ({
  onNavigate,
  onCreateProject,
  environmentProfiles,
}: ProjectWizardProps) => {
  const [step, setStep] = useState(1);
  const totalSteps = 5;

  // Wizard state
  const [robot, setRobot] = useState<RobotDesign>(DEFAULT_ROBOT);
  const [envProfile, setEnvProfile] = useState("flat_ground_differential_v1");
  const [algorithm, setAlgorithm] = useState("PPO");
  const [modelProfile, setModelProfile] = useState("balanced");
  const [memoryMode, setMemoryMode] = useState<"standard" | "visited_grid">("visited_grid");
  const [goalRandomize, setGoalRandomize] = useState(true);
  const memoryLabel = memoryMode === "visited_grid"
    ? "Intelligent (Visited Grid)"
    : "Standard (No memory)";

  // ── Smart model suggestion ─────────────────────────────────────────────────
  const envHasGoal = envProfile.toLowerCase().includes("goal") ||
    (environmentProfiles.find(e => e.key === envProfile)?.world_summary?.has_goal ?? false);
  const wizardContinuousAlgo = ["SAC", "TD3", "DDPG"].includes(algorithm);
  const wizardComplexEnv = ["warehouse_dense", "narrow_corridor", "maze", "city", "drone", "legged", "apple_field"]
    .some(k => envProfile.toLowerCase().includes(k));
  const wizardSuggestedModel = (envHasGoal || wizardComplexEnv) ? "deep" : wizardContinuousAlgo ? "balanced" : "balanced";
  const wizardEnvObjective = envHasGoal
    ? { label: "🎯 Goal-seeking", hint: "Reach the target · avoid obstacles · +100 reward on reach" }
    : wizardComplexEnv
    ? { label: "🏗️ Complex nav", hint: "Dense/complex layout · maximise safe distance" }
    : { label: "🧭 Free navigation", hint: "Explore freely · avoid obstacles · displacement reward" };
  const [steps, setSteps] = useState(20000);
  const [noiseEnabled, setNoiseEnabled] = useState(false);
  const [randomSpawn, setRandomSpawn] = useState(true);

  // Merge dynamic env profiles from backend with built-ins
  const allEnvs = (() => {
    const keys = new Set(ENV_PRESETS.map((e) => e.key));
    const extras = (environmentProfiles || [])
      .filter((p) => !keys.has(p.key))
      .map((p) => ({
        key: p.key,
        label: p.label,
        icon: "🌐",
        desc: p.description,
        tags: [],
      }));
    return [...ENV_PRESETS, ...extras];
  })();

  const canProceed = () => {
    if (step === 1) return robot.name.trim().length > 0;
    return true;
  };

  const handleLaunch = () => {
    const customEnv = robotDesignToEnvConfig(robot);
    if (noiseEnabled) {
      (customEnv as Record<string, unknown>).dynamics = {
        sensor_noise_std:  0.02,
        heading_drift_std: 0.8,
        speed_noise_std:   0.05,
        turn_noise_std:    0.8,
        randomize_spawn:   randomSpawn,
      };
    }

    const project: Project = {
      id:          Date.now().toString(),
      name:        robot.name,
      description: `${robot.movementType} • ${envProfile} • ${algorithm}`,
      createdAt:   new Date().toISOString(),
      status:      "draft",
      robot,
      environmentProfile: envProfile,
      algorithm,
      modelProfile,
      steps,
      memoryMode,
      goalRandomize,
      customEnvironmentJson: JSON.stringify(customEnv, null, 2),
    };
    onCreateProject(project);
    onNavigate("training", project.id);
  };

  return (
    <div className="min-h-screen rm-grid-bg text-slate-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800/60 bg-[#0b1120]/80 backdrop-blur-md px-8 py-5
                         flex items-center justify-between sticky top-0 z-10">
        <button
          onClick={() => onNavigate("home")}
          className="flex items-center gap-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
        >
          ← Back to projects
        </button>
        <div className="text-base font-bold text-slate-200">
          Create New Project
        </div>
        <div className="text-sm text-slate-500">
          Step {step} of {totalSteps}
        </div>
      </header>

      {/* Progress */}
      <div className="bg-[#0b1120]/80 border-b border-slate-800/60 px-8 py-4">
        {/* Step indicators */}
        <div className="max-w-3xl mx-auto flex items-center gap-0">
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                      transition-all
                      ${done   ? "bg-teal-500 text-white"
                                 : active ? "bg-amber-400 text-slate-900 ring-2 ring-amber-300/30"
                                          : "bg-[#0b1120] border border-slate-800/70 text-slate-500"}`}
                  >
                    {done ? "✓" : n}
                  </div>
                  <span className={`text-xs hidden sm:block
                    ${active ? "text-amber-300" : done ? "text-teal-300" : "text-slate-600"}`}>
                    {label}
                  </span>
                </div>
                {i < STEP_LABELS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mt-[-14px] rounded
                    ${done ? "bg-teal-500" : "bg-slate-800"}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-10 rm-fade-up">
          {step === 1 && (
            <StepWrapper title="Design Your Robot"
              subtitle="Choose a body shape, movement type and physical properties.">
              <RobotDesigner design={robot} onChange={setRobot} />
            </StepWrapper>
          )}

          {step === 2 && (
            <StepWrapper title="Choose Environment"
              subtitle="Where will your robot train? Different environments test different skills.">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {allEnvs.map((env) => (
                  <button
                    key={env.key}
                    onClick={() => setEnvProfile(env.key)}
                    className={`flex gap-4 items-start p-4 rounded-2xl border text-left transition-all
                      ${envProfile === env.key
                        ? "border-teal-400/70 bg-teal-500/10"
                        : "border-slate-800/70 bg-[#0b1120]/70 hover:border-slate-600"}`}
                  >
                    <span className="text-3xl mt-0.5 flex-shrink-0">{env.icon}</span>
                    <div>
                      <div className={`text-sm font-semibold ${envProfile === env.key ? "text-teal-200" : "text-slate-200"}`}>
                        {env.label}
                      </div>
                      <div className="text-xs text-slate-400 mt-1 leading-relaxed">{env.desc}</div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(env.tags || []).map((t) => (
                          <span key={t} className="px-1.5 py-0.5 rounded bg-[#0f172a] text-xs text-slate-500 border border-slate-800/70">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    {envProfile === env.key && (
                      <span className="text-teal-300 ml-auto flex-shrink-0">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </StepWrapper>
          )}

          {step === 3 && (
            <StepWrapper title="Select Algorithm"
              subtitle="The RL algorithm that will train your robot's neural network policy.">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {ALGO_CARDS.map((algo) => (
                  <button
                    key={algo.key}
                    onClick={() => setAlgorithm(algo.key)}
                    className={`flex flex-col gap-3 p-5 rounded-2xl border text-left transition-all
                      ${algorithm === algo.key
                        ? "border-teal-500/70 bg-teal-500/10"
                        : "border-slate-800/70 bg-[#0b1120]/70 hover:border-slate-600"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{algo.icon}</span>
                        <div>
                          <div className={`font-bold text-base ${algorithm === algo.key ? "text-teal-200" : "text-slate-200"}`}>
                            {algo.label}
                          </div>
                          <div className="text-xs text-slate-500">{algo.fullName}</div>
                        </div>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full border text-xs font-semibold ${algo.tagColor}`}>
                        {algo.tag}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{algo.desc}</p>
                    <div className="flex flex-wrap gap-1">
                      {algo.best.map((b) => (
                        <span key={b} className="px-1.5 py-0.5 rounded bg-[#0f172a] border border-slate-800/70
                                                  text-xs text-slate-500">
                          {b}
                        </span>
                      ))}
                    </div>
                    <div className={`text-xs font-mono mt-auto
                      ${algo.mode === "continuous" ? "text-amber-400" : "text-blue-400"}`}>
                      {algo.mode} control
                    </div>
                  </button>
                ))}
              </div>
            </StepWrapper>
          )}

          {step === 4 && (
            <StepWrapper title="Training Setup"
              subtitle="Configure how long and how hard to train your robot.">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Model profile */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-3 uppercase tracking-wider">
                    Model size
                  </label>
                  {/* Env objective hint */}
                  <div className="mb-3 rounded-lg border border-teal-600/40 bg-teal-900/20 px-3 py-2">
                    <div className="text-xs font-semibold text-teal-200">{wizardEnvObjective.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{wizardEnvObjective.hint}</div>
                  </div>

                  <div className="space-y-3">
                    {MODEL_PROFILES.map((m) => {
                      const isSuggested = m.key === wizardSuggestedModel;
                      return (
                        <button
                          key={m.key}
                          onClick={() => setModelProfile(m.key)}
                          className={`w-full flex gap-4 items-center p-4 rounded-xl border text-left transition-all
                            ${modelProfile === m.key
                              ? "border-teal-500/70 bg-teal-500/10"
                              : isSuggested
                              ? "border-amber-500/50 bg-amber-900/10 hover:border-amber-400"
                              : "border-slate-800/70 bg-[#0b1120]/70 hover:border-slate-600"}`}
                        >
                          <span className="text-2xl">{m.icon}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-semibold text-sm ${modelProfile === m.key ? "text-teal-200" : "text-slate-200"}`}>
                                {m.label}
                              </span>
                              {isSuggested && (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-900/30 border border-amber-700/40 text-amber-300">
                                  Suggested
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">{m.desc}</div>
                            <div className="text-xs text-slate-600 mt-1 font-mono">{m.steps_hint}</div>
                          </div>
                          {modelProfile === m.key && <span className="text-teal-300">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-6">
                  {/* Training steps */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-3 uppercase tracking-wider">
                      Training steps:
                      <span className="ml-2 text-teal-300 font-mono normal-case">{steps.toLocaleString()}</span>
                    </label>
                    <input
                      type="range" min={1000} max={200000} step={1000}
                      value={steps}
                      onChange={(e) => setSteps(Number(e.target.value))}
                      className="w-full accent-teal-500"
                    />
                    <div className="flex justify-between text-xs text-slate-600 mt-1">
                      <span>1K (fast)</span>
                      <span>100K</span>
                      <span>200K (accurate)</span>
                    </div>
                    {steps >= 50000 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-400">
                        <span>✓</span> High accuracy — model will rarely hit obstacles
                      </div>
                    )}
                    {steps < 10000 && (
                      <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                        <span>⚠</span> Low steps — good for testing but accuracy will be limited
                      </div>
                    )}
                  </div>

                  {/* Noise */}
                  <div className="bg-[#0b1120]/70 border border-slate-800/70 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-300">Sensor noise & drift</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Adds random noise to sensors, speed and heading — makes the model more robust to real-world conditions.
                        </div>
                      </div>
                        <button
                          onClick={() => setNoiseEnabled(!noiseEnabled)}
                          className={`relative w-11 h-6 rounded-full border transition-all
                          ${noiseEnabled ? "bg-teal-600 border-teal-500" : "bg-[#0b1120] border-slate-800/70"}`}
                        >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all
                          ${noiseEnabled ? "left-5" : "left-0.5"}`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-300">Random spawn</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Start from random positions each episode — prevents the model from memorising a single path.
                        </div>
                      </div>
                        <button
                          onClick={() => setRandomSpawn(!randomSpawn)}
                          className={`relative w-11 h-6 rounded-full border transition-all
                          ${randomSpawn ? "bg-emerald-600 border-emerald-500" : "bg-[#0b1120] border-slate-800/70"}`}
                        >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all
                          ${randomSpawn ? "left-5" : "left-0.5"}`} />
                      </button>
                    </div>
                  </div>

                  {/* Memory mode + goal randomization */}
                  <div className="bg-[#0b1120]/70 border border-slate-800/70 rounded-xl p-4 space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-300">Memory mode</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Helps the model remember explored areas and avoid looping.
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        onClick={() => setMemoryMode("visited_grid")}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition-all
                          ${memoryMode === "visited_grid"
                            ? "border-teal-500/70 bg-teal-500/10 text-teal-200"
                            : "border-slate-800/70 bg-[#0b1120] text-slate-400 hover:border-slate-600"}`}
                      >
                        <div className="font-semibold">Intelligent</div>
                        <div className="text-[11px] text-slate-500">Visited grid memory (recommended)</div>
                      </button>
                      <button
                        onClick={() => setMemoryMode("standard")}
                        className={`rounded-lg border px-3 py-2 text-left text-xs transition-all
                          ${memoryMode === "standard"
                            ? "border-teal-500/70 bg-teal-500/10 text-teal-200"
                            : "border-slate-800/70 bg-[#0b1120] text-slate-400 hover:border-slate-600"}`}
                      >
                        <div className="font-semibold">Standard</div>
                        <div className="text-[11px] text-slate-500">No memory (faster)</div>
                      </button>
                    </div>

                    {envHasGoal && (
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-300">Randomize goal</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            Move the goal each episode to improve generalization.
                          </div>
                        </div>
                        <button
                          onClick={() => setGoalRandomize(!goalRandomize)}
                          className={`relative w-11 h-6 rounded-full border transition-all
                            ${goalRandomize ? "bg-emerald-600 border-emerald-500" : "bg-[#0b1120] border-slate-800/70"}`}
                        >
                          <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all
                            ${goalRandomize ? "left-5" : "left-0.5"}`} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </StepWrapper>
          )}

          {step === 5 && (
            <StepWrapper title="Review & Launch"
              subtitle="Everything looks good? Hit Launch Training to begin.">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Robot preview */}
                <div className="bg-[#0b1120]/70 border border-slate-800/70 rounded-2xl p-6 flex flex-col items-center gap-4">
                  <RobotPreviewSVG design={robot} size={200} />
                  <div className="text-center">
                    <div className="font-bold text-slate-100 text-lg">{robot.name}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {robot.movementType} • {robot.shape} body • {robot.sensors.count} sensors
                    </div>
                  </div>
                </div>

                {/* Summary */}
                <div className="space-y-4">
                  {[
                    { label: "Body shape",     value: robot.shape },
                    { label: "Movement type",  value: robot.movementType },
                    { label: "Speed",          value: `${robot.speed}px/s` },
                    { label: "Turn rate",      value: `${robot.turnRate}°/step` },
                    { label: "Sensor count",   value: `${robot.sensors.count} rays` },
                    { label: "Sensor range",   value: `${robot.sensors.range}px` },
                    { label: "Sensor FOV",     value: `${robot.sensors.fov}°` },
                    { label: "Sensor layout",  value: robot.sensors.placement },
                    { label: "Environment",    value: allEnvs.find((e) => e.key === envProfile)?.label || envProfile },
                    { label: "Algorithm",      value: algorithm },
                    { label: "Model size",     value: MODEL_PROFILES.find((m) => m.key === modelProfile)?.label || modelProfile },
                    { label: "Training steps", value: steps.toLocaleString() },
                    { label: "Noise / drift",  value: noiseEnabled ? "enabled" : "disabled" },
                    { label: "Random spawn",   value: randomSpawn ? "yes" : "no" },
                    { label: "Memory mode",    value: memoryLabel },
                    ...(envHasGoal ? [{ label: "Randomize goal", value: goalRandomize ? "yes" : "no" }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between
                                                 border-b border-slate-800 pb-2 last:border-0">
                      <span className="text-xs text-slate-500">{label}</span>
                      <span className="text-xs font-mono text-slate-200 capitalize">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Launch button */}
              <div className="mt-10 flex justify-center">
                <button
                  onClick={handleLaunch}
                  className="px-12 py-4 rounded-2xl bg-gradient-to-r from-teal-500 to-amber-500
                             hover:from-teal-400 hover:to-amber-400
                             text-white font-bold text-lg shadow-2xl shadow-black/40
                             transition-all hover:scale-105"
                >
                  🚀 Launch Training
                </button>
              </div>
            </StepWrapper>
          )}
        </div>
      </div>

      {/* Footer nav */}
      <div className="border-t border-slate-800/60 bg-[#0b1120]/80 backdrop-blur-md px-8 py-4
                      flex items-center justify-between sticky bottom-0">
        <button
          onClick={() => (step > 1 ? setStep(step - 1) : onNavigate("home"))}
          className="px-5 py-2.5 rounded-xl bg-[#0b1120]/80 border border-slate-800/70
                     hover:border-slate-600 text-slate-300 text-sm font-medium transition-all"
        >
          ← Back
        </button>

        {step < totalSteps && (
          <button
            disabled={!canProceed()}
            onClick={() => setStep(step + 1)}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-amber-500
                       hover:from-teal-500 hover:to-amber-400 disabled:opacity-40
                       text-white text-sm font-semibold transition-all"
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
};

// ── utility wrapper ───────────────────────────────────────────────────────────

const StepWrapper = ({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) => (
  <div>
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-slate-100">{title}</h2>
      {subtitle && <p className="text-slate-400 text-sm mt-1">{subtitle}</p>}
    </div>
    {children}
  </div>
);

