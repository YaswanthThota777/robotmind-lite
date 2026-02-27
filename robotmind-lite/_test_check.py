from backend.simulation.gym_env import RobotEnv, CurriculumRobotEnv
from backend.simulation.presets import ENVIRONMENT_PROFILES
import statistics

print("=== ENVIRONMENT CHECKS ===")
for k in ["arena_basic", "arena_improved", "curriculum_v1", "real_world_transfer_v1"]:
    cfg = ENVIRONMENT_PROFILES[k]
    d = cfg["dynamics"]
    w = cfg["world"]
    s = cfg["sensor"]
    env_class = cfg["metadata"].get("env_class", "standard")
    print(f"  {k}: goal={'goal' in w} spawn={d.get('randomize_spawn')} goal_rand={d.get('randomize_goal')} noise={d.get('sensor_noise_std')} rays={s['ray_count']} fov={s['ray_fov_degrees']} class={env_class}")

print()
print("=== HEADING RANDOMIZATION ===")
env = RobotEnv(profile="arena_basic")
real_headings = []
for _ in range(30):
    env.reset()
    real_headings.append(env.world.robot.angle_degrees)
print(f"  Heading std over 30 resets: {statistics.stdev(real_headings):.1f} degrees (need >> 0)")

print()
print("=== CURRICULUM LAYOUT DIVERSITY ===")
cenv = CurriculumRobotEnv(profile="curriculum_v1")
layouts_seen = set()
for _ in range(40):
    cenv.reset()
    key = tuple(sorted(str(o) for o in cenv.world.obstacles))
    layouts_seen.add(key)
print(f"  Distinct layouts in 40 resets: {len(layouts_seen)} (expected 4)")

print()
print("=== FULL EPISODE TEST ===")
cenv2 = CurriculumRobotEnv(profile="curriculum_v1")
cenv2.reset()
total_reward = 0.0
collisions = 0
goal_reached = 0
for step in range(200):
    action = cenv2.action_space.sample()
    obs, rew, term, trunc, info = cenv2.step(action)
    total_reward += rew
    if info.get("collision"):
        collisions += 1
    if info.get("goal_reached"):
        goal_reached += 1
    if term or trunc:
        cenv2.reset()
print(f"  200 steps: reward={total_reward:.2f} collisions={collisions} goals={goal_reached} episodes={cenv2.episode_count}")

print()
print("ALL OK")
