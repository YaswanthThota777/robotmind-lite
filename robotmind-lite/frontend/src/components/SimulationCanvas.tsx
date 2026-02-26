import { useEffect, useRef, useState } from "react";
import type { SensorValue, SimulationState, SimulationVisual } from "../types";

const canvasSize = { width: 800, height: 500 };
const wallPadding = 40;

const obstacles = [
  { x: 220, y: 140, width: 140, height: 30 },
  { x: 520, y: 240, width: 60, height: 160 },
  { x: 160, y: 360, width: 180, height: 40 },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const raySegmentIntersection = (
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
) => {
  const rPx = originX;
  const rPy = originY;
  const rDx = dirX;
  const rDy = dirY;
  const sPx = x1;
  const sPy = y1;
  const sDx = x2 - x1;
  const sDy = y2 - y1;

  const rMag = Math.hypot(rDx, rDy);
  const sMag = Math.hypot(sDx, sDy);
  if (rMag === 0 || sMag === 0) return null;

  const rDxNorm = rDx / rMag;
  const rDyNorm = rDy / rMag;

  const rxs = rDxNorm * sDy - rDyNorm * sDx;
  if (Math.abs(rxs) < 0.0001) return null;

  const t = ((sPx - rPx) * sDy - (sPy - rPy) * sDx) / rxs;
  const u = ((sPx - rPx) * rDyNorm - (sPy - rPy) * rDxNorm) / rxs;

  if (t >= 0 && u >= 0 && u <= 1) {
    return t;
  }
  return null;
};

const buildSegments = () => {
  const segments: Array<[number, number, number, number]> = [];

  segments.push([wallPadding, wallPadding, canvasSize.width - wallPadding, wallPadding]);
  segments.push([canvasSize.width - wallPadding, wallPadding, canvasSize.width - wallPadding, canvasSize.height - wallPadding]);
  segments.push([canvasSize.width - wallPadding, canvasSize.height - wallPadding, wallPadding, canvasSize.height - wallPadding]);
  segments.push([wallPadding, canvasSize.height - wallPadding, wallPadding, wallPadding]);

  obstacles.forEach((obs) => {
    segments.push([obs.x, obs.y, obs.x + obs.width, obs.y]);
    segments.push([obs.x + obs.width, obs.y, obs.x + obs.width, obs.y + obs.height]);
    segments.push([obs.x + obs.width, obs.y + obs.height, obs.x, obs.y + obs.height]);
    segments.push([obs.x, obs.y + obs.height, obs.x, obs.y]);
  });

  return segments;
};

const segments = buildSegments();

type SimulationCanvasProps = {
  onSensors: (values: SensorValue[]) => void;
  apiBase: string;
  environmentProfile: string;
  isTrainingActive?: boolean;
  trainingEpisode?: number;
  trainingReward?: number;
  isTestMode?: boolean;
  testState?: SimulationState;
  /** When provided, overrides the backend values to match the designed robot */
  projectRobot?: {
    shape: string;
    color: string;
    sensorCount?: number;
    sensorFov?: number;      // degrees, e.g. 90
    sensorRange?: number;    // world units
    sensorPlacement?: string; // "front" | "360" | "rear" | "sides" | etc.
  };
};

export const SimulationCanvas = ({
  onSensors,
  apiBase,
  environmentProfile,
  isTrainingActive = true,
  trainingEpisode,
  trainingReward,
  projectRobot,
  isTestMode = false,
  testState,
}: SimulationCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number>(0);
  const [status, setStatus] = useState("running");
  const [episodeReward, setEpisodeReward] = useState(0);
  const [episodeCount, setEpisodeCount] = useState(0);
  const [collisionFeedback, setCollisionFeedback] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(15000);
  const backendStateRef = useRef<SimulationState | null>(null);
  const backendActiveRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  // Ref so WS closure always reads current training state without stale captures
  const isTrainingActiveRef = useRef(isTrainingActive);
  useEffect(() => { isTrainingActiveRef.current = isTrainingActive; }, [isTrainingActive]);
  const isTestModeRef = useRef(isTestMode);
  useEffect(() => { isTestModeRef.current = isTestMode; }, [isTestMode]);

  const robot = useRef({
    x: canvasSize.width / 2,
    y: canvasSize.height / 2,
    radius: 18,
    angle: 0,
    speed: 1.8,
    rotation: 0.015,
  });

  const sensors = useRef<number[]>(
    Array.from({ length: projectRobot?.sensorCount ?? 8 }, () => 1)
  );

  // Resize sensors array when projectRobot.sensorCount changes
  useEffect(() => {
    const n = projectRobot?.sensorCount ?? 8;
    if (sensors.current.length !== n) {
      sensors.current = Array.from({ length: n }, () => 1);
    }
  }, [projectRobot?.sensorCount]);

  // Connect to training WebSocket — also receives env_state to show real training env on canvas
  useEffect(() => {
    const trainingWsUrl = apiBase.replace("http", "ws") + "/ws/training";
    let unmountedTraining = false;
    const trainingSocket = new WebSocket(trainingWsUrl);
    trainingSocket.onopen = () => { if (unmountedTraining) trainingSocket.close(); };

    trainingSocket.onmessage = (event) => {
      try {
        if (unmountedTraining || isTestModeRef.current) return;
        const data = JSON.parse(event.data);
        if (data.completed_steps !== undefined && data.total_steps !== undefined) {
          setCurrentStep(data.completed_steps);
          setTotalSteps(data.total_steps);
          setTrainingProgress((data.completed_steps / data.total_steps) * 100);
        }
        if (data.episode !== undefined) setEpisodeCount(data.episode);
        if (data.reward !== undefined) setEpisodeReward(data.reward);

        // When training is active, use the REAL training env state on the canvas.
        // This overrides the /ws/environment preview so canvas always matches the
        // environment profile the model is actually being trained in.
        if (data.env_state && Object.keys(data.env_state).length > 0) {
          const es = data.env_state;
          backendStateRef.current = {
            x: es.x,
            y: es.y,
            angle: es.angle,
            sensor_distances: es.sensor_distances ?? es.rays,
            world_width: es.world_width,
            world_height: es.world_height,
            wall_margin: es.wall_margin,
            robot_radius: es.robot_radius,
            obstacles: es.obstacles,
            visual: es.visual,
            flat_ground_model: es.flat_ground_model,
            collision: es.collision,
            reward: es.reward,
            episode_count: es.episode_count,
            rays: es.rays,
            ray_count: es.ray_count,
            ray_length: es.ray_length,
            ray_fov_degrees: es.ray_fov_degrees,
            goal_x: es.goal_x ?? null,
            goal_y: es.goal_y ?? null,
            goal_radius: es.goal_radius ?? null,
          };
          backendActiveRef.current = true;
          if (es.sensor_distances || es.rays) {
            const rays: number[] = es.sensor_distances ?? es.rays;
            onSensors(rays.map((value: number, index: number) => ({
              index,
              distance: Number(value.toFixed(2)),
            })));
          }
        }
      } catch {
        // Ignore parsing errors
      }
    };

    return () => {
      unmountedTraining = true;
      if (trainingSocket.readyState !== WebSocket.CLOSED) trainingSocket.close();
    };
  }, [apiBase, onSensors]);

  useEffect(() => {
    let lastTime = performance.now();
    let unmountedEnv = false;

    const wsUrl = apiBase.replace("http", "ws") + "/ws/environment";
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    socket.onopen = () => { if (unmountedEnv) socket.close(); };

    socket.onmessage = (event) => {
      try {
        if (unmountedEnv || isTestModeRef.current) return;
        const payload = JSON.parse(event.data);
        const state: SimulationState = {
          x: payload.x,
          y: payload.y,
          angle: payload.angle,
          sensor_distances: payload.sensor_distances ?? payload.rays,
          world_width: payload.world_width,
          world_height: payload.world_height,
          wall_margin: payload.wall_margin,
          robot_radius: payload.robot_radius,
          obstacles: payload.obstacles,
          visual: payload.visual,
          flat_ground_model: payload.flat_ground_model,
          collision: payload.collision,
          reward: payload.reward,
          episode_count: payload.episode_count,
          rays: payload.rays,
          ray_count: payload.ray_count,
          ray_length: payload.ray_length,
          ray_fov_degrees: payload.ray_fov_degrees,
        };
        // During active training, the training WS (env_state) is the source of truth.
        // Skip updating backendStateRef from the 60fps preview stream to prevent
        // it from overwriting the real training env state with preview env state.
        if (!isTrainingActiveRef.current) {
          backendStateRef.current = state;
          backendActiveRef.current = true;
        } else {
          return;
        }

        if (state.collision) {
          setCollisionFeedback(true);
          setTimeout(() => setCollisionFeedback(false), 300);
        }
        if (state.reward !== undefined) {
          setEpisodeReward(state.reward);
        }
        if (state.episode_count !== undefined) {
          setEpisodeCount(state.episode_count);
        }

        if (state.sensor_distances) {
          onSensors(
            state.sensor_distances.map((value: number, index: number) => ({
              index,
              distance: Number(value.toFixed(2)),
            }))
          );
        }
      } catch {
        backendActiveRef.current = false;
      }
    };

    socket.onerror = () => {
      backendActiveRef.current = false;
    };

    socket.onclose = () => {
      backendActiveRef.current = false;
    };

    const animate = (time: number) => {
      const delta = time - lastTime;
      lastTime = time;

      if (isTestModeRef.current) {
        // Test playback mode renders provided frames only.
        renderFrame();
      } else if (backendActiveRef.current) {
        // Backend is streaming live env data — render it directly
        renderFrame();
      } else if (isTrainingActiveRef.current) {
        // Training started but backend WS not yet streaming — hold a static frame, no local demo
        renderFrame();
      } else {
        // Completely idle (no training, no backend) — local demo so canvas isn't blank
        updateRobot(delta);
        updateSensors();
        renderFrame();
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      unmountedEnv = true;
      if (socket.readyState !== WebSocket.CLOSED) socket.close();
      cancelAnimationFrame(frameRef.current);
    };
  }, [apiBase, onSensors]);

  useEffect(() => {
    if (!isTrainingActive) {
      // Training stopped — let /ws/environment (preview env) take over canvas again
      setStatus("idle");
    } else {
      setStatus("waiting");
    }
  }, [isTrainingActive]);

  useEffect(() => {
    // Clear stale environment state so the new profile renders cleanly.
    backendStateRef.current = null;
    backendActiveRef.current = false;
    setEpisodeCount(0);
    setEpisodeReward(0);
  }, [environmentProfile]);

  useEffect(() => {
    const distances = testState?.sensor_distances ?? testState?.rays;
    if (!distances) return;
    onSensors(
      distances.map((value, index) => ({
        index,
        distance: Number(value.toFixed(2)),
      }))
    );
  }, [testState, onSensors]);

  const updateRobot = (delta: number) => {
    const entity = robot.current;
    entity.angle += entity.rotation * (delta / 16.6);
    const nextX = entity.x + Math.cos(entity.angle) * entity.speed;
    const nextY = entity.y + Math.sin(entity.angle) * entity.speed;

    const collision = detectCollision(nextX, nextY, entity.radius);
    if (collision) {
      entity.rotation = -entity.rotation;
      entity.angle += Math.PI / 4;
      setStatus("collision");
    } else {
      entity.x = nextX;
      entity.y = nextY;
      setStatus("running");
    }
  };

  const detectCollision = (x: number, y: number, radius: number) => {
    if (
      x - radius < wallPadding ||
      x + radius > canvasSize.width - wallPadding ||
      y - radius < wallPadding ||
      y + radius > canvasSize.height - wallPadding
    ) {
      return true;
    }

    return obstacles.some((obs) => {
      const closestX = clamp(x, obs.x, obs.x + obs.width);
      const closestY = clamp(y, obs.y, obs.y + obs.height);
      const dx = x - closestX;
      const dy = y - closestY;
      return dx * dx + dy * dy < radius * radius;
    });
  };

  // Compute ray start angles from FOV + placement config
  // fovOverride/placementOverride from backend take precedence when streaming
  const getRayAngles = (
    entityAngle: number,
    count: number,
    fovOverride?: number,
    placementOverride?: string,
  ): number[] => {
    const fovDeg  = fovOverride  ?? projectRobot?.sensorFov ?? 360;
    const place   = placementOverride ?? projectRobot?.sensorPlacement ?? "360";
    const fovRad  = (fovDeg * Math.PI) / 180;

    // Base heading offset by placement
    let baseOffset = 0;
    if (place === "rear") baseOffset = Math.PI;
    else if (place === "sides") baseOffset = Math.PI / 2;
    // front / front_sides / 360 / all_around → 0

    const is360 = fovDeg >= 355 || place === "360" || place === "all_around";
    if (is360) {
      return Array.from({ length: count }, (_, i) =>
        entityAngle + (Math.PI * 2 * i) / count
      );
    }
    // Distribute evenly over FOV, centered on (entityAngle + baseOffset)
    const halfFov = fovRad / 2;
    return Array.from({ length: count }, (_, i) => {
      const t = count === 1 ? 0.5 : i / (count - 1);
      return entityAngle + baseOffset - halfFov + fovRad * t;
    });
  };

  const updateSensors = () => {
    const entity   = robot.current;
    const rayCount = sensors.current.length;
    const rayLen   = projectRobot?.sensorRange ?? 220; // world units (60-300)
    const angles   = getRayAngles(entity.angle, rayCount);

    sensors.current = sensors.current.map((_, index) => {
      const angle = angles[index];
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);

      let minDistance = rayLen;
      segments.forEach((segment) => {
        const [x1, y1, x2, y2] = segment;
        const distance = raySegmentIntersection(entity.x, entity.y, dirX, dirY, x1, y1, x2, y2);
        if (distance !== null) {
          minDistance = Math.min(minDistance, distance);
        }
      });

      return minDistance / rayLen;
    });

    onSensors(
      sensors.current.map((value, index) => ({
        index,
        distance: Number(value.toFixed(2)),
      }))
    );
  };

  const renderFrame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const backendState = testState ?? backendStateRef.current ?? null;

    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    const visual = backendState?.visual;
    
    // Enhanced background with gradient
    const bgGradient = ctx.createLinearGradient(0, 0, canvasSize.width, canvasSize.height);
    bgGradient.addColorStop(0, visual?.bg ?? "#0f172a");
    bgGradient.addColorStop(1, "#1e293b");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    const worldWidth = backendState?.world_width ?? canvasSize.width;
    const worldHeight = backendState?.world_height ?? canvasSize.height;
    const margin = backendState?.wall_margin ?? wallPadding;
    const scale = Math.min(canvasSize.width / worldWidth, canvasSize.height / worldHeight);

    // Enhanced walls with shadow
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = visual?.wall ?? "#334155";
    ctx.lineWidth = 4;
    ctx.strokeRect(
      margin * scale,
      margin * scale,
      (worldWidth - margin * 2) * scale,
      (worldHeight - margin * 2) * scale
    );
    ctx.shadowBlur = 0;

    // Enhanced obstacles with gradient and shadow
    const renderObstacles = backendState?.obstacles ?? obstacles;
    renderObstacles.forEach((obs) => {
      const obsGradient = ctx.createLinearGradient(
        obs.x * scale, 
        obs.y * scale, 
        (obs.x + obs.width) * scale, 
        (obs.y + obs.height) * scale
      );
      obsGradient.addColorStop(0, visual?.obstacle ?? "#475569");
      obsGradient.addColorStop(1, "#1e293b");
      ctx.fillStyle = obsGradient;
      ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
      ctx.shadowBlur = 8;
      ctx.fillRect(obs.x * scale, obs.y * scale, obs.width * scale, obs.height * scale);
      
      // Add border to obstacles
      ctx.shadowBlur = 0;
      ctx.strokeStyle = visual?.wall ?? "#64748b";
      ctx.lineWidth = 2;
      ctx.strokeRect(obs.x * scale, obs.y * scale, obs.width * scale, obs.height * scale);
    });

    // ── Goal target rendering ─────────────────────────────────────────────
    const goalX = backendState?.goal_x;
    const goalY = backendState?.goal_y;
    const goalR = backendState?.goal_radius;
    if (goalX != null && goalY != null) {
      const gr = (goalR ?? 18) * scale;
      const gColor = visual?.goal ?? "#f59e0b";
      // Outer glow
      const goalGlow = ctx.createRadialGradient(
        goalX * scale, goalY * scale, 0,
        goalX * scale, goalY * scale, gr * 2.2
      );
      goalGlow.addColorStop(0, gColor + "88");
      goalGlow.addColorStop(1, "transparent");
      ctx.fillStyle = goalGlow;
      ctx.beginPath();
      ctx.arc(goalX * scale, goalY * scale, gr * 2.2, 0, Math.PI * 2);
      ctx.fill();
      // Body
      ctx.shadowColor = gColor;
      ctx.shadowBlur = 18;
      ctx.fillStyle = gColor + "cc";
      ctx.beginPath();
      ctx.arc(goalX * scale, goalY * scale, gr, 0, Math.PI * 2);
      ctx.fill();
      // Star ★
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${Math.round(gr * 1.2)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("★", goalX * scale, goalY * scale);
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
    }

    let entity = robot.current;
    let rayData = sensors.current;
    let modelType = "differential"; // default

    if (backendState) {
      entity = {
        ...entity,
        x: backendState.x ?? entity.x,
        y: backendState.y ?? entity.y,
        angle: (backendState.angle ?? 0) * (Math.PI / 180),
        radius: backendState.robot_radius ?? entity.radius,
      };
      rayData = backendState.sensor_distances ?? backendState.rays ?? rayData;
      modelType = backendState.flat_ground_model ?? "differential";
      setStatus("streaming");
    } else {
      updateSensors();
    }

    const rayDisplayLen = backendState?.ray_length ?? projectRobot?.sensorRange ?? 220; // world units
    const rayFov        = backendState?.ray_fov_degrees;
    const rayAngles     = getRayAngles(entity.angle, rayData.length, rayFov);
    rayData.forEach((distance, index) => {
      const angle = rayAngles[index];
      const endX = entity.x + Math.cos(angle) * distance * rayDisplayLen;
      const endY = entity.y + Math.sin(angle) * distance * rayDisplayLen;

      // Enhanced rays with gradient
      const rayGradient = ctx.createLinearGradient(
        entity.x * scale,
        entity.y * scale,
        endX * scale,
        endY * scale
      );
      rayGradient.addColorStop(0, visual?.ray ?? "rgba(56, 189, 248, 0.6)");
      rayGradient.addColorStop(1, "rgba(56, 189, 248, 0.1)");
      ctx.strokeStyle = rayGradient;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(entity.x * scale, entity.y * scale);
      ctx.lineTo(endX * scale, endY * scale);
      ctx.stroke();
      
      // Add endpoint glow
      ctx.fillStyle = visual?.ray ?? "rgba(56, 189, 248, 0.8)";
      ctx.shadowColor = visual?.ray ?? "#38bdf8";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(endX * scale, endY * scale, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // Enhanced robot with model-specific shape
    const isColliding = backendState?.collision ?? (status === "collision");
    // Use projectRobot color first, then backend visual, then default
    const robotColor = isColliding
      ? (visual?.robot_collision ?? "#ef4444")
      : (projectRobot?.color ?? visual?.robot ?? "#22c55e");
    
    ctx.shadowColor = robotColor;
    ctx.shadowBlur = isColliding ? 20 : 15;
    ctx.fillStyle = robotColor;

    // Shape priority: projectRobot.shape > modelType
    const drawShape = projectRobot?.shape ?? (modelType === "ackermann" ? "ackermann" : modelType === "rover" ? "rover" : "circle");

    const drawPolygon = (sides: number, radius: number) => {
      ctx.beginPath();
      for (let i = 0; i < sides; i++) {
        const a = entity.angle + (Math.PI * 2 * i) / sides - Math.PI / 2;
        const px = entity.x * scale + Math.cos(a) * radius;
        const py = entity.y * scale + Math.sin(a) * radius;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    };

    // Different shapes for different robot types
    if (drawShape === "circle" || drawShape === "differential") {
      // Circular robot with two wheel indicators
      ctx.beginPath();
      ctx.arc(entity.x * scale, entity.y * scale, entity.radius * scale, 0, Math.PI * 2);
      ctx.fill();
      
      // Wheel indicators
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      const wheelAngle = entity.angle + Math.PI / 2;
      [-1, 1].forEach(side => {
        ctx.beginPath();
        ctx.arc(
          (entity.x + Math.cos(wheelAngle) * entity.radius * 0.7 * side) * scale,
          (entity.y + Math.sin(wheelAngle) * entity.radius * 0.7 * side) * scale,
          entity.radius * 0.25 * scale,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });
    } else if (drawShape === "triangle") {
      drawPolygon(3, entity.radius * scale * 1.2);
    } else if (drawShape === "pentagon") {
      drawPolygon(5, entity.radius * scale);
    } else if (drawShape === "hexagon") {
      drawPolygon(6, entity.radius * scale);
    } else if (drawShape === "oval") {
      ctx.save();
      ctx.translate(entity.x * scale, entity.y * scale);
      ctx.rotate(entity.angle);
      ctx.scale(1.4, 0.85);
      ctx.beginPath();
      ctx.arc(0, 0, entity.radius * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (drawShape === "square") {
      ctx.save();
      ctx.translate(entity.x * scale, entity.y * scale);
      ctx.rotate(entity.angle);
      const sq = entity.radius * 1.6 * scale;
      ctx.fillRect(-sq / 2, -sq / 2, sq, sq);
      ctx.restore();
    } else if (drawShape === "tracked") {
      ctx.save();
      ctx.translate(entity.x * scale, entity.y * scale);
      ctx.rotate(entity.angle);
      const tw = entity.radius * 2.0 * scale;
      const th = entity.radius * 1.4 * scale;
      ctx.fillRect(-tw / 2, -th / 2, tw, th);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(-tw / 2, -th / 2, tw * 0.15, th);
      ctx.fillRect(tw / 2 - tw * 0.15, -th / 2, tw * 0.15, th);
      ctx.restore();
    } else if (drawShape === "rectangle") {
      ctx.save();
      ctx.translate(entity.x * scale, entity.y * scale);
      ctx.rotate(entity.angle);
      ctx.fillRect(-entity.radius * 1.8 * scale / 2, -entity.radius * 1.1 * scale / 2,
                   entity.radius * 1.8 * scale, entity.radius * 1.1 * scale);
      ctx.restore();
    } else if (drawShape === "ackermann") {
      // Rounded rectangle for car-like robot
      ctx.shadowBlur = 12;
      const carLength = entity.radius * 2.2;
      const carWidth = entity.radius * 1.4;
      ctx.save();
      ctx.translate(entity.x * scale, entity.y * scale);
      ctx.rotate(entity.angle);
      
      // Car body
      ctx.beginPath();
      const cornerRadius = entity.radius * 0.3 * scale;
      const x = -carLength * 0.5 * scale;
      const y = -carWidth * 0.5 * scale;
      const w = carLength * scale;
      const h = carWidth * scale;
      ctx.moveTo(x + cornerRadius, y);
      ctx.lineTo(x + w - cornerRadius, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + cornerRadius);
      ctx.lineTo(x + w, y + h - cornerRadius);
      ctx.quadraticCurveTo(x + w, y + h, x + w - cornerRadius, y + h);
      ctx.lineTo(x + cornerRadius, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - cornerRadius);
      ctx.lineTo(x, y + cornerRadius);
      ctx.quadraticCurveTo(x, y, x + cornerRadius, y);
      ctx.closePath();
      ctx.fill();
      
      // Front bumper highlight
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.fillRect(carLength * 0.35 * scale, -carWidth * 0.4 * scale, carLength * 0.15 * scale, carWidth * 0.8 * scale);
      
      ctx.restore();
    } else if (drawShape === "rover") {
      // Square/boxy design for rover
      ctx.shadowBlur = 12;
      const roverSize = entity.radius * 1.8;
      ctx.save();
      ctx.translate(entity.x * scale, entity.y * scale);
      ctx.rotate(entity.angle);
      
      // Main body
      ctx.fillRect(
        -roverSize * 0.5 * scale,
        -roverSize * 0.5 * scale,
        roverSize * scale,
        roverSize * scale
      );
      
      // Four corner "wheels"
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      const positions = [
        [-0.45, -0.45], [0.45, -0.45],
        [-0.45, 0.45], [0.45, 0.45]
      ];
      positions.forEach(([px, py]) => {
        ctx.fillRect(
          (px * roverSize - entity.radius * 0.15) * scale,
          (py * roverSize - entity.radius * 0.15) * scale,
          entity.radius * 0.3 * scale,
          entity.radius * 0.3 * scale
        );
      });
      
      ctx.restore();
    } else {
      // Default circular design
      ctx.beginPath();
      ctx.arc(entity.x * scale, entity.y * scale, entity.radius * scale, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Inner highlight for depth
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.beginPath();
    ctx.arc(
      (entity.x - entity.radius * 0.3) * scale, 
      (entity.y - entity.radius * 0.3) * scale, 
      entity.radius * 0.3 * scale, 
      0, 
      Math.PI * 2
    );
    ctx.fill();

    // Enhanced direction indicator
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#000000";
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(entity.x * scale, entity.y * scale);
    ctx.lineTo(
      (entity.x + Math.cos(entity.angle) * entity.radius * 2.2) * scale,
      (entity.y + Math.sin(entity.angle) * entity.radius * 2.2) * scale
    );
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Collision flash effect
    if (collisionFeedback) {
      ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
      ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
      ctx.strokeStyle = "rgba(239, 68, 68, 0.6)";
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, canvasSize.width - 6, canvasSize.height - 6);
    }
  };

  // Show placeholder overlay when there is nothing live to display
  const showIdlePlaceholder = !isTrainingActive && !isTestMode;

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-2xl border border-night-700 bg-gradient-to-br from-night-900 to-night-800 p-4 shadow-2xl relative">

        {/* ── Idle placeholder — covers canvas when no training / test is running ── */}
        {showIdlePlaceholder && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center
                          rounded-2xl bg-[#0c1220] gap-5 pointer-events-none select-none">
            {/* animated ring */}
            <div className="relative flex items-center justify-center">
              <div className="w-20 h-20 rounded-full border-2 border-dashed border-night-600
                              animate-spin [animation-duration:8s]" />
              <div className="absolute w-14 h-14 rounded-full border border-night-700
                              bg-gradient-to-br from-night-800 to-night-900
                              flex items-center justify-center text-2xl">
                🤖
              </div>
            </div>
            <div className="text-center px-8 space-y-1.5">
              <p className="text-sm font-semibold text-slate-300 leading-snug">
                Training simulation will appear here
              </p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Configure your environment, choose an algorithm,<br />
                then click <span className="text-cyan-400 font-medium">Start Training</span> to watch the agent learn.
              </p>
            </div>
            {/* subtle grid lines */}
            <div className="absolute inset-4 rounded-xl"
                 style={{ backgroundImage:
                   "linear-gradient(rgba(99,102,241,.04) 1px,transparent 1px)," +
                   "linear-gradient(90deg,rgba(99,102,241,.04) 1px,transparent 1px)",
                   backgroundSize: "40px 40px" }} />
          </div>
        )}

        {isTrainingActive && (
          <div className="absolute top-0 left-0 right-0 z-10">
            {/* Professional Training Header */}
            <div className="bg-gradient-to-b from-slate-900/95 via-slate-900/90 to-transparent backdrop-blur-md border-b border-slate-700/50">
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50"></div>
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Live Training</span>
                    </div>
                    <div className="h-4 w-px bg-slate-600"></div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">Episode</span>
                      <span className="text-sm font-bold text-emerald-400 tabular-nums">{trainingEpisode ?? episodeCount}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wide">Reward</span>
                      <span className={`text-sm font-bold tabular-nums ${
                        (trainingReward ?? episodeReward) > 0 ? 'text-emerald-400' : 
                        (trainingReward ?? episodeReward) < 0 ? 'text-red-400' : 'text-slate-400'
                      }`}>{(trainingReward ?? episodeReward) > 0 ? '+' : ''}{(trainingReward ?? episodeReward).toFixed(1)}</span>
                    </div>
                    <div className="h-8 w-px bg-slate-600"></div>
                    <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-slate-800/60 border border-slate-700/50">
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        (trainingEpisode ?? episodeCount) < 10 ? 'bg-amber-400' :
                        (trainingEpisode ?? episodeCount) < 50 ? 'bg-cyan-400' :
                        (trainingEpisode ?? episodeCount) < 100 ? 'bg-purple-400' : 'bg-emerald-400'
                      } shadow-lg`}></div>
                      <span className={`text-xs font-medium ${
                        (trainingEpisode ?? episodeCount) < 10 ? 'text-amber-300' :
                        (trainingEpisode ?? episodeCount) < 50 ? 'text-cyan-300' :
                        (trainingEpisode ?? episodeCount) < 100 ? 'text-purple-300' : 'text-emerald-300'
                      }`}>
                        {(trainingEpisode ?? episodeCount) < 10 ? 'Initializing' :
                         (trainingEpisode ?? episodeCount) < 50 ? 'Learning' :
                         (trainingEpisode ?? episodeCount) < 100 ? 'Converging' : 'Optimized'}
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Professional Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">Training Progress</span>
                    <span className="text-[10px] text-slate-400 tabular-nums">
                      {currentStep.toLocaleString()} / {totalSteps.toLocaleString()} steps
                    </span>
                  </div>
                  <div className="relative h-2 bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/50">
                    <div 
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-500 via-cyan-500 to-emerald-400 transition-all duration-300 ease-out"
                      style={{ width: `${trainingProgress}%` }}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">{trainingProgress.toFixed(1)}% Complete</span>
                    <span className="text-[10px] text-slate-500">
                      {trainingProgress < 100 ? `~${Math.ceil((100 - trainingProgress) / 2)}min remaining` : 'Complete'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="rounded-xl border border-night-600 shadow-inner"
        />
      </div>
      <div className="rounded-xl border border-slate-700/50 bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-sm">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-2 w-2 rounded-full shadow-lg ${
                status === 'streaming' ? 'bg-emerald-400 animate-pulse shadow-emerald-400/50' : 
                status === 'collision' ? 'bg-red-400 shadow-red-400/50' : 
                status === 'waiting' ? 'bg-amber-400 animate-pulse shadow-amber-400/50' :
                status === 'idle' ? 'bg-slate-600' :
                'bg-cyan-400 shadow-cyan-400/50'
              }`}></div>
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Status</span>
                <span className={`text-xs font-semibold ${
                  status === 'streaming' ? 'text-emerald-300' :
                  status === 'waiting' ? 'text-amber-300' :
                  status === 'idle' ? 'text-slate-400' :
                  'text-cyan-300'
                }`}>
                  {status === 'idle' ? 'Paused' : 
                   status === 'waiting' ? 'Initializing' :
                   status === 'streaming' ? 'Active Stream' :
                   status}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-slate-800/60 border border-slate-700/50">
              <div className={`w-1.5 h-1.5 rounded-full ${
                isTrainingActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
              }`}></div>
              <span className={`text-[10px] font-medium uppercase tracking-wide ${
                isTrainingActive ? 'text-emerald-300' : 'text-slate-500'
              }`}>
                {isTrainingActive ? 'Training' : 'Idle'}
              </span>
            </div>
          </div>
        </div>
        {environmentProfile.includes("v1") && (
          <div className="px-4 py-2.5">
            <div className="flex items-start gap-2">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mt-0.5">Scenarios</span>
              <span className="text-xs text-slate-400 leading-relaxed">
                {environmentProfile.includes("differential") && "Office • Warehouse • Corridors • Doorways"}
                {environmentProfile.includes("ackermann") && "Parking • Roads • Lane-keeping • Obstacle-course"}
                {environmentProfile.includes("rover") && "Warehouse Racks • Loading Docks • Tight Spaces"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
