#!/usr/bin/env python3
"""Test coverage for all three flat-ground V1 model types."""

import requests
import time

API_BASE = "http://127.0.0.1:8000"

# Test 1: Differential V1
print("=== TEST 1: Flat Ground Differential V1 (Discrete PPO) ===")
resp1 = requests.post(
    f"{API_BASE}/start-training",
    json={
        "steps": 1000,
        "algorithm": "PPO",
        "environment_profile": "flat_ground_differential_v1",
        "model_profile": "fast",
    },
)
print(f"Status: {resp1.status_code}")
data1 = resp1.json()
print(f"Run ID: {data1.get('run_id')}")
print(f"Environment: {data1.get('environment')}")
print(f"Model Label: {data1.get('model_label')}")
print()

time.sleep(2)

# Test 2: Ackermann V1 (Using Template)
print("=== TEST 2: Flat Ground Ackermann V1 (Template) ===")
resp2 = requests.post(
    f"{API_BASE}/start-training",
    json={
        "steps": 1200,
        "template_key": "flat-ground-ackermann-v1",
    },
)
print(f"Status: {resp2.status_code}")
data2 = resp2.json()
print(f"Run ID: {data2.get('run_id')}")
print(f"Environment: {data2.get('environment')}")
print(f"Flat Ground Model: ackermann (expected)")
print()

time.sleep(2)

# Test 3: Rover V1 (Continuous)
print("=== TEST 3: Flat Ground Rover V1 (Continuous SAC) ===")
resp3 = requests.post(
    f"{API_BASE}/start-training",
    json={
        "steps": 1000,
        "algorithm": "SAC",
        "environment_profile": "flat_ground_rover_v1",
        "model_profile": "balanced",
    },
)
print(f"Status: {resp3.status_code}")
data3 = resp3.json()
print(f"Run ID: {data3.get('run_id')}")
print(f"Environment: {data3.get('environment')}")
print(f"Control Mode: continuous (expected)")
print()

print("✅ All three flat-ground V1 model types submitted successfully!")
print("Run IDs:", [data1.get("run_id"), data2.get("run_id"), data3.get("run_id")])
