import type { Project } from "../types";
import { RobotPreviewSVG } from "./RobotDesigner";

interface SidebarProps {
  project?: Project;
}

// Generic features list shown when no project is active (e.g. fallback)
const FEATURES = [
  { icon: "??", label: "V1 Models",   description: "3 flat-ground types", active: true },
  { icon: "?", label: "Real-time",   description: "Live simulation",      active: true },
  { icon: "??", label: "Analytics",   description: "Training metrics",     active: true },
];

const STATUS_COLOR: Record<string, string> = {
  draft:    "text-slate-400 bg-slate-900 border-slate-800",
  training: "text-amber-300 bg-amber-900/30 border-amber-700",
  trained:  "text-emerald-300 bg-emerald-900/30 border-emerald-700",
};

export const Sidebar = ({ project }: SidebarProps) => {
  if (project) {
    // -- Project-aware sidebar ------------------------------------------------
    const { robot, algorithm, environmentProfile, modelProfile, steps, status } = project;
    return (
      <aside className="flex h-full flex-col gap-5 bg-gradient-to-b from-slate-950 to-slate-900 p-5 shadow-2xl overflow-y-auto">
        {/* Robot preview */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 flex flex-col items-center gap-3">
          <RobotPreviewSVG design={robot} size={130} />
          <div className="text-center">
            <div className="text-sm font-bold text-slate-100 truncate max-w-[200px]">{project.name}</div>
            <span className={`mt-1 inline-block px-2 py-0.5 rounded-full border text-[10px] font-semibold capitalize ${STATUS_COLOR[status] ?? STATUS_COLOR.draft}`}>
              {status}
            </span>
          </div>
        </div>

        {/* Robot stats */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-amber-400 mb-2">Robot Config</div>
          {[
            ["Shape",     robot.shape],
            ["Movement",  robot.movementType],
            ["Sensors",   `${robot.sensors.count} rays • ${robot.sensors.fov}° FOV`],
            ["Range",     `${robot.sensors.range} px`],
            ["Speed",     `${robot.speed} px/s`],
            ["Turn",      `${robot.turnRate}°/step`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{label}</span>
              <span className="text-slate-200 font-mono capitalize">{value}</span>
            </div>
          ))}
        </div>

        {/* Training config */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.3em] text-teal-400 mb-2">Training Config</div>
          {[
            ["Algorithm",    algorithm],
            ["Environment",  environmentProfile.replace(/_v\d+$/, "").replaceAll("_", " ")],
            ["Model",        modelProfile],
            ["Steps",        steps.toLocaleString()],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{label}</span>
              <span className="text-slate-200 font-mono capitalize">{value}</span>
            </div>
          ))}
        </div>

        {/* System status */}
        <div className="mt-auto rounded-xl border border-slate-700 bg-slate-800/60 p-4">
          <div className="text-xs font-semibold text-slate-300 mb-2">System Status</div>
          <div className="space-y-1.5 text-xs text-slate-400">
            <div className="flex items-center justify-between">
              <span>Backend</span>
              <span className="text-emerald-300">? Online</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Export</span>
              <span className="text-amber-300">ONNX Ready</span>
            </div>
          </div>
        </div>
      </aside>
    );
  }

  // -- Generic sidebar (home page / fallback) ----------------------------------
  return (
    <aside className="flex h-full flex-col gap-6 bg-gradient-to-b from-slate-950 to-slate-900 p-6 shadow-2xl">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="text-xs uppercase tracking-[0.4em] text-emerald-400">Quick Start</div>
        <div className="mt-2 text-lg font-semibold text-slate-100">Training Hub</div>
        <div className="mt-2 text-xs text-slate-400">Build and deploy RL models in minutes</div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Features</div>
        {FEATURES.map((item) => (
          <div
            key={item.label}
            className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-800/40 p-3 transition hover:border-emerald-500/30 hover:bg-slate-800"
          >
            <span className="text-2xl">{item.icon}</span>
            <div className="flex-1">
              <div className="text-sm font-medium text-slate-100">{item.label}</div>
              <div className="text-xs text-slate-400">{item.description}</div>
            </div>
            {item.active && <span className="text-emerald-400">?</span>}
          </div>
        ))}
      </div>

      <div className="mt-auto rounded-xl border border-slate-700 bg-slate-800/60 p-4">
        <div className="text-xs font-semibold text-slate-300">System Status</div>
        <div className="mt-2 space-y-1.5 text-xs text-slate-400">
          <div className="flex items-center justify-between">
            <span>Backend</span>
            <span className="text-emerald-300">? Online</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Algorithms</span>
            <span className="text-teal-300">PPO • A2C • DQN</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Export</span>
            <span className="text-amber-300">ONNX Ready</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

