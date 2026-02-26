"""WebSocket stream manager for training metrics."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import WebSocket


class TrainingStream:
    """Broadcasts training metrics to connected WebSocket clients."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    def enqueue(self, payload: dict[str, Any]) -> None:
        if self._loop is None:
            return
        self._loop.call_soon_threadsafe(self._queue.put_nowait, payload)

    async def run(self) -> None:
        while True:
            payload = await self._queue.get()
            if not self._clients:
                continue
            stale_clients = set()
            for client in self._clients:
                try:
                    await client.send_json(payload)
                except Exception:
                    stale_clients.add(client)
            for client in stale_clients:
                self._clients.discard(client)


training_stream = TrainingStream()


class EnvironmentStream:
    """Broadcasts live environment state to connected WebSocket clients."""

    def __init__(self) -> None:
        self._clients: set[WebSocket] = set()
        self._loop: asyncio.AbstractEventLoop | None = None
        self._state_provider: callable | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def set_state_provider(self, provider: callable) -> None:
        self._state_provider = provider

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self._clients.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self._clients.discard(websocket)

    async def run(self) -> None:
        while True:
            await asyncio.sleep(1 / 60)
            if not self._clients or self._state_provider is None:
                continue
            try:
                payload = self._state_provider()
            except Exception:
                continue
            stale_clients = set()
            for client in self._clients:
                try:
                    await client.send_json(payload)
                except Exception:
                    stale_clients.add(client)
            for client in stale_clients:
                self._clients.discard(client)


environment_stream = EnvironmentStream()
