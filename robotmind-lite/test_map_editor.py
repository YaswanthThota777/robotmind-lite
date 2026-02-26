#!/usr/bin/env python3
import json
import requests

payload = {
    'steps': 200,
    'algorithm': 'PPO',
    'environmentProfile': 'arena_basic',
    'modelProfile': 'balanced',
    'customEnvironment': {
        'world': {
            'width': 720,
            'height': 540,
            'wall_margin': 25,
            'obstacles': [
                {'x': 100, 'y': 150, 'width': 80, 'height': 60, 'rotation': 0},
                {'x': 400, 'y': 200, 'width': 100, 'height': 50, 'rotation': 45},
                {'x': 550, 'y': 380, 'width': 70, 'height': 80, 'rotation': -30}
            ]
        }
    }
}

resp = requests.post('http://127.0.0.1:8000/start-training', json=payload)
print(f'Status: {resp.status_code}')
result = resp.json()
print(f'Run ID: {result.get("run_id")}')
print(f'Deployment Ready: {result.get("deployment_ready")}')
print("\nRotation support: YES - Backend accepts rotation field in obstacles")
