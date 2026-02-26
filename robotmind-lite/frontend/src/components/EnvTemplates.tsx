/**
 * EnvTemplates — visual environment template picker with maze generator.
 * Includes: Classic obstacle courses, Goal environments, Procedural mazes,
 * and a "Build Custom" shortcut that opens the EnvBuilder.
 */
import { useState } from "react";
import { EnvMinimap } from "./EnvMinimap";
import type { ProfileOption, WorldSummary } from "../types";

interface EnvTemplate {
  key: string;
  label: string;
  description: string;
  category: "classic" | "maze" | "goal" | "custom";
  icon: string;
  tags: string[];
  hasGoal: boolean;
}

const TEMPLATES: EnvTemplate[] = [
  {
    key: "arena_basic",
    label: "Arena Basic",
    description: "Balanced obstacle arena for baseline experiments",
    category: "classic", icon: "🏟️",
    tags: ["3 obstacles", "⭕ no goal"],
    hasGoal: false,
  },
  {
    key: "warehouse_dense",
    label: "Warehouse Dense",
    description: "High-density shelving layout",
    category: "classic", icon: "🏭",
    tags: ["6 obstacles", "hard", "⭕ no goal"],
    hasGoal: false,
  },
  {
    key: "corridor_sprint",
    label: "Corridor Sprint",
    description: "Narrow corridors, fast robot, long sensors",
    category: "classic", icon: "🏃",
    tags: ["4 columns", "speed", "⭕ no goal"],
    hasGoal: false,
  },
  {
    key: "flat_ground_differential_v1",
    label: "Flat Ground V1",
    description: "Real-world office/warehouse layout",
    category: "classic", icon: "🤖",
    tags: ["8 obstacles", "randomize", "⭕ no goal"],
    hasGoal: false,
  },
  {
    key: "flat_ground_ackermann_v1",
    label: "Parking Lot V1",
    description: "Ackermann parking lot with road dividers",
    category: "classic", icon: "🚗",
    tags: ["8 obstacles", "ackermann", "⭕ no goal"],
    hasGoal: false,
  },
  {
    key: "flat_ground_rover_v1",
    label: "Rover Warehouse",
    description: "Rover skid-steer in warehouse aisles",
    category: "classic", icon: "🛻",
    tags: ["10 obstacles", "rover", "⭕ no goal"],
    hasGoal: false,
  },
  {
    key: "goal_chase",
    label: "Goal Chase 🍎",
    description: "Navigate through obstacles to reach the glowing target",
    category: "goal", icon: "🎯",
    tags: ["4 obstacles", "★ goal: +100"],
    hasGoal: true,
  },
  {
    key: "apple_field",
    label: "Apple Field",
    description: "Open field — reach the goal with minimal obstacles",
    category: "goal", icon: "🍏",
    tags: ["2 obstacles", "★ goal: easy", "360° sensors"],
    hasGoal: true,
  },
  {
    key: "maze_4x4",
    label: "Maze 4×4",
    description: "Small 4×4 procedural maze",
    category: "maze", icon: "🌀",
    tags: ["★ exit goal", "seed 42"],
    hasGoal: true,
  },
  {
    key: "maze_6x6",
    label: "Maze 6×6",
    description: "Medium 6×6 procedural maze",
    category: "maze", icon: "🌀",
    tags: ["★ exit goal", "medium", "seed 7"],
    hasGoal: true,
  },
  {
    key: "maze_8x8",
    label: "Maze 8×8",
    description: "Large 8×8 procedural maze",
    category: "maze", icon: "🌀",
    tags: ["★ exit goal", "hard", "seed 13"],
    hasGoal: true,
  },
  {
    key: "maze_10x10",
    label: "Maze 10×10",
    description: "Very large 10×10 maze challenge",
    category: "maze", icon: "🌀",
    tags: ["★ exit goal", "very hard", "seed 99"],
    hasGoal: true,
  },
];

type Category = "all" | "classic" | "maze" | "goal";

interface EnvTemplatesProps {
  apiBase: string;
  currentKey: string;
  onSelect: (profileKey: string, label: string, worldSummary?: WorldSummary) => void;
  onCustomBuild: () => void;
  onClose: () => void;
  /** Pre-loaded profiles to get world_summary for minimap rendering */
  profiles?: ProfileOption[];
}

export const EnvTemplates = ({
  apiBase,
  currentKey,
  onSelect,
  onCustomBuild,
  onClose,
  profiles = [],
}: EnvTemplatesProps) => {
  const [tab, setTab]             = useState<Category>("all");
  const [mazeRows, setMazeRows]   = useState(5);
  const [mazeCols, setMazeCols]   = useState(5);
  const [mazeSeed, setMazeSeed]   = useState<number | "">("");
  const [cellSize, setCellSize]   = useState(70);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError]   = useState<string | null>(null);
  const [genKey, setGenKey]       = useState<string | null>(null);

  const filtered = tab === "all" ? TEMPLATES : TEMPLATES.filter((t) => t.category === tab);

  const handleGenMaze = async () => {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch(`${apiBase}/environment/generate-maze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: mazeRows,
          cols: mazeCols,
          cell_size: cellSize,
          seed: mazeSeed === "" ? null : Number(mazeSeed),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setGenError(err.detail ?? "Failed to generate maze");
        return;
      }
      const data = await res.json();
      setGenKey(data.profile_key);
      onSelect(data.profile_key, `Maze ${mazeRows}×${mazeCols}`);
    } catch (e) {
      setGenError("Network error");
    } finally {
      setGenerating(false);
    }
  };

  const TABS: { key: Category; label: string; emoji: string }[] = [
    { key: "all",     label: "All",       emoji: "🌐" },
    { key: "classic", label: "Classic",   emoji: "🏟️" },
    { key: "maze",    label: "Mazes",     emoji: "🌀" },
    { key: "goal",    label: "Goals",     emoji: "🍎" },
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[92vw] max-w-5xl max-h-[90vh] flex flex-col
                      bg-night-900 border border-night-700 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-night-700 bg-night-800/80">
          <div>
            <div className="font-bold text-slate-100 text-base">Choose Environment</div>
            <div className="text-xs text-slate-400 mt-0.5">Built-in presets, procedural mazes, goal environments</div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-night-700 hover:bg-night-600 text-slate-300 text-sm flex items-center justify-center"
          >✕</button>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-4 pt-3 pb-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                tab === t.key
                  ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                  : "bg-night-800 border border-night-700 text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.emoji} {t.label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={onCustomBuild}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 border
                       border-purple-500/50 text-purple-300 hover:bg-purple-500/30 transition-all"
          >
            🛠️ Build Custom
          </button>
        </div>

        {/* Template grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Custom maze generator card (only in 'all' and 'maze' tabs) */}
          {(tab === "all" || tab === "maze") && (
            <div className="mb-4 rounded-xl border border-amber-600/40 bg-amber-900/10 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">⚙️</span>
                <div>
                  <div className="text-sm font-semibold text-amber-300">Custom Maze Generator</div>
                  <div className="text-xs text-slate-400">
                    Create infinite unique mazes — configure size and seed
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Rows <span className="text-cyan-300 font-mono">{mazeRows}</span>
                  </label>
                  <input type="range" min={2} max={20} value={mazeRows}
                    onChange={(e) => setMazeRows(Number(e.target.value))}
                    className="w-full accent-amber-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Cols <span className="text-cyan-300 font-mono">{mazeCols}</span>
                  </label>
                  <input type="range" min={2} max={20} value={mazeCols}
                    onChange={(e) => setMazeCols(Number(e.target.value))}
                    className="w-full accent-amber-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Cell Size <span className="text-cyan-300 font-mono">{cellSize}px</span>
                  </label>
                  <input type="range" min={30} max={120} step={5} value={cellSize}
                    onChange={(e) => setCellSize(Number(e.target.value))}
                    className="w-full accent-amber-500" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Seed (blank = random)</label>
                  <input
                    type="number"
                    value={mazeSeed}
                    onChange={(e) => setMazeSeed(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="random"
                    className="w-full rounded-lg border border-night-600 bg-night-900 px-2 py-1.5
                               text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
              {genError && (
                <div className="text-xs text-red-400 mb-2">⚠️ {genError}</div>
              )}
              {genKey && (
                <div className="text-xs text-emerald-400 mb-2">✅ Generated: {genKey}</div>
              )}
              <button
                onClick={handleGenMaze}
                disabled={generating}
                className="w-full py-2 rounded-lg text-xs font-semibold transition-all
                           bg-amber-600/80 hover:bg-amber-500 disabled:opacity-50 text-white"
              >
                {generating ? "⏳ Generating…" : `🌀 Generate Maze ${mazeRows}×${mazeCols}`}
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filtered.map((tmpl) => {
              const selected = tmpl.key === currentKey;
              const worldSummary = profiles.find((p) => p.key === tmpl.key)?.world_summary;
              return (
                <button
                  key={tmpl.key}
                  onClick={() => { onSelect(tmpl.key, tmpl.label, worldSummary); onClose(); }}
                  className={`text-left rounded-xl border p-3.5 transition-all group ${
                    selected
                      ? "border-cyan-500/70 bg-cyan-500/10"
                      : "border-night-700 bg-night-800/60 hover:border-slate-600 hover:bg-night-800"
                  }`}
                >
                  {/* Minimap preview if world data is available, otherwise emoji icon */}
                  {worldSummary ? (
                    <div className="mb-2 rounded overflow-hidden border border-night-600 w-full">
                      <EnvMinimap world={worldSummary} size={120} className="w-full" />
                    </div>
                  ) : (
                    <div className="text-2xl mb-1.5">{tmpl.icon}</div>
                  )}
                  <div className={`text-sm font-semibold mb-0.5 flex items-center gap-1 ${
                    selected ? "text-cyan-200" : "text-slate-100"
                  }`}>
                    {worldSummary ? null : null}{tmpl.label}
                    {tmpl.hasGoal && <span className="text-amber-400 text-xs">★</span>}
                  </div>
                  <div className="text-xs text-slate-400 mb-2 leading-relaxed line-clamp-2">
                    {tmpl.description}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {tmpl.tags.map((tag) => (
                      <span key={tag}
                        className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          tag.startsWith("★")
                            ? "bg-amber-500/20 text-amber-300"
                            : "bg-night-700 text-slate-500"
                        }`}
                      >{tag}</span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
