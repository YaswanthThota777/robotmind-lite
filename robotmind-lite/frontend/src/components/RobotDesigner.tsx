/**
 * RobotDesigner – interactive robot body + movement type selector.
 * Renders a live SVG preview of the robot shape with sensor placement.
 */
import type { RobotDesign, RobotShape, MovementType, SensorPlacement } from "../types";

// ── constants ────────────────────────────────────────────────────────────────

const SHAPES: { key: RobotShape; label: string; icon: string; desc: string }[] = [
  { key: "circle",    label: "Circle",     icon: "⬤",  desc: "Omnidirectional body. Works for any drive type." },
  { key: "rectangle", label: "Rectangle",  icon: "▬",  desc: "Classic wheeled robot. Good for front-facing sensors." },
  { key: "oval",      label: "Oval",       icon: "⬭",  desc: "Aerodynamic. Suited for fast ackermann vehicles." },
  { key: "square",    label: "Square",     icon: "■",  desc: "Compact cube robot. Industrial / warehouse use." },
  { key: "hexagon",   label: "Hexagon",    icon: "⬡",  desc: "Six-sided body with uniform sensor distribution." },
  { key: "triangle",  label: "Triangle",   icon: "▲",  desc: "Forward-biased shape. Scout / surveillance bots." },
  { key: "pentagon",  label: "Pentagon",   icon: "⬠",  desc: "Versatile body for mixed sensor placement." },
  { key: "tracked",   label: "Tracked",    icon: "🔲",  desc: "Tank-style body. Best with rover/tracked drive." },
];

const MOVEMENT_TYPES: {
  key: MovementType;
  label: string;
  icon: string;
  tag: string;
  desc: string;
  backendKey: string;
}[] = [
  {
    key: "differential",
    label: "Differential Drive",
    icon: "🤖",
    tag: "2-wheel",
    desc: "Left/right wheel speed difference creates turning. Most common ground robot type.",
    backendKey: "differential",
  },
  {
    key: "ackermann",
    label: "Ackermann Steering",
    icon: "🚗",
    tag: "Car-like",
    desc: "Front-wheel car steering. Can only turn while moving forward.",
    backendKey: "ackermann",
  },
  {
    key: "rover",
    label: "Rover / Skid-Steer",
    icon: "🚙",
    tag: "4-wheel",
    desc: "Skid to turn: all wheels driven, no steering angles. Great for tight spaces.",
    backendKey: "rover",
  },
  {
    key: "omni",
    label: "Omnidirectional",
    icon: "🔄",
    tag: "Holonomic",
    desc: "Moves in any direction without changing heading. Omni-wheels or holonomic base.",
    backendKey: "differential",
  },
  {
    key: "mecanum",
    label: "Mecanum Wheels",
    icon: "⚙️",
    tag: "Diagonal",
    desc: "Diagonal rollers allow sideways and diagonal movement simultaneously.",
    backendKey: "differential",
  },
  {
    key: "tracked",
    label: "Tracked / Tank",
    icon: "🛡️",
    tag: "Treads",
    desc: "Continuous track drive. High torque, works on rough terrain.",
    backendKey: "rover",
  },
  {
    key: "drone",
    label: "Aerial Drone",
    icon: "🚁",
    tag: "6-DOF",
    desc: "Moves in 3D space. Modeled as 2D top-down navigation for training.",
    backendKey: "differential",
  },
  {
    key: "legged_quad",
    label: "Quadruped (4-leg)",
    icon: "🐕",
    tag: "Legged",
    desc: "Four-legged walking robot. Modeled with rover dynamics.",
    backendKey: "rover",
  },
  {
    key: "legged_biped",
    label: "Biped (2-leg)",
    icon: "🧍",
    tag: "Legged",
    desc: "Two-legged humanoid robot. Balancing locomotion.",
    backendKey: "differential",
  },
  {
    key: "unicycle",
    label: "Unicycle",
    icon: "🎡",
    tag: "Single wheel",
    desc: "Single-wheel balancing robot. Minimal footprint.",
    backendKey: "differential",
  },
];

const COLORS = [
  "#22c55e", "#14b8a6", "#3b82f6", "#8b5cf6",
  "#f59e0b", "#ef4444", "#ec4899", "#64748b",
];

// ── SVG shape paths (centered on 0,0 for a 40-unit radius) ──────────────────

function robotShapePath(shape: RobotShape, r = 40): string {
  const pts = (n: number, offset = 0) =>
    Array.from({ length: n }, (_, i) => {
      const a = (((360 / n) * i + offset) * Math.PI) / 180;
      return `${r * Math.cos(a)},${r * Math.sin(a)}`;
    });

  switch (shape) {
    case "circle":
      return ""; // handled as <circle>
    case "rectangle":
      return `M${-r * 1.3},${-r * 0.8} h${r * 2.6} v${r * 1.6} h${-r * 2.6} Z`;
    case "oval":
      return ""; // handled as <ellipse>
    case "square":
      return `M${-r},${-r} h${r * 2} v${r * 2} h${-r * 2} Z`;
    case "hexagon":
      return `M${pts(6, -90).join(" L")} Z`;
    case "triangle":
      return `M0,${-r * 1.2} L${r},${r * 0.8} L${-r},${r * 0.8} Z`;
    case "pentagon":
      return `M${pts(5, -90).join(" L")} Z`;
    case "tracked":
      return `M${-r * 1.3},${-r * 0.7} h${r * 2.6} v${r * 1.4} h${-r * 2.6} Z`;
    default:
      return "";
  }
}

// ── sensor ray visualisation ─────────────────────────────────────────────────

function sensorAngles(placement: SensorPlacement, count: number): number[] {
  if (count <= 0) return [];
  const step = (n: number, total: number, offset = 0) =>
    Array.from({ length: n }, (_, i) =>
      total === 360 ? (360 / n) * i + offset : offset - total / 2 + (total / Math.max(n - 1, 1)) * i
    );
  switch (placement) {
    case "front":      return step(count, 90, -90);  // -90 = "up" in SVG
    case "front_sides":return step(count, 160, -90);
    case "front_rear": return step(count, 260, -90);
    case "sides":      return step(count, 180, 0);
    case "360":        return step(count, 360, -90);
    case "custom":     return step(count, 120, -90);
    default:           return step(count, 120, -90);
  }
}

// ── preview SVG ──────────────────────────────────────────────────────────────

interface PreviewProps {
  design: RobotDesign;
  size?: number;
}

export const RobotPreviewSVG = ({ design, size = 200 }: PreviewProps) => {
  const cx = size / 2;
  const cy = size / 2;
  const r  = (size / 2) * 0.38;
  const angles = sensorAngles(design.sensors.placement, design.sensors.count);
  const rayLen = r + (design.sensors.range / 300) * (size * 0.36);
  const fovPerRay = 18;

  const shapeEl = () => {
    const p = robotShapePath(design.shape, r);
    const common = {
      fill: design.color + "33",
      stroke: design.color,
      strokeWidth: 2,
    };
    switch (design.shape) {
      case "circle":
        return <circle cx={0} cy={0} r={r} {...common} />;
      case "oval":
        return <ellipse cx={0} cy={0} rx={r * 1.3} ry={r * 0.75} {...common} />;
      default:
        return <path d={p} {...common} />;
    }
  };

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="overflow-visible"
    >
      <g transform={`translate(${cx},${cy})`}>
        {/* Sensor rays */}
        {angles.map((angleDeg, i) => {
          const rad = (angleDeg * Math.PI) / 180;
          const ex = Math.cos(rad) * rayLen;
          const ey = Math.sin(rad) * rayLen;
          const half = (fovPerRay * Math.PI) / 180 / 2;
          const r1 = angleDeg - fovPerRay / 2;
          const r2 = angleDeg + fovPerRay / 2;
          const x1 = Math.cos((r1 * Math.PI) / 180) * rayLen;
          const y1 = Math.sin((r1 * Math.PI) / 180) * rayLen;
          const x2 = Math.cos((r2 * Math.PI) / 180) * rayLen;
          const y2 = Math.sin((r2 * Math.PI) / 180) * rayLen;
          return (
            <g key={i}>
              <path
                d={`M0,0 L${x1},${y1} A${rayLen},${rayLen},0,0,1,${x2},${y2} Z`}
                fill="rgba(56,189,248,0.07)"
                stroke="none"
              />
              <line
                x1={0} y1={0} x2={ex} y2={ey}
                stroke="rgba(56,189,248,0.55)"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <circle
                cx={ex} cy={ey}
                r={3}
                fill="#38bdf8"
              />
            </g>
          );
        })}
        {/* Forward direction arrow */}
        <line x1={0} y1={0} x2={0} y2={-(r + 14)}
          stroke={design.color} strokeWidth={2} markerEnd="url(#arrow)" />
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
            <path d="M0,0 L0,8 L8,4 Z" fill={design.color} />
          </marker>
        </defs>
        {/* Robot body */}
        {shapeEl()}
        {/* Track markings if tracked */}
        {design.shape === "tracked" && (
          <>
            <rect x={-r * 1.3} y={-r * 0.7} width={r * 2.6} height={r * 0.3}
              fill="none" stroke={design.color} strokeWidth={1} opacity={0.5} />
            <rect x={-r * 1.3} y={r * 0.4} width={r * 2.6} height={r * 0.3}
              fill="none" stroke={design.color} strokeWidth={1} opacity={0.5} />
          </>
        )}
        {/* Center dot */}
        <circle cx={0} cy={0} r={3} fill={design.color} />
        {/* "FRONT" label */}
        <text x={0} y={-(r + 22)} textAnchor="middle" fontSize={9}
          fill={design.color} fontFamily="monospace" opacity={0.8}>FRONT</text>
      </g>
    </svg>
  );
};

// ── main component ───────────────────────────────────────────────────────────

interface RobotDesignerProps {
  design: RobotDesign;
  onChange: (d: RobotDesign) => void;
}

export const RobotDesigner = ({ design, onChange }: RobotDesignerProps) => {
  const set = (patch: Partial<RobotDesign>) => onChange({ ...design, ...patch });
  const setSensors = (patch: Partial<RobotDesign["sensors"]>) =>
    set({ sensors: { ...design.sensors, ...patch } });

  return (
    <div className="flex gap-8 flex-wrap lg:flex-nowrap">
      {/* Left: preview */}
      <div className="flex-shrink-0 flex flex-col items-center gap-4">
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6">
          <RobotPreviewSVG design={design} size={220} />
        </div>

        {/* Color picker */}
        <div>
          <div className="text-xs text-slate-400 mb-2 text-center">Robot color</div>
          <div className="flex gap-2 flex-wrap justify-center">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => set({ color: c })}
                className="w-7 h-7 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  background: c,
                  borderColor: design.color === c ? "#fff" : "transparent",
                }}
              />
            ))}
          </div>
        </div>

        {/* Quick stats */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl px-5 py-3 text-xs w-full space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Sensors</span>
            <span className="text-teal-400 font-mono">{design.sensors.count}x</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Range</span>
            <span className="text-teal-400 font-mono">{design.sensors.range}px</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">FOV</span>
            <span className="text-teal-400 font-mono">{design.sensors.fov}°</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Speed</span>
            <span className="text-teal-400 font-mono">{design.speed}px/s</span>
          </div>
        </div>
      </div>

      {/* Right: controls */}
      <div className="flex-1 space-y-6 min-w-0">
        {/* Project name */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1.5 uppercase tracking-wider">
            Project name
          </label>
          <input
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5
                       text-slate-100 text-sm focus:outline-none focus:border-teal-500 transition-colors"
            placeholder="e.g. Warehouse Navigator"
            value={design.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </div>

        {/* Shape selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
            Body shape
          </label>
          <div className="grid grid-cols-4 gap-2">
            {SHAPES.map((s) => (
              <button
                key={s.key}
                title={s.desc}
                onClick={() => set({ shape: s.key })}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-xs transition-all
                  ${design.shape === s.key
                    ? "border-teal-500 bg-teal-500/10 text-teal-300"
                    : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-600"}`}
              >
                <span className="text-lg">{s.icon}</span>
                <span className="truncate">{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Movement type */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
            Movement type
          </label>
          <div className="grid grid-cols-2 gap-2">
            {MOVEMENT_TYPES.map((m) => (
              <button
                key={m.key}
                onClick={() => set({ movementType: m.key })}
                className={`flex gap-3 items-start p-3 rounded-xl border text-left transition-all
                  ${design.movementType === m.key
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-slate-800 bg-slate-950 hover:border-slate-600"}`}
              >
                <span className="text-xl mt-0.5 flex-shrink-0">{m.icon}</span>
                <div className="min-w-0">
                  <div className={`text-xs font-semibold truncate ${design.movementType === m.key ? "text-emerald-300" : "text-slate-300"}`}>
                    {m.label}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{m.tag}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Physics sliders */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Size <span className="text-teal-400 font-mono">{design.size}px</span>
            </label>
            <input type="range" min={8} max={30} value={design.size}
              onChange={(e) => set({ size: Number(e.target.value) })}
              className="w-full accent-teal-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Speed <span className="text-teal-400 font-mono">{design.speed}</span>
            </label>
            <input type="range" min={60} max={250} step={10} value={design.speed}
              onChange={(e) => set({ speed: Number(e.target.value) })}
              className="w-full accent-emerald-500" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Turn rate <span className="text-teal-400 font-mono">{design.turnRate}°</span>
            </label>
            <input type="range" min={4} max={30} value={design.turnRate}
              onChange={(e) => set({ turnRate: Number(e.target.value) })}
              className="w-full accent-amber-500" />
          </div>
        </div>

        {/* Sensor config */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-2 uppercase tracking-wider">
            Sensors
          </label>
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
            {/* Sensor placement */}
            <div>
              <div className="text-xs text-slate-400 mb-2">Placement pattern</div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { key: "front",      label: "Front only",   icon: "⬆️" },
                    { key: "front_sides",label: "Front + sides", icon: "↖️↗️" },
                    { key: "front_rear", label: "Fore & aft",    icon: "⬆️⬇️" },
                    { key: "sides",      label: "Sides only",    icon: "⬅️➡️" },
                    { key: "360",        label: "360° LiDAR",    icon: "🔄" },
                    { key: "custom",     label: "Custom FOV",    icon: "✏️" },
                  ] as { key: SensorPlacement; label: string; icon: string }[]
                ).map((p) => (
                  <button
                    key={p.key}
                    onClick={() => setSensors({ placement: p.key, fov: p.key === "360" ? 360 : p.key === "front_rear" ? 240 : p.key === "front_sides" ? 150 : p.key === "sides" ? 180 : p.key === "front" ? 90 : 120 })}
                    className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs transition-all
                      ${design.sensors.placement === p.key
                        ? "border-teal-500 bg-teal-500/10 text-teal-200"
                        : "border-slate-800 text-slate-400 hover:border-slate-600"}`}
                  >
                    <span>{p.icon}</span>
                    <span className="leading-tight text-center">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sensor count + range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Sensor count <span className="text-teal-400 font-mono">{design.sensors.count}</span>
                </label>
                <input type="range" min={2} max={24} value={design.sensors.count}
                  onChange={(e) => setSensors({ count: Number(e.target.value) })}
                  className="w-full accent-teal-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Range <span className="text-teal-400 font-mono">{design.sensors.range}px</span>
                </label>
                <input type="range" min={60} max={300} step={10} value={design.sensors.range}
                  onChange={(e) => setSensors({ range: Number(e.target.value) })}
                  className="w-full accent-amber-500" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── helper export: convert RobotDesign → custom_environment JSON ─────────────

export function robotDesignToEnvConfig(d: RobotDesign): Record<string, unknown> {
  const movementMap: Record<MovementType, string> = {
    differential: "differential",
    ackermann:    "ackermann",
    rover:        "rover",
    omni:         "differential",
    mecanum:      "differential",
    drone:        "differential",
    legged_quad:  "rover",
    legged_biped: "differential",
    tracked:      "rover",
    unicycle:     "differential",
  };

  return {
    metadata: {
      flat_ground_model: movementMap[d.movementType],
      robot_shape:       d.shape,
    },
    robot: {
      radius:            d.size,
      speed:             d.speed,
      turn_rate_degrees: d.turnRate,
    },
    sensor: {
      ray_count:       d.sensors.count,
      ray_length:      d.sensors.range,
      ray_fov_degrees: d.sensors.fov,
    },
    // Visual overrides so canvas renders the user's chosen color
    visual: {
      robot:           d.color,
      robot_collision: "#ef4444",
      ray:             `${d.color}80`,
    },
  };
}

