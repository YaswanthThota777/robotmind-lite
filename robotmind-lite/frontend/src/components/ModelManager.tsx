import { useEffect, useState } from "react";
import { TrainingAnalytics } from "./TrainingAnalytics";
import { QuickTest } from "./QuickTest";
import type { SimulationState } from "../types";

type TrainingRun = {
  run_id: number;
  algorithm: string;
  environment_profile?: string;
  environment?: string;
  model_profile: string;
  total_steps: number;
  status: string;
  started_at: string;
  completed_at?: string;
  model_path?: string;
  onnx_path?: string;
  deployment_ready?: boolean;
};

type ModelManagerProps = {
  apiBase: string;
  onClose: () => void;
  onTestPlaybackStart: (frames: SimulationState[]) => void;
  onTestPlaybackStop: () => void;
  isTestMode: boolean;
};

export const ModelManager = ({ apiBase, onClose, onTestPlaybackStart, onTestPlaybackStop, isTestMode }: ModelManagerProps) => {
  const [runs, setRuns] = useState<TrainingRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  const [showTestModal, setShowTestModal] = useState(false);
  const [testRun, setTestRun] = useState<TrainingRun | null>(null);

  useEffect(() => {
    loadRuns();
  }, []);

  const resolveEnvProfile = (run: TrainingRun) => {
    const raw = run.environment_profile ?? run.environment ?? "arena_basic";
    if (raw.includes(":")) {
      return raw.split(":")[1] || "arena_basic";
    }
    return raw;
  };

  const openTestModal = (run: TrainingRun) => {
    setTestRun(run);
    setShowTestModal(true);
  };

  const loadRuns = async () => {
    try {
      const response = await fetch(`${apiBase}/training-runs?limit=50`);
      if (response.ok) {
        const data = await response.json();
        const normalized = Array.isArray(data)
          ? data.map((run: any) => ({
              ...run,
              run_id: run.run_id ?? run.id,
              total_steps: run.total_steps ?? run.steps,
            }))
          : [];
        setRuns(normalized);
      }
    } catch (error) {
      console.error("Failed to load training runs:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteRun = async (runId: number) => {
    if (!confirm(`Delete Run #${runId}? This cannot be undone.`)) return;
    try {
      await fetch(`${apiBase}/training-runs/${runId}`, { method: "DELETE" });
      setRuns((prev) => prev.filter((r) => r.run_id !== runId));
      if (selectedRun === runId) setSelectedRun(null);
    } catch { /* silent */ }
  };

  const deleteAllRuns = async () => {
    if (!confirm("Delete ALL training runs? This cannot be undone.")) return;
    try {
      await fetch(`${apiBase}/training-runs`, { method: "DELETE" });
      setRuns([]);
      setSelectedRun(null);
    } catch { /* silent */ }
  };

  const downloadModel = async (runId: number, format: "sb3" | "onnx") => {
    try {
      const response = await fetch(`${apiBase}/download-model?run_id=${runId}&format=${format}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `model_${runId}.${format === "onnx" ? "onnx" : "zip"}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Failed to download model:", error);
    }
  };

  const downloadDeploymentBundle = async (runId: number) => {
    try {
      const response = await fetch(`${apiBase}/download-deployment-bundle?run_id=${runId}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `deployment_${runId}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error("Failed to download deployment bundle:", error);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (started: string, completed?: string) => {
    const start = new Date(started).getTime();
    const end = completed ? new Date(completed).getTime() : Date.now();
    const duration = Math.floor((end - start) / 1000);
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[90vh] bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700/50 bg-gradient-to-r from-slate-800 to-slate-900">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Model Manager</h2>
              <p className="text-sm text-slate-400 mt-0.5">Manage trained models and deployments</p>
            </div>
            <div className="flex items-center gap-2">
              {runs.length > 0 && (
                <button
                  onClick={deleteAllRuns}
                  className="px-3 py-2 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-700/40 text-xs font-semibold transition-colors"
                >
                  🗑 Delete All
                </button>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto rm-scrollbar max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="space-y-3">
              {[0,1,2].map((i) => (
                <div key={i} className="rounded-xl border border-slate-800 p-4 space-y-3">
                  <div className="flex gap-3">
                    <div className="rm-skeleton h-5 w-20" />
                    <div className="rm-skeleton h-5 w-16" />
                    <div className="rm-skeleton h-5 w-24" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rm-skeleton h-4 w-full" />
                    <div className="rm-skeleton h-4 w-full" />
                  </div>
                  <div className="rm-skeleton h-3 w-32" />
                </div>
              ))}
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/60
                              flex items-center justify-center text-3xl">
                🧠
              </div>
              <div>
                <div className="text-slate-300 font-semibold text-base">No models yet</div>
                <div className="text-slate-500 text-sm mt-1">Train a robot to see your models here.</div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {runs.map((run, index) => (
                <div
                  key={run.run_id ?? `run-${index}`}
                  className={`border rounded-xl p-4 transition-all duration-200 cursor-pointer ${
                    selectedRun === run.run_id
                      ? "border-teal-500/70 bg-teal-500/10 shadow-teal-sm"
                      : "border-slate-700/60 bg-slate-800/30 hover:border-teal-500/40 hover:bg-teal-950/20"
                  }`}
                  onClick={() => setSelectedRun(selectedRun === run.run_id ? null : run.run_id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-lg font-bold text-slate-100">Run #{run.run_id}</span>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-teal-500/20 text-teal-300 border border-teal-500/30">
                          {run.algorithm}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          run.status === "completed"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : run.status === "running"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : "bg-slate-500/20 text-slate-300 border border-slate-500/30"
                        }`}>
                          {run.status}
                        </span>
                        {run.deployment_ready && (
                          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            ✓ Production Ready
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                        <div className="text-slate-400">
                          <span className="text-slate-500">Environment:</span> {resolveEnvProfile(run)}
                        </div>
                        <div className="text-slate-400">
                          <span className="text-slate-500">Model:</span> {run.model_profile}
                        </div>
                        <div className="text-slate-400">
                          <span className="text-slate-500">Steps:</span> {(run.total_steps ?? 0).toLocaleString()}
                        </div>
                        <div className="text-slate-400">
                          <span className="text-slate-500">Duration:</span> {formatDuration(run.started_at, run.completed_at)}
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 mt-2">
                        Started: {formatDate(run.started_at)}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 ml-4">
                      {run.model_path && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadModel(run.run_id, "sb3");
                          }}
                          className="px-3 py-1.5 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/40 text-xs font-medium transition-colors whitespace-nowrap"
                        >
                          ⬇ SB3 Model
                        </button>
                      )}
                      {run.onnx_path && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadModel(run.run_id, "onnx");
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-medium transition-colors whitespace-nowrap"
                        >
                          ⬇ ONNX Model
                        </button>
                      )}
                      {run.deployment_ready && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadDeploymentBundle(run.run_id);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-semibold transition-colors whitespace-nowrap"
                        >
                          📦 Deploy Package
                        </button>
                      )}
                      {run.status === "completed" && run.model_path && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openTestModal(run);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold transition-colors whitespace-nowrap"
                        >
                          🧪 Test Model
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteRun(run.run_id);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-700/30 text-xs font-semibold transition-colors whitespace-nowrap"
                      >
                        🗑 Delete
                      </button>
                    </div>
                  </div>
                  
                  {/* Expanded Analytics */}
                  {selectedRun === run.run_id && run.status === "completed" && (
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <TrainingAnalytics apiBase={apiBase} runId={run.run_id} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showTestModal && testRun && (
        <QuickTest
          apiBase={apiBase}
          runId={testRun.run_id}
          defaultEnvProfile={resolveEnvProfile(testRun)}
          onPlaybackStart={(frames) => {
            onTestPlaybackStart(frames);
          }}
          onPlaybackStop={onTestPlaybackStop}
          isPlaying={isTestMode}
          onClose={() => {
            onTestPlaybackStop();
            setShowTestModal(false);
            setTestRun(null);
          }}
        />
      )}
    </div>
  );
};

