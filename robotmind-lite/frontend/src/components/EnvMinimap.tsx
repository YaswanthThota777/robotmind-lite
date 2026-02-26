/**
 * EnvMinimap — tiny SVG preview of an environment's world layout.
 * Shows walls (border), obstacles (rectangles), and goal (circle).
 */
import type { WorldSummary } from "../types";

interface EnvMinimapProps {
  world: WorldSummary;
  /** Rendered size in pixels (square-ish). Default 80. */
  size?: number;
  className?: string;
}

export const EnvMinimap = ({ world, size = 80, className = "" }: EnvMinimapProps) => {
  const PAD = 2;
  const svgW = size;
  const svgH = Math.round(size * (world.height / world.width));
  const scaleX = (svgW - PAD * 2) / world.width;
  const scaleY = (svgH - PAD * 2) / world.height;

  const sx = (x: number) => PAD + x * scaleX;
  const sy = (y: number) => PAD + y * scaleY;
  const sw = (w: number) => w * scaleX;
  const sh = (h: number) => h * scaleY;

  return (
    <svg
      width={svgW}
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      className={className}
      style={{ display: "block", flexShrink: 0 }}
    >
      {/* Background */}
      <rect x={0} y={0} width={svgW} height={svgH} fill="#0f172a" rx={3} />

      {/* Border wall */}
      <rect
        x={PAD} y={PAD}
        width={svgW - PAD * 2} height={svgH - PAD * 2}
        fill="none" stroke="#334155" strokeWidth={1}
      />

      {/* Obstacles */}
      {world.obstacles.map((obs, i) => (
        <rect
          key={i}
          x={sx(obs.x)} y={sy(obs.y)}
          width={Math.max(1, sw(obs.width))}
          height={Math.max(1, sh(obs.height))}
          fill="#1e3a5f"
          rx={0.5}
        />
      ))}

      {/* Goal */}
      {world.goal && (
        <>
          <circle
            cx={sx(world.goal.x)}
            cy={sy(world.goal.y)}
            r={Math.max(2.5, world.goal.radius * Math.min(scaleX, scaleY))}
            fill="none"
            stroke="#f59e0b"
            strokeWidth={1.2}
            opacity={0.9}
          />
          <circle
            cx={sx(world.goal.x)}
            cy={sy(world.goal.y)}
            r={Math.max(1, world.goal.radius * Math.min(scaleX, scaleY) * 0.45)}
            fill="#f59e0b"
            opacity={0.85}
          />
        </>
      )}
    </svg>
  );
};
