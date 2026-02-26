/**
 * EnvBuilder — visual canvas-based environment editor.
 * Users can drag to place rectangular obstacles, click to place/move the goal,
 * right-click obstacles to delete, and export the result as a JSON preset.
 */
import { useCallback, useEffect, useRef, useState } from "react";

interface ObstacleRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GoalPos {
  x: number;
  y: number;
  radius: number;
}

interface EnvBuilderProps {
  onExport: (json: string) => void;
  onClose: () => void;
  initialObstacles?: ObstacleRect[];
  initialGoal?: GoalPos | null;
}

const COLOR = {
  bg:       "#0f172a",
  wall:     "#334155",
  obstacle: "#1e3a5f",
  obsBorder:"#3b82f6",
  goal:     "#f59e0b",
  selected: "#22c55e",
};

let _idSeq = 0;
const uid = () => `obs_${Date.now()}_${_idSeq++}`;

export const EnvBuilder = ({
  onExport,
  onClose,
  initialObstacles = [],
  initialGoal = null,
}: EnvBuilderProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [obstacles,   setObstacles]   = useState<ObstacleRect[]>(initialObstacles);
  const [goal,        setGoal]        = useState<GoalPos | null>(initialGoal);
  const [tool,        setTool]        = useState<"obstacle" | "goal" | "erase">("obstacle");
  const [worldW,      setWorldW]      = useState(640);
  const [worldH,      setWorldH]      = useState(480);
  const [wallMargin,  setWallMargin]  = useState(20);
  const [selectedId,  setSelectedId]  = useState<string | null>(null);

  // drag state refs (avoid setState on every mousemove)
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const dragCurrent = useRef({ x: 0, y: 0 });

  const CANVAS_W = 580;
  const CANVAS_H = 400;
  const scaleX = CANVAS_W / worldW;
  const scaleY = CANVAS_H / worldH;
  const scale = Math.min(scaleX, scaleY);

  const toWorld = (cx: number, cy: number) => ({
    x: cx / scale,
    y: cy / scale,
  });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Background
    ctx.fillStyle = COLOR.bg;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Wall boundary
    ctx.strokeStyle = COLOR.wall;
    ctx.lineWidth = 2;
    ctx.strokeRect(
      wallMargin * scale,
      wallMargin * scale,
      (worldW - wallMargin * 2) * scale,
      (worldH - wallMargin * 2) * scale
    );

    // Obstacles
    obstacles.forEach((obs) => {
      const isSelected = obs.id === selectedId;
      ctx.fillStyle = isSelected ? COLOR.selected + "44" : COLOR.obstacle;
      ctx.fillRect(obs.x * scale, obs.y * scale, obs.width * scale, obs.height * scale);
      ctx.strokeStyle = isSelected ? COLOR.selected : COLOR.obsBorder;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(obs.x * scale, obs.y * scale, obs.width * scale, obs.height * scale);
    });

    // Goal
    if (goal) {
      const gr = goal.radius * scale;
      ctx.shadowColor = COLOR.goal;
      ctx.shadowBlur = 12;
      ctx.fillStyle = COLOR.goal + "cc";
      ctx.beginPath();
      ctx.arc(goal.x * scale, goal.y * scale, gr, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(gr * 1.4)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", goal.x * scale, goal.y * scale);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    // Live drag preview
    if (dragging.current && tool === "obstacle") {
      const x = Math.min(dragStart.current.x, dragCurrent.current.x);
      const y = Math.min(dragStart.current.y, dragCurrent.current.y);
      const w = Math.abs(dragCurrent.current.x - dragStart.current.x);
      const h = Math.abs(dragCurrent.current.y - dragStart.current.y);
      ctx.fillStyle = COLOR.obsBorder + "40";
      ctx.strokeStyle = COLOR.obsBorder;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
    }
  }, [obstacles, goal, selectedId, tool, worldW, worldH, wallMargin, scale]);

  useEffect(() => { draw(); }, [draw]);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const findObstacleAt = (wx: number, wy: number): ObstacleRect | undefined =>
    [...obstacles].reverse().find(
      (o) => wx >= o.x && wx <= o.x + o.width && wy >= o.y && wy <= o.y + o.height
    );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getPos(e);
    if (tool === "goal") {
      const w = toWorld(pos.x, pos.y);
      setGoal({ x: Math.round(w.x), y: Math.round(w.y), radius: 18 });
      return;
    }
    if (tool === "erase") {
      const w = toWorld(pos.x, pos.y);
      const hit = findObstacleAt(w.x, w.y);
      if (hit) {
        setObstacles((prev) => prev.filter((o) => o.id !== hit.id));
        setSelectedId(null);
      } else {
        // erase goal if clicked near it
        if (goal) {
          const dx = w.x - goal.x;
          const dy = w.y - goal.y;
          if (Math.sqrt(dx * dx + dy * dy) <= goal.radius + 4) {
            setGoal(null);
          }
        }
      }
      return;
    }
    if (tool === "obstacle") {
      // Check if clicking an existing obstacle → select
      const w = toWorld(pos.x, pos.y);
      const hit = findObstacleAt(w.x, w.y);
      if (hit) {
        setSelectedId((prev) => (prev === hit.id ? null : hit.id));
        return;
      }
      dragging.current = true;
      dragStart.current = { x: pos.x, y: pos.y };
      dragCurrent.current = { x: pos.x, y: pos.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const pos = getPos(e);
    dragCurrent.current = { x: pos.x, y: pos.y };
    draw();
  };

  const handleMouseUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const x0 = Math.min(dragStart.current.x, dragCurrent.current.x);
    const y0 = Math.min(dragStart.current.y, dragCurrent.current.y);
    const w  = Math.abs(dragCurrent.current.x - dragStart.current.x);
    const h  = Math.abs(dragCurrent.current.y - dragStart.current.y);
    if (w > 8 && h > 8) {
      const wPos = toWorld(x0, y0);
      setObstacles((prev) => [
        ...prev,
        {
          id: uid(),
          x: Math.round(wPos.x),
          y: Math.round(wPos.y),
          width: Math.round(w / scale),
          height: Math.round(h / scale),
        },
      ]);
    }
    setSelectedId(null);
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    setObstacles((prev) => prev.filter((o) => o.id !== selectedId));
    setSelectedId(null);
  };

  const handleExport = () => {
    const config = {
      world: {
        width: worldW,
        height: worldH,
        wall_margin: wallMargin,
        obstacles: obstacles.map(({ x, y, width, height }) => ({
          x: +x.toFixed(1), y: +y.toFixed(1),
          width: +width.toFixed(1), height: +height.toFixed(1),
        })),
        ...(goal ? { goal: { x: +goal.x.toFixed(1), y: +goal.y.toFixed(1), radius: goal.radius } } : {}),
      },
      visual: {
        goal: "#f59e0b",
      },
    };
    onExport(JSON.stringify(config, null, 2));
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-[96vw] max-w-[940px] bg-night-900 border border-night-700 rounded-2xl shadow-2xl overflow-hidden flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-night-700 bg-night-800/80">
          <div>
            <div className="font-bold text-slate-100 text-base">🛠️ Custom Environment Builder</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Drag to draw obstacles · Click a placed obstacle to select · Right-click to erase
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg bg-night-700 hover:bg-night-600 text-slate-300 text-sm flex items-center justify-center">✕</button>
        </div>

        <div className="flex gap-0 overflow-hidden">
          {/* Left toolbar */}
          <div className="w-52 bg-night-800/60 border-r border-night-700 p-4 flex flex-col gap-3 flex-shrink-0">
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-1">Tool</div>
            {(["obstacle", "goal", "erase"] as const).map((t) => (
              <button key={t}
                onClick={() => setTool(t)}
                className={`w-full py-2 rounded-lg text-xs font-medium transition-all text-left px-3 ${
                  tool === t
                    ? "bg-cyan-500/20 border border-cyan-500/50 text-cyan-300"
                    : "bg-night-700 border border-night-600 text-slate-400 hover:text-slate-200"
                }`}
              >
                {t === "obstacle" ? "📦 Draw Obstacle" : t === "goal" ? "⭐ Place Goal" : "🗑️ Erase"}
              </button>
            ))}

            <div className="text-xs uppercase tracking-widest text-slate-500 mt-2">World</div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Width <span className="text-cyan-300 font-mono">{worldW}</span>
              </label>
              <input type="range" min={320} max={1200} step={20} value={worldW}
                onChange={(e) => setWorldW(Number(e.target.value))}
                className="w-full accent-cyan-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Height <span className="text-cyan-300 font-mono">{worldH}</span>
              </label>
              <input type="range" min={240} max={800} step={20} value={worldH}
                onChange={(e) => setWorldH(Number(e.target.value))}
                className="w-full accent-cyan-500" />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Wall margin <span className="text-cyan-300 font-mono">{wallMargin}</span>
              </label>
              <input type="range" min={10} max={60} step={5} value={wallMargin}
                onChange={(e) => setWallMargin(Number(e.target.value))}
                className="w-full accent-cyan-500" />
            </div>

            <div className="text-xs uppercase tracking-widest text-slate-500 mt-2">Actions</div>
            {selectedId && (
              <button onClick={handleDeleteSelected}
                className="w-full py-1.5 rounded-lg text-xs font-medium bg-red-900/30 border border-red-700/40 text-red-300 hover:bg-red-900/50">
                🗑️ Delete Selected
              </button>
            )}
            <button onClick={() => { setObstacles([]); setGoal(null); }}
              className="w-full py-1.5 rounded-lg text-xs font-medium bg-night-700 border border-night-600 text-slate-400 hover:text-slate-200">
              🧹 Clear All
            </button>
            <div className="text-xs text-slate-600 mt-1">
              {obstacles.length} obstacle{obstacles.length !== 1 ? "s" : ""}
              {goal ? " · ⭐ goal" : ""}
            </div>
          </div>

          {/* Canvas */}
          <div className="flex-1 flex items-center justify-center bg-night-950 p-3">
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              className="rounded-xl border border-night-700"
              style={{ cursor: tool === "erase" ? "not-allowed" : tool === "goal" ? "crosshair" : "crosshair" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onContextMenu={(e) => {
                e.preventDefault();
                const pos = getPos(e);
                const w = toWorld(pos.x, pos.y);
                const hit = findObstacleAt(w.x, w.y);
                if (hit) setObstacles((prev) => prev.filter((o) => o.id !== hit.id));
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-night-700 bg-night-800/80">
          <div className="text-xs text-slate-500">
            Tip: Drag empty area to draw an obstacle. Right-click to delete. Click ⭐ tool then click to place goal.
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs border border-night-600 text-slate-400 hover:text-slate-200">
              Cancel
            </button>
            <button onClick={handleExport}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-600 to-blue-600
                         hover:from-cyan-500 hover:to-blue-500 text-white transition-all">
              ✅ Apply to Advanced JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
