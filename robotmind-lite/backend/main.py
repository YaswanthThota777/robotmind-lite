"""FastAPI app entrypoint for RobotMind Lite backend."""

from __future__ import annotations

from contextlib import asynccontextmanager
import asyncio
from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from fastapi.websockets import WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.api.environment import router as environment_router, live_env_manager
from backend.api.health import router as health_router
from backend.api.training import router as training_router
from backend.config import settings
from backend.database import init_db
from backend.ws import training_stream, environment_stream


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Application startup/shutdown lifecycle."""
    init_db()
    training_stream.set_loop(asyncio.get_running_loop())
    environment_stream.set_loop(asyncio.get_running_loop())
    environment_stream.set_state_provider(live_env_manager.auto_step)
    broadcaster_task = asyncio.create_task(training_stream.run())
    env_task = asyncio.create_task(environment_stream.run())
    yield
    broadcaster_task.cancel()
    env_task.cancel()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(training_router)
app.include_router(environment_router)


@app.get("/")
async def root() -> JSONResponse:
    """Root API response."""
    return JSONResponse({"message": "RobotMind Lite API"})


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    """Return empty favicon response to avoid browser 404 noise."""
    return Response(status_code=204)


@app.websocket("/ws/training")
async def training_ws(websocket: WebSocket) -> None:
    """WebSocket stream for training metrics."""
    await training_stream.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        training_stream.disconnect(websocket)


@app.websocket("/ws/environment")
async def environment_ws(websocket: WebSocket) -> None:
    """WebSocket stream for live environment state."""
    await environment_stream.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        environment_stream.disconnect(websocket)
