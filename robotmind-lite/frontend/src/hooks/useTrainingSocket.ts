import { useEffect, useRef, useState } from "react";
import type { TrainingMetric, TrainingStatus } from "../types";

const DEFAULT_BASE = "http://127.0.0.1:8000";

const buildWsUrl = (baseUrl: string) => {
  const url = new URL(baseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/training";
  return url.toString();
};

export const useTrainingSocket = (baseUrl = DEFAULT_BASE) => {
  const [metrics, setMetrics] = useState<TrainingMetric[]>([]);
  const [status, setStatus] = useState<TrainingStatus>({
    episode: 0,
    reward: 0,
    loss: 0,
    deploymentReady: false,
  });
  const socketRef = useRef<WebSocket | null>(null);

  const resetMetrics = () => setMetrics([]);

  useEffect(() => {
    const wsUrl = buildWsUrl(baseUrl);
    let unmounted = false;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    // Guard: if cleanup fires before socket opens (React StrictMode), close immediately on open
    socket.onopen = () => { if (unmounted) socket.close(); };

    socket.onmessage = (event) => {
      if (unmounted) return;
      try {
        const payload = JSON.parse(event.data) as TrainingMetric;
        setStatus((prev) => ({
          ...prev,
          episode: payload.episode ?? prev.episode,
          reward: payload.reward ?? prev.reward,
          loss: payload.loss ?? prev.loss,
          completedSteps: payload.completed_steps ?? prev.completedSteps,
          totalSteps: payload.total_steps ?? prev.totalSteps,
          progress: payload.progress ?? prev.progress,
        }));
        setMetrics((prev: TrainingMetric[]) => [...prev.slice(-199), payload]);
      } catch {
        // Ignore malformed messages.
      }
    };

    return () => {
      unmounted = true;
      if (socket.readyState !== WebSocket.CLOSED) socket.close();
    };
  }, [baseUrl]);

  useEffect(() => {
    const poll = async () => {
      try {
        const response = await fetch(`${baseUrl}/training-status`);
        if (!response.ok) return;
        const payload = await response.json();
        setStatus((prev) => ({
          ...prev,
          runId: payload.run_id,
          trainingState: payload.status,
          completedSteps: payload.completed_steps ?? prev.completedSteps,
          totalSteps: payload.total_steps ?? prev.totalSteps,
          progress: payload.progress ?? prev.progress,
          deploymentReady: Boolean(payload.deployment_ready),
          deploymentBundlePath: payload.deployment_bundle_path ?? null,
        }));
      } catch {
        // Ignore temporary API errors.
      }
    };

    poll();
    const intervalId = window.setInterval(poll, 2000);
    return () => window.clearInterval(intervalId);
  }, [baseUrl]);

  return { metrics, status, resetMetrics };
};

