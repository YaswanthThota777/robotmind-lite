from __future__ import annotations

import argparse

from rl.evaluate import evaluate
from rl.trainer import train


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="RobotMind Lite - Phase 1 Trainer")
    parser.add_argument("--robot", choices=["diff", "ackermann", "rover"], default="diff")
    parser.add_argument("--env", choices=["arena", "obstacle", "maze", "goal"], default="arena")
    parser.add_argument("--steps", type=int, default=50000)
    parser.add_argument("--model", type=str, default="models/ppo_robot")
    parser.add_argument("--eval", action="store_true", help="Evaluate a saved model")
    parser.add_argument("--episodes", type=int, default=5)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.eval:
        evaluate(args.robot, args.env, args.model, episodes=args.episodes)
    else:
        train(args.robot, args.env, steps=args.steps, model_path=args.model)


if __name__ == "__main__":
    main()
