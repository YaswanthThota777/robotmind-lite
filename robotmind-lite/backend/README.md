# RobotMind Lite App (MVP)

FastAPI app for beginner robotics RL training with a custom Gymnasium environment, Pymunk physics, and a built-in browser interface.

## Prerequisites

- Python 3.11+
- pip

## Setup

```bash
cd robotmind-lite/backend
python -m venv .venv
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Run App

```bash
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

- Web interface: `http://127.0.0.1:8000/`
- Swagger API docs: `http://127.0.0.1:8000/docs`

## Web App flow

1. Open `/`
2. Click **Check Health**
3. Click **Create Environment**
4. Enter training steps and click **Start Training**
5. Monitor progress in **Status**
6. Download `.zip` or `.onnx` artifacts

## API test commands (optional)

### Health

```bash
curl http://127.0.0.1:8000/health
```

### Create simulation environment

```bash
curl -X POST http://127.0.0.1:8000/environment/create
```

### Start training

```bash
curl -X POST http://127.0.0.1:8000/start-training \
  -H "Content-Type: application/json" \
  -d '{"steps": 5000}'
```

### Poll training status

```bash
curl http://127.0.0.1:8000/training-status
```

### Download model (.zip)

```bash
curl -L "http://127.0.0.1:8000/download-model?format=zip" --output model.zip
```

### Download ONNX

```bash
curl -L "http://127.0.0.1:8000/download-model?format=onnx" --output model.onnx
```

## Notes

- Models are saved in `backend/models/`
- SQLite DB is `backend/robotmind_lite.db`
- TODO markers in code indicate scaling points for multi-run orchestration and richer metrics
