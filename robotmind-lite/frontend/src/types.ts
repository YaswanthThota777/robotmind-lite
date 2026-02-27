// ── App navigation ─────────────────────────────────────────────────────────
export type AppPage = "home" | "wizard" | "training";

// ── Robot designer types ────────────────────────────────────────────────────
export type RobotShape =
  | "circle"
  | "rectangle"
  | "square"
  | "hexagon"
  | "triangle"
  | "oval"
  | "pentagon"
  | "tracked";

export type MovementType =
  | "differential"
  | "ackermann"
  | "rover"
  | "omni"
  | "mecanum"
  | "drone"
  | "legged_quad"
  | "legged_biped"
  | "tracked"
  | "unicycle";

export type SensorPlacement =
  | "front"
  | "front_sides"
  | "front_rear"
  | "sides"
  | "360"
  | "custom";

export type SensorConfig = {
  count: number;       // 1 – 24 ray sensors
  range: number;       // px (maps to ray_length)
  fov: number;         // total FOV degrees
  placement: SensorPlacement;
};

export type RobotDesign = {
  name: string;
  shape: RobotShape;
  movementType: MovementType;
  size: number;         // radius px
  speed: number;        // px/s
  turnRate: number;     // degrees/step
  color: string;
  sensors: SensorConfig;
};

// ── Project ─────────────────────────────────────────────────────────────────
export type ProjectStatus = "draft" | "training" | "trained";

export type Project = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  status: ProjectStatus;
  robot: RobotDesign;
  environmentProfile: string;
  algorithm: string;
  modelProfile: string;
  steps: number;
  memoryMode?: string;
  goalRandomize?: boolean;
  customEnvironmentJson?: string;
};

// ── Training metric ─────────────────────────────────────────────────────────
export type TrainingMetric = {
  episode: number;
  reward: number;
  loss: number;
  completed_steps?: number;
  total_steps?: number;
  progress?: number;
};

export type WorldSummary = {
  width: number;
  height: number;
  obstacles: { x: number; y: number; width: number; height: number }[];
  goal: { x: number; y: number; radius: number } | null;
  has_goal: boolean;
};

export type ProfileOption = {
  key: string;
  label: string;
  description: string;
  world_summary?: WorldSummary;
};

export type TrainingConfig = {
  steps: number;
  algorithm: string;
  environmentProfile: string;
  modelProfile: string;
  memoryMode?: string;
  goalRandomize?: boolean;
  templateKey?: string;
};

export type TrainingTemplate = {
  key: string;
  label: string;
  description: string;
};

export type ScenarioBuilderConfig = {
  enabled: boolean;
  sensorNoiseStd: number;
  headingDriftStd: number;
  speedNoiseStd: number;
  turnNoiseStd: number;
  randomizeSpawn: boolean;
  speedScaleMin: number;
  speedScaleMax: number;
  turnScaleMin: number;
  turnScaleMax: number;
};

export type MapObstacle = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
};

export type ScenarioMapConfig = {
  enabled: boolean;
  worldWidth: number;
  worldHeight: number;
  wallMargin: number;
  defaultObstacleWidth: number;
  defaultObstacleHeight: number;
  obstacles: MapObstacle[];
  zoom: number;
  panX: number;
  panY: number;
};

export type MapPreset = {
  name: string;
  description?: string;
  config: ScenarioMapConfig;
};

export type TrainingStatus = {
  runId?: number;
  trainingState?: string;
  episode: number;
  reward: number;
  loss: number;
  completedSteps?: number;
  totalSteps?: number;
  progress?: number;
  deploymentReady?: boolean;
  deploymentBundlePath?: string | null;
};

export type SensorValue = {
  index: number;
  distance: number;   // normalized [0, 1]; 1.0 = nothing detected within range
  angle?: number;     // robot-relative angle in degrees (0=front, 90=right)
  label?: string;     // e.g. "Front", "Right", "Rear-Left"
};

export type SimulationVisual = {
  bg?: string;
  wall?: string;
  obstacle?: string;
  robot?: string;
  robot_collision?: string;
  ray?: string;
  goal?: string;
};

export type SimulationState = {
  x?: number;
  y?: number;
  angle?: number;
  sensor_distances?: number[];
  world_width?: number;
  world_height?: number;
  wall_margin?: number;
  robot_radius?: number;
  obstacles?: Array<{ x: number; y: number; width: number; height: number }>;
  visual?: SimulationVisual;
  flat_ground_model?: string;
  collision?: boolean;
  reward?: number;
  episode_count?: number;
  rays?: number[];
  ray_count?: number;
  ray_length?: number;
  ray_fov_degrees?: number;
  /** Present when backend uses fixed-angle sensors instead of FOV fan mode.
   *  Each value is the absolute world-space angle of that sensor in degrees. */
  sensor_angles_abs?: number[] | null;
  /** Human-readable label for each fixed-angle sensor (matches sensor_angles_abs by index). */
  sensor_angle_labels?: string[] | null;
  goal_x?: number | null;
  goal_y?: number | null;
  goal_radius?: number | null;
};

