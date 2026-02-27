import { useState } from "react";
import type { ProfileOption, TrainingConfig } from "../types";

type SetupWizardProps = {
  config: TrainingConfig;
  environmentProfiles: ProfileOption[];
  algorithms: ProfileOption[];
  modelProfiles: ProfileOption[];
  onConfigChange: (config: TrainingConfig) => void;
  onComplete: () => void;
};

export const SetupWizard = ({
  config,
  environmentProfiles,
  algorithms,
  modelProfiles,
  onConfigChange,
  onComplete,
}: SetupWizardProps) => {
  const [step, setStep] = useState(1);
  const totalSteps = 3;

  const quickModels = [
    {
      key: "flat_ground_differential_v1",
      title: "🟢 Differential Drive",
      icon: "🚗",
      description: "Office/Warehouse • Corridors & Doorways • Real-world clutter navigation",
      color: "emerald",
    },
    {
      key: "flat_ground_ackermann_v1",
      title: "🔵 Ackermann Steering",
      icon: "🏎️",
      description: "Parking Lots • Road Navigation • Lane-keeping & Obstacle avoidance",
      color: "teal",
    },
    {
      key: "flat_ground_rover_v1",
      title: "🟠 Rover/Skid-Steer",
      icon: "🚙",
      description: "Warehouse Racks • Loading Docks • Tight-space maneuvering",
      color: "amber",
    },
  ];

  const handleNext = () => {
    if (step < totalSteps) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Progress Bar */}
      <div className="border-b border-slate-800 bg-slate-950 px-8 py-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm font-semibold text-slate-300">
            Step {step} of {totalSteps}
          </div>
          <div className="text-xs text-slate-500">
            {step === 1 && "Choose Model Type"}
            {step === 2 && "Configure Training"}
            {step === 3 && "Review & Confirm"}
          </div>
        </div>
        <div className="h-2 bg-slate-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-300"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {step === 1 && (
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-8">
              <div className="text-4xl mb-3">🎯</div>
              <h2 className="text-3xl font-bold text-slate-100 mb-2">Choose Your Robot Model</h2>
              <p className="text-slate-400">Select the model type that matches your robot platform</p>
            </div>

            <div className="grid gap-4">
              {quickModels.map((model) => (
                <button
                  key={model.key}
                  onClick={() => onConfigChange({ ...config, environmentProfile: model.key })}
                  className={`group text-left rounded-2xl border-2 p-6 transition-all ${
                    config.environmentProfile === model.key
                      ? `border-${model.color}-500 bg-gradient-to-br from-${model.color}-500/20 to-${model.color}-500/5 shadow-lg scale-[1.02]`
                      : "border-slate-700 bg-slate-900/60 hover:border-slate-600 hover:bg-slate-900"
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-5xl">{model.icon}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-xl font-bold text-slate-100">{model.title}</h3>
                        {config.environmentProfile === model.key && (
                          <span className="text-emerald-400 text-xl">✓</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400">{model.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="text-4xl mb-3">⚙️</div>
              <h2 className="text-3xl font-bold text-slate-100 mb-2">Configure Training</h2>
              <p className="text-slate-400">Adjust settings or use recommended defaults</p>
            </div>

            <div className="space-y-6">
              {/* Algorithm */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-6">
                <label className="block text-sm font-semibold text-slate-300 mb-3">
                  🧠 Learning Algorithm
                </label>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  value={config.algorithm}
                  onChange={(e) =>
                    onConfigChange({ ...config, algorithm: e.target.value as TrainingConfig["algorithm"] })
                  }
                >
                  {algorithms.map((algo) => (
                    <option key={algo.key} value={algo.key}>
                      {algo.label} - {algo.description}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  PPO is recommended for most use cases
                </p>
              </div>

              {/* Training Steps */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-6">
                <label className="block text-sm font-semibold text-slate-300 mb-3">
                  🎯 Training Steps
                </label>
                <div className="grid grid-cols-4 gap-3">
                  {[15000, 30000, 50000, 100000].map((steps) => (
                    <button
                      key={steps}
                      onClick={() => onConfigChange({ ...config, steps })}
                      className={`rounded-lg px-4 py-3 text-sm font-medium transition ${
                        config.steps === steps
                          ? "bg-teal-500/30 border-2 border-teal-500/50 text-teal-200"
                          : "border-2 border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800"
                      }`}
                    >
                      {steps >= 1000 ? `${steps / 1000}k` : steps}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  15k steps minimum for V1 production quality • 30k+ recommended
                </p>
              </div>

              {/* Model Profile */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-6">
                <label className="block text-sm font-semibold text-slate-300 mb-3">
                  🏗️ Neural Network Size
                </label>
                <select
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200 focus:border-teal-500/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  value={config.modelProfile}
                  onChange={(e) => onConfigChange({ ...config, modelProfile: e.target.value })}
                >
                  {modelProfiles.map((profile) => (
                    <option key={profile.key} value={profile.key}>
                      {profile.label} - {profile.description}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">
                  Balanced profile works well for most robots
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="text-4xl mb-3">📋</div>
              <h2 className="text-3xl font-bold text-slate-100 mb-2">Review Configuration</h2>
              <p className="text-slate-400">Confirm your settings before training</p>
            </div>

            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 p-6">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-slate-400 mb-1">Model Type</div>
                    <div className="text-lg font-bold text-emerald-300">
                      {environmentProfiles.find((e) => e.key === config.environmentProfile)?.label}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 mb-1">Algorithm</div>
                    <div className="text-lg font-bold text-teal-300">{config.algorithm}</div>
                  </div>
                  <div>
                    <div className="text-slate-400 mb-1">Training Steps</div>
                    <div className="text-lg font-bold text-amber-300">
                      {config.steps.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-400 mb-1">Network Size</div>
                    <div className="text-lg font-bold text-amber-300">
                      {modelProfiles.find((m) => m.key === config.modelProfile)?.label}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-6">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">📊 What Happens Next</h3>
                <ul className="space-y-2 text-sm text-slate-400">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400">✓</span>
                    <span>Live simulation will show your robot learning in real-time</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-teal-400">✓</span>
                    <span>Metrics chart will track reward and performance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400">✓</span>
                    <span>Console will log training progress and events</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-400">✓</span>
                    <span>Model will be exported to ONNX when complete</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="border-t border-slate-800 bg-slate-950 px-8 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={step === 1}
            className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-2.5 text-sm text-slate-300 hover:bg-slate-800 transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Back
          </button>

          <div className="flex items-center gap-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition ${
                  i + 1 <= step ? "bg-emerald-400 w-6" : "bg-slate-700"
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            disabled={step === 1 && !config.environmentProfile}
            className="rounded-lg border border-emerald-500/40 bg-gradient-to-r from-emerald-500/20 to-green-500/20 px-6 py-2.5 text-sm font-semibold text-emerald-200 hover:from-emerald-500/30 hover:to-green-500/30 transition shadow-lg disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {step === totalSteps ? "🚀 Start Training" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
};

