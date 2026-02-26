import { useEffect, useMemo, useRef, useState } from "react";
import type { ScenarioMapConfig } from "../types";

type ScenarioMapEditorProps = {
  config: ScenarioMapConfig;
  onChange: (next: ScenarioMapConfig) => void;
};

const preview = { width: 800, height: 240 };
const GRID_SIZE = 10;

type DragMode = "move" | "resize" | "rotate" | "pan";

const snap = (value: number) => Math.round(value / GRID_SIZE) * GRID_SIZE;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeAngle = (angle: number) => {
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

export const ScenarioMapEditor = ({ config, onChange }: ScenarioMapEditorProps) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [localZoom, setLocalZoom] = useState(config.zoom ?? 1);
  const [localPanX, setLocalPanX] = useState(config.panX ?? 0);
  const [localPanY, setLocalPanY] = useState(config.panY ?? 0);
  const [showPresets, setShowPresets] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<{ name: string; config: ScenarioMapConfig }[]>([]);

  const dragRef = useRef<
    | {
        mode: DragMode;
        index?: number;
        startX: number;
        startY: number;
        originalX?: number;
        originalY?: number;
        originalWidth?: number;
        originalHeight?: number;
        originalRotation?: number;
        panStartX?: number;
        panStartY?: number;
      }
    | null
  >(null);

  const scaledZoom = (config.zoom ?? 1) * localZoom;
  const baseScale = Math.min(
    preview.width / Math.max(config.worldWidth, 1),
    preview.height / Math.max(config.worldHeight, 1)
  );
  const finalScale = baseScale * scaledZoom;

  const toWorldCoordinates = (clientX: number, clientY: number, element: HTMLDivElement) => {
    const bounds = element.getBoundingClientRect();
    const screenX = clientX - bounds.left;
    const screenY = clientY - bounds.top;
    return {
      x: (screenX - localPanX - (config.panX ?? 0)) / finalScale,
      y: (screenY - localPanY - (config.panY ?? 0)) / finalScale,
    };
  };

  const handleCanvasClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!config.enabled) return;
    const { x: localX, y: localY } = toWorldCoordinates(event.clientX, event.clientY, event.currentTarget);

    const obstacle = {
      x: snap(clamp(localX - config.defaultObstacleWidth / 2, config.wallMargin, config.worldWidth - config.wallMargin - config.defaultObstacleWidth)),
      y: snap(clamp(localY - config.defaultObstacleHeight / 2, config.wallMargin, config.worldHeight - config.wallMargin - config.defaultObstacleHeight)),
      width: snap(config.defaultObstacleWidth),
      height: snap(config.defaultObstacleHeight),
      rotation: 0,
    };

    const nextObstacles = [...config.obstacles, obstacle];
    setSelectedIndex(nextObstacles.length - 1);
    onChange({ ...config, obstacles: nextObstacles });
  };

  const beginDrag = (
    event: React.MouseEvent<HTMLDivElement>,
    index: number,
    mode: DragMode
  ) => {
    if (!config.enabled) return;
    event.stopPropagation();
    const target = event.currentTarget.closest("[data-map-surface]") as HTMLDivElement | null;
    if (!target) return;

    const obstacle = config.obstacles[index];
    if (!obstacle) return;
    setSelectedIndex(index);
    dragRef.current = {
      mode,
      index,
      startX: event.clientX,
      startY: event.clientY,
      originalX: obstacle.x,
      originalY: obstacle.y,
      originalWidth: obstacle.width,
      originalHeight: obstacle.height,
      originalRotation: obstacle.rotation ?? 0,
    };
  };

  const handleCanvasWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (!config.enabled || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const zoomDelta = event.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = clamp(localZoom * zoomDelta, 0.5, 3);
    setLocalZoom(newZoom);
  };

  const handleCanvasPan = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!config.enabled || !event.shiftKey) return;
    event.stopPropagation();
    dragRef.current = {
      mode: "pan",
      startX: event.clientX,
      startY: event.clientY,
      panStartX: localPanX,
      panStartY: localPanY,
    };
  };

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag || !config.enabled) return;

      if (drag.mode === "pan") {
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        setLocalPanX((drag.panStartX ?? 0) + dx);
        setLocalPanY((drag.panStartY ?? 0) + dy);
      } else if (drag.index !== undefined) {
        const dxWorld = (event.clientX - drag.startX) / finalScale;
        const dyWorld = (event.clientY - drag.startY) / finalScale;
        const obstacles = [...config.obstacles];
        const obstacle = obstacles[drag.index];
        if (!obstacle) return;

        if (drag.mode === "move") {
          const maxX = config.worldWidth - config.wallMargin - obstacle.width;
          const maxY = config.worldHeight - config.wallMargin - obstacle.height;
          obstacle.x = snap(clamp((drag.originalX ?? 0) + dxWorld, config.wallMargin, maxX));
          obstacle.y = snap(clamp((drag.originalY ?? 0) + dyWorld, config.wallMargin, maxY));
        } else if (drag.mode === "resize") {
          const minSize = GRID_SIZE;
          const maxWidth = config.worldWidth - config.wallMargin - obstacle.x;
          const maxHeight = config.worldHeight - config.wallMargin - obstacle.y;
          obstacle.width = snap(clamp((drag.originalWidth ?? 0) + dxWorld, minSize, maxWidth));
          obstacle.height = snap(clamp((drag.originalHeight ?? 0) + dyWorld, minSize, maxHeight));
        } else if (drag.mode === "rotate") {
          const centerX = (drag.originalX ?? 0) + (drag.originalWidth ?? 0) / 2;
          const centerY = (drag.originalY ?? 0) + (drag.originalHeight ?? 0) / 2;
          const angle = Math.atan2(event.clientY - drag.startY, event.clientX - drag.startX);
          obstacle.rotation = normalizeAngle((drag.originalRotation ?? 0) + angle * (180 / Math.PI));
        }

        onChange({ ...config, obstacles });
      }
    };

    const onMouseUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [config, onChange, finalScale]);

  const savePreset = () => {
    if (!presetName.trim()) return;
    const newPreset = {
      name: presetName,
      config: { ...config, zoom: localZoom, panX: localPanX, panY: localPanY },
    };
    const updated = presets.filter((p) => p.name !== presetName);
    updated.push(newPreset);
    setPresets(updated);
    setPresetName("");
    setShowPresets(false);
  };

  const loadPreset = (preset: { name: string; config: ScenarioMapConfig }) => {
    onChange(preset.config);
    setLocalZoom(preset.config.zoom);
    setLocalPanX(preset.config.panX);
    setLocalPanY(preset.config.panY);
    setShowPresets(false);
  };

  const deletePreset = (name: string) => {
    setPresets(presets.filter((p) => p.name !== name));
  };

  return (
    <section className="rounded-2xl border border-night-700 bg-night-800 p-4 shadow-panel">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Scenario Map Pro</div>
        <div className="flex gap-2">
          <button
            className={`rounded px-2 py-1 text-[10px] ${showPresets ? "bg-purple-600/30 text-purple-100" : "bg-night-700 text-slate-300"}`}
            onClick={() => setShowPresets(!showPresets)}
          >
            {presets.length > 0 ? `Presets (${presets.length})` : "Save Preset"}
          </button>
          <button
            className={`rounded px-2 py-1 text-[10px] ${config.enabled ? "bg-cyan-600/30 text-cyan-100" : "bg-night-700 text-slate-300"}`}
            onClick={() => onChange({ ...config, enabled: !config.enabled })}
          >
            {config.enabled ? "Editor On" : "Editor Off"}
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-slate-300">
        <label className="space-y-1">
          <span>World W</span>
          <input
            type="number"
            className="w-full rounded border border-night-600 bg-night-900 px-2 py-1"
            min={320}
            max={2000}
            value={config.worldWidth}
            onChange={(event) => onChange({ ...config, worldWidth: Number(event.target.value) || 640 })}
          />
        </label>
        <label className="space-y-1">
          <span>World H</span>
          <input
            type="number"
            className="w-full rounded border border-night-600 bg-night-900 px-2 py-1"
            min={240}
            max={1200}
            value={config.worldHeight}
            onChange={(event) => onChange({ ...config, worldHeight: Number(event.target.value) || 480 })}
          />
        </label>
        <label className="space-y-1">
          <span>Wall Margin</span>
          <input
            type="number"
            className="w-full rounded border border-night-600 bg-night-900 px-2 py-1"
            min={8}
            max={120}
            value={config.wallMargin}
            onChange={(event) => onChange({ ...config, wallMargin: Number(event.target.value) || 20 })}
          />
        </label>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-slate-300">
        <label className="space-y-1">
          <span>Default W</span>
          <input
            type="number"
            className="w-full rounded border border-night-600 bg-night-900 px-2 py-1"
            min={20}
            max={400}
            value={config.defaultObstacleWidth}
            onChange={(event) => onChange({ ...config, defaultObstacleWidth: Number(event.target.value) || 100 })}
          />
        </label>
        <label className="space-y-1">
          <span>Default H</span>
          <input
            type="number"
            className="w-full rounded border border-night-600 bg-night-900 px-2 py-1"
            min={20}
            max={400}
            value={config.defaultObstacleHeight}
            onChange={(event) => onChange({ ...config, defaultObstacleHeight: Number(event.target.value) || 50 })}
          />
        </label>
        <label className="space-y-1">
          <span>Zoom</span>
          <input
            type="number"
            className="w-full rounded border border-night-600 bg-night-900 px-2 py-1"
            min={0.5}
            max={3}
            step={0.1}
            value={localZoom.toFixed(2)}
            onChange={(event) => setLocalZoom(clamp(Number(event.target.value) || 1, 0.5, 3))}
          />
        </label>
        <button
          className="mt-5 rounded border border-night-600 bg-night-900 px-2 py-1 text-xs text-slate-200"
          onClick={() => {
            setLocalZoom(1);
            setLocalPanX(0);
            setLocalPanY(0);
          }}
        >
          Reset View
        </button>
      </div>

      {showPresets && (
        <div className="mt-3 space-y-2 rounded border border-night-600 bg-night-900 p-2">
          <div className="flex gap-1">
            <input
              type="text"
              placeholder="Preset name..."
              className="flex-1 rounded border border-night-600 bg-night-800 px-2 py-1 text-xs text-slate-200 placeholder-slate-600"
              value={presetName}
              onChange={(event) => setPresetName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") savePreset();
              }}
            />
            <button
              className="rounded border border-purple-600 bg-purple-600/20 px-2 py-1 text-xs text-purple-200"
              onClick={savePreset}
            >
              Save
            </button>
          </div>
          {presets.length > 0 && (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {presets.map((preset) => (
                <div key={preset.name} className="flex items-center gap-1 rounded bg-night-700 px-2 py-1">
                  <button
                    className="flex-1 text-left text-xs text-slate-300 hover:text-slate-100"
                    onClick={() => loadPreset(preset)}
                  >
                    {preset.name}
                  </button>
                  <button
                    className="rounded border border-red-600/30 bg-red-600/10 px-1 text-[10px] text-red-300 hover:bg-red-600/20"
                    onClick={() => deletePreset(preset.name)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        data-map-surface="true"
        className="mt-3 relative overflow-hidden rounded-lg border border-night-700 bg-slate-950 cursor-move select-none"
        style={{ width: preview.width, height: preview.height }}
        onClick={handleCanvasClick}
        onMouseDown={handleCanvasPan}
        onWheel={handleCanvasWheel}
      >
        <div
          className="relative"
          style={{
            width: preview.width,
            height: preview.height,
            overflow: "hidden",
          }}
        >
          <div
            className="absolute"
            style={{
              width: config.worldWidth * finalScale,
              height: config.worldHeight * finalScale,
              left: localPanX + (config.panX ?? 0),
              top: localPanY + (config.panY ?? 0),
              transformOrigin: "0 0",
              transform: `scale(${finalScale})`,
            }}
          >
            {Array.from({ length: Math.floor(config.worldWidth / GRID_SIZE) }).map((_, index) => (
              <div
                key={`v-${index}`}
                className="absolute top-0 h-full bg-slate-800/40"
                style={{ left: index * GRID_SIZE * finalScale, width: 1 }}
              />
            ))}
            {Array.from({ length: Math.floor(config.worldHeight / GRID_SIZE) }).map((_, index) => (
              <div
                key={`h-${index}`}
                className="absolute left-0 w-full bg-slate-800/40"
                style={{ top: index * GRID_SIZE * finalScale, height: 1 }}
              />
            ))}
            <div
              className="absolute border-2 border-slate-600"
              style={{
                left: config.wallMargin * finalScale,
                top: config.wallMargin * finalScale,
                width: (config.worldWidth - config.wallMargin * 2) * finalScale,
                height: (config.worldHeight - config.wallMargin * 2) * finalScale,
              }}
            />
            {config.obstacles.map((obstacle, index) => (
              <div
                key={`${obstacle.x}-${obstacle.y}-${index}`}
                className={`absolute border transition-all ${selectedIndex === index ? "border-cyan-300 shadow-lg shadow-cyan-500/50" : "border-slate-300/30"} bg-slate-500/80`}
                style={{
                  left: obstacle.x * finalScale,
                  top: obstacle.y * finalScale,
                  width: obstacle.width * finalScale,
                  height: obstacle.height * finalScale,
                  transform: `rotate(${obstacle.rotation ?? 0}deg)`,
                  transformOrigin: "center center",
                  cursor: "move",
                }}
                onMouseDown={(event) => beginDrag(event, index, "move")}
                onClick={(event) => {
                  event.stopPropagation();
                  setSelectedIndex(index);
                }}
              />
            ))}
            {config.obstacles.map((obstacle, index) => (
              <div
                key={`label-${index}`}
                className="absolute rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-slate-100 pointer-events-none"
                style={{
                  left: obstacle.x * finalScale,
                  top: obstacle.y * finalScale - 18,
                }}
              >
                #{index + 1} {Math.round(obstacle.width)}×{Math.round(obstacle.height)}
                {obstacle.rotation && obstacle.rotation !== 0 ? ` ∠${Math.round(obstacle.rotation)}°` : ""}
              </div>
            ))}
            {selectedIndex !== null && config.obstacles[selectedIndex] ? (
              <>
                <div
                  className="absolute w-3 h-3 cursor-se-resize rounded-sm border border-cyan-200 bg-cyan-400 hover:bg-cyan-300"
                  style={{
                    left: (config.obstacles[selectedIndex].x + config.obstacles[selectedIndex].width) * finalScale - 6,
                    top: (config.obstacles[selectedIndex].y + config.obstacles[selectedIndex].height) * finalScale - 6,
                  }}
                  onMouseDown={(event) => beginDrag(event, selectedIndex, "resize")}
                  title="Resize"
                />
                <div
                  className="absolute w-3.5 h-3.5 cursor-grab rounded-full border-2 border-yellow-300 bg-yellow-400/80 hover:bg-yellow-300 flex items-center justify-center"
                  style={{
                    left: (config.obstacles[selectedIndex].x + config.obstacles[selectedIndex].width / 2) * finalScale - 7,
                    top: (config.obstacles[selectedIndex].y - 12) * finalScale,
                  }}
                  onMouseDown={(event) => beginDrag(event, selectedIndex, "rotate")}
                  title="Rotate"
                />
              </>
            ) : null}
          </div>
        </div>

        {!config.enabled ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 backdrop-blur-sm">
            <div className="text-xs text-slate-400">Enable editor to interact</div>
            <div className="text-[10px] text-slate-500">Shift+Drag: Pan | Ctrl+Wheel: Zoom | Click: Place | Drag: Move | Yellow: Rotate</div>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          className="rounded border border-night-600 bg-night-900 px-3 py-1 text-xs text-slate-200 hover:bg-night-700"
          onClick={() => {
            const next = config.obstacles.slice(0, -1);
            setSelectedIndex(next.length ? Math.min(selectedIndex ?? 0, next.length - 1) : null);
            onChange({ ...config, obstacles: next });
          }}
        >
          ↶ Undo
        </button>
        <button
          className="rounded border border-night-600 bg-night-900 px-3 py-1 text-xs text-slate-200 hover:bg-night-700"
          onClick={() => {
            setSelectedIndex(null);
            onChange({ ...config, obstacles: [] });
          }}
        >
          Clear All
        </button>
        <span className="flex-1 text-xs text-slate-400">{config.obstacles.length} obstacle{config.obstacles.length !== 1 ? "s" : ""}</span>
        {selectedIndex !== null && (
          <button
            className="rounded border border-red-600/30 bg-red-600/10 px-3 py-1 text-xs text-red-300 hover:bg-red-600/20"
            onClick={() => {
              const next = config.obstacles.filter((_, i) => i !== selectedIndex);
              setSelectedIndex(next.length ? Math.min(selectedIndex, next.length - 1) : null);
              onChange({ ...config, obstacles: next });
            }}
          >
            Delete Selected
          </button>
        )}
      </div>

      {selectedIndex !== null && config.obstacles[selectedIndex] && (
        <div className="mt-3 rounded border border-night-600 bg-night-900 p-3 space-y-2">
          <div className="text-xs font-semibold text-slate-300">Obstacle #{selectedIndex + 1}</div>
          <div className="grid grid-cols-4 gap-2 text-[11px]">
            <label className="space-y-1">
              <span className="text-slate-400">X</span>
              <input
                type="number"
                className="w-full rounded border border-night-600 bg-night-800 px-2 py-1 text-slate-200"
                value={Math.round(config.obstacles[selectedIndex].x)}
                onChange={(event) => {
                  const obstacles = [...config.obstacles];
                  obstacles[selectedIndex].x = Number(event.target.value) || 0;
                  onChange({ ...config, obstacles });
                }}
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">Y</span>
              <input
                type="number"
                className="w-full rounded border border-night-600 bg-night-800 px-2 py-1 text-slate-200"
                value={Math.round(config.obstacles[selectedIndex].y)}
                onChange={(event) => {
                  const obstacles = [...config.obstacles];
                  obstacles[selectedIndex].y = Number(event.target.value) || 0;
                  onChange({ ...config, obstacles });
                }}
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">W</span>
              <input
                type="number"
                className="w-full rounded border border-night-600 bg-night-800 px-2 py-1 text-slate-200"
                value={Math.round(config.obstacles[selectedIndex].width)}
                onChange={(event) => {
                  const obstacles = [...config.obstacles];
                  obstacles[selectedIndex].width = Number(event.target.value) || 50;
                  onChange({ ...config, obstacles });
                }}
              />
            </label>
            <label className="space-y-1">
              <span className="text-slate-400">H</span>
              <input
                type="number"
                className="w-full rounded border border-night-600 bg-night-800 px-2 py-1 text-slate-200"
                value={Math.round(config.obstacles[selectedIndex].height)}
                onChange={(event) => {
                  const obstacles = [...config.obstacles];
                  obstacles[selectedIndex].height = Number(event.target.value) || 50;
                  onChange({ ...config, obstacles });
                }}
              />
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-xs text-slate-400">Rotation (°)</span>
            <div className="flex gap-2">
              <input
                type="range"
                className="flex-1"
                min={0}
                max={360}
                step={5}
                value={Math.round(config.obstacles[selectedIndex].rotation ?? 0)}
                onChange={(event) => {
                  const obstacles = [...config.obstacles];
                  obstacles[selectedIndex].rotation = Number(event.target.value) || 0;
                  onChange({ ...config, obstacles });
                }}
              />
              <span className="w-12 text-right text-[11px] text-slate-300">
                {Math.round(config.obstacles[selectedIndex].rotation ?? 0)}°
              </span>
            </div>
          </label>
        </div>
      )}

      <div className="mt-2 text-[10px] text-slate-500 space-y-1">
        <p>💡 <strong>Shift + Drag</strong> to pan | <strong>Ctrl + Scroll</strong> to zoom</p>
        <p>💡 <strong>Yellow handle</strong> rotates obstacle | <strong>Cyan corner</strong> resizes</p>
      </div>
    </section>
  );
};
