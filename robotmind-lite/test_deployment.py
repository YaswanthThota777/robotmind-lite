#!/usr/bin/env python3
import requests
import time
time.sleep(3)
resp = requests.get('http://127.0.0.1:8000/training-status/29')
data = resp.json()
print(f'Run 29 Status: {data.get("status")}')
print(f'Progress: {data.get("progress", 0)*100:.0f} %')
print(f'Deployment Ready: {data.get("deployment_ready")}')
print(f'Completed Steps: {data.get("completed_steps")} / {data.get("total_steps")}')
if data.get('deployment_ready'):
    print("\nZoom/Pan/Rotation/Presets: INTEGRATION SUCCESS")
