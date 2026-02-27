/**
 * HomePage – project listing & entry point.
 * Projects are persisted in localStorage.
 */
import type { Project, AppPage } from "../types";
import { RobotPreviewSVG } from "../components/RobotDesigner";

interface HomePageProps {
  projects: Project[];
  onNavigate: (page: AppPage, projectId?: string) => void;
  onDeleteProject: (id: string) => void;
}

const statusColors: Record<Project["status"], string> = {
  draft:    "text-slate-400 bg-slate-800 border-slate-700",
  training: "text-amber-300 bg-amber-900/30 border-amber-700",
  trained:  "text-emerald-300 bg-emerald-900/30 border-emerald-700",
};

const statusDots: Record<Project["status"], string> = {
  draft:    "bg-slate-500",
  training: "bg-amber-400 animate-pulse",
  trained:  "bg-emerald-400",
};

const FEATURES = [
  {
    icon: "🤖",
    title: "10 Body Shapes",
    desc: "Circle, box, triangle, capsule, T-shape, L-shape and more. Each changes physics and navigation strategy.",
    color: "from-emerald-900/40 to-emerald-800/20 border-emerald-800/50",
    accent: "text-emerald-400",
  },
  {
    icon: "🧠",
    title: "6 RL Algorithms",
    desc: "PPO, A2C, DQN, SAC, TD3, DDPG — pick what fits your robot: discrete or continuous control.",
    color: "from-teal-900/40 to-teal-800/20 border-teal-800/50",
    accent: "text-teal-400",
  },
  {
    icon: "📡",
    title: "Up to 24 Sensors",
    desc: "Configurable ray-cast sensors with custom FOV, range and placement. Front, surround or custom layout.",
    color: "from-amber-900/40 to-amber-800/20 border-amber-800/50",
    accent: "text-amber-400",
  },
  {
    icon: "🗺️",
    title: "49 Environments",
    desc: "Flat arenas, corridors, warehouses, city streets — or build your own maze with the drag-and-drop editor.",
    color: "from-amber-900/40 to-amber-800/20 border-amber-800/50",
    accent: "text-amber-400",
  },
  {
    icon: "📊",
    title: "Live Training Metrics",
    desc: "Real-time reward charts, sensor heatmaps, collision rates and episode stats — all while training runs.",
    color: "from-amber-900/40 to-amber-800/20 border-amber-800/50",
    accent: "text-amber-400",
  },
  {
    icon: "🚀",
    title: "One-click Deploy",
    desc: "Export trained models as ONNX bundles. Download and run inference anywhere with zero dependencies.",
    color: "from-amber-900/40 to-amber-800/20 border-amber-800/50",
    accent: "text-amber-400",
  },
];

const STATS = [
  { value: "6",   label: "RL Algorithms" },
  { value: "49",  label: "Environments" },
  { value: "10",  label: "Robot Shapes" },
  { value: "24",  label: "Max Sensors" },
];

export const HomePage = ({ projects, onNavigate, onDeleteProject }: HomePageProps) => {
  return (
    <div className="min-h-screen rm-grid-bg text-slate-100">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-slate-800/60 bg-[#0b1120]/85 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-500 to-amber-500
                            flex items-center justify-center text-base font-black text-white shadow-lg shadow-black/30">
              R
            </div>
            <div>
              <div className="text-base font-bold text-slate-100 leading-none tracking-tight">RobotMind</div>
              <div className="text-xs text-slate-500 uppercase tracking-widest mt-0.5">AI Robot Training Lab</div>
            </div>
          </div>

          {projects.length > 0 && (
            <button
              onClick={() => onNavigate("wizard")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                         bg-gradient-to-r from-teal-500 to-amber-500 hover:from-teal-400 hover:to-amber-400
                         text-white text-sm font-semibold shadow-lg shadow-black/30 transition-all active:scale-95"
            >
              <span className="text-base leading-none">＋</span> New Project
            </button>
          )}
        </div>
      </header>

      {/* ── Content ────────────────────────────────────────────────────── */}
      {projects.length === 0 ? (
        /* ── Empty state — full hero ───────────────────────────────────── */
        <main>
          {/* Hero section */}
          <section className="relative overflow-hidden">
            {/* Background glow blobs */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-[-120px] left-1/2 -translate-x-1/2 w-[700px] h-[700px]
                              rounded-full bg-emerald-500/5 blur-3xl" />
              <div className="absolute top-[100px] right-[-100px] w-[400px] h-[400px]
                              rounded-full bg-teal-500/5 blur-3xl" />
            </div>

            <div className="relative max-w-5xl mx-auto px-8 pt-20 pb-16 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full
                              bg-teal-900/30 border border-teal-800/60 text-teal-300
                              text-xs font-semibold uppercase tracking-widest mb-8">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                Reinforcement Learning Platform
              </div>

              <h1 className="text-6xl font-black tracking-tight mb-6 leading-none">
                <span className="text-slate-100">Train AI</span>{" "}
                <span className="bg-gradient-to-r from-teal-300 to-amber-300 bg-clip-text text-transparent">
                  Robots
                </span>
                <br />
                <span className="text-slate-300 text-5xl font-bold">That Actually Learn</span>
              </h1>

              <p className="text-slate-400 text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
                Design your robot, choose an environment, pick an algorithm — and watch it train
                in real-time with live sensor feeds and reward charts.
              </p>

              <div className="flex items-center justify-center gap-4 flex-wrap">
                <button
                  onClick={() => onNavigate("wizard")}
                  className="px-10 py-4 rounded-2xl bg-gradient-to-r from-teal-500 to-amber-500
                             hover:from-teal-400 hover:to-amber-400 text-white font-bold text-lg
                             shadow-2xl shadow-black/40 transition-all hover:scale-105 active:scale-95 rm-cta-pulse"
                >
                  Build Your First Robot →
                </button>
                <div className="text-slate-600 text-sm">Free · No account required · Runs locally</div>
              </div>
            </div>
          </section>

          {/* Stats strip */}
          <section className="border-y border-slate-800/60 bg-[#0b1120]/70">
            <div className="max-w-5xl mx-auto px-8 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
              {STATS.map((s) => (
                <div key={s.label} className="text-center">
                  <div className="text-4xl font-black text-slate-100 tabular-nums
                                  bg-gradient-to-r from-teal-300 to-amber-300 bg-clip-text text-transparent">
                    {s.value}
                  </div>
                  <div className="text-sm text-slate-500 mt-1 font-medium">{s.label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Features grid */}
          <section className="max-w-5xl mx-auto px-8 py-16">
            <h2 className="text-3xl font-bold text-slate-100 text-center mb-2">
              Everything you need to train a smart robot
            </h2>
            <p className="text-slate-500 text-center mb-12 text-base">
              A complete reinforcement learning playground — right in your browser.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  className={`rounded-2xl border bg-gradient-to-br ${f.color} p-6 flex flex-col gap-3 rm-card-hover rm-fade-up rm-delay-${[75,150,225,300,375,450][i] ?? 75}`}
                >
                  <div className="text-4xl">{f.icon}</div>
                  <div className={`text-lg font-bold ${f.accent}`}>{f.title}</div>
                  <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-14 text-center">
              <button
                onClick={() => onNavigate("wizard")}
                className="px-12 py-4 rounded-2xl bg-gradient-to-r from-teal-500 to-amber-500
                           hover:from-teal-400 hover:to-amber-400 text-white font-bold text-lg
                           shadow-xl shadow-black/30 transition-all hover:scale-105 rm-cta-pulse"
              >
                Get Started — It's Free →
              </button>
            </div>
          </section>
        </main>
      ) : (
        /* ── Projects state ─────────────────────────────────────────────── */
        <main className="max-w-7xl mx-auto px-8 py-10">

          {/* Section header */}
          <div className="flex items-center justify-between mb-10">
            <div>
              <h1 className="text-3xl font-bold text-slate-100">Your Projects</h1>
              <p className="text-slate-500 text-sm mt-1.5">
                {projects.length} project{projects.length !== 1 ? "s" : ""} · Click to train or test
              </p>
            </div>
            <button
              onClick={() => onNavigate("wizard")}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl
                         bg-gradient-to-r from-teal-500 to-amber-500 hover:from-teal-400 hover:to-amber-400
                         text-white text-sm font-semibold transition-all active:scale-95 shadow-lg shadow-black/20"
            >
              ＋ New Project
            </button>
          </div>

          {/* Project grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
            {projects.map((project, idx) => (
              <div key={project.id} className={`rm-fade-up rm-delay-${[75,150,225,300,375,450][idx] ?? 75}`}>
                <ProjectCard
                  project={project}
                  onOpen={() => onNavigate("training", project.id)}
                  onDelete={() => onDeleteProject(project.id)}
                />
              </div>
            ))}

            {/* Create card */}
            <button
              onClick={() => onNavigate("wizard")}
              className="flex flex-col items-center justify-center gap-4 min-h-[280px]
                         rounded-2xl border-2 border-dashed border-slate-800/70
                         hover:border-teal-500/60 hover:bg-teal-950/10 hover:shadow-teal-sm
                         text-slate-600 hover:text-teal-300 transition-all duration-200 group rm-fade-up"
            >
              <div className="w-16 h-16 rounded-2xl border-2 border-dashed border-current
                              flex items-center justify-center text-3xl
                              group-hover:scale-110 transition-transform">
                ＋
              </div>
              <div className="text-center">
                <div className="text-sm font-semibold">New Project</div>
                <div className="text-xs text-slate-600 mt-1">Design a new robot</div>
              </div>
            </button>
          </div>
        </main>
      )}
    </div>
  );
};

// ── Project card ──────────────────────────────────────────────────────────────

interface CardProps {
  project: Project;
  onOpen: () => void;
  onDelete: () => void;
}

const ProjectCard = ({ project, onOpen, onDelete }: CardProps) => {
  const movementLabel: Record<string, string> = {
    differential: "Differential",
    ackermann:    "Ackermann",
    rover:        "Skid-Steer",
    omni:         "Omni",
    mecanum:      "Mecanum",
    drone:        "Drone",
    legged_quad:  "Quadruped",
    legged_biped: "Biped",
    tracked:      "Tracked",
    unicycle:     "Unicycle",
  };

  return (
    <div className="bg-[#0b1120]/80 border border-slate-800/70 rounded-2xl overflow-hidden
                    rm-card-hover group cursor-pointer"
         onClick={onOpen}>
      {/* Robot preview banner */}
      <div className="h-52 flex items-center justify-center bg-gradient-to-b from-[#0f172a] to-[#0b1120] relative">
        {/* Subtle glow behind robot */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-32 h-32 rounded-full blur-2xl opacity-30"
               style={{ backgroundColor: project.robot.color }} />
        </div>
        <RobotPreviewSVG design={project.robot} size={160} />
        {/* Status badge */}
        <span className={`absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5
                          rounded-full border text-xs font-semibold ${statusColors[project.status]}`}>
          <span className={`w-2 h-2 rounded-full ${statusDots[project.status]}`} />
          {project.status.charAt(0).toUpperCase() + project.status.slice(1)}
        </span>
      </div>

      <div className="p-5">
        <div className="font-bold text-slate-100 text-lg truncate">{project.name}</div>
        <div className="text-sm text-slate-500 mt-1 truncate">{project.description || "No description"}</div>

        {/* Meta pills */}
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            movementLabel[project.robot.movementType] || project.robot.movementType,
            project.algorithm,
            `${project.robot.sensors.count} sensors`,
            `${(project.steps / 1000).toFixed(0)}K steps`,
          ].map((tag) => (
            <span key={tag}
              className="px-2.5 py-1 rounded-lg bg-[#0f172a] border border-slate-800/70
                         text-xs text-slate-400 font-medium">
              {tag}
            </span>
          ))}
        </div>

        {/* Created date */}
        <div className="text-xs text-slate-600 mt-3">
          Created {new Date(project.createdAt).toLocaleDateString()}
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-amber-500
                       hover:from-teal-500 hover:to-amber-400 text-white text-sm font-semibold
                       transition-all active:scale-95"
          >
            {project.status === "trained" ? "🔬 View & Test" : "🚀 Train"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            title="Delete project"
            className="w-10 flex items-center justify-center rounded-xl bg-[#0f172a] border border-slate-800/70
                       hover:border-red-700/60 hover:text-red-400 text-slate-600
                       text-sm transition-all"
          >
            🗑
          </button>
        </div>
      </div>
    </div>
  );
};

