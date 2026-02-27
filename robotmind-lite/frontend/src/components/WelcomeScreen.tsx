import { useState } from "react";

type WelcomeScreenProps = {
  onDismiss: () => void;
};

export const WelcomeScreen = ({ onDismiss }: WelcomeScreenProps) => {
  const [currentStep, setCurrentStep] = useState(0);

  const steps = [
    {
      title: "Welcome to RobotMind Lite V1!",
      icon: "🤖",
      description: "Production-ready AI for flat-ground robots. Train once, deploy anywhere.",
      content: [
        "🎯 V1 Mission: Master all flat-ground scenarios for real-world deployment",
        "🏭 Comprehensive training: Office, Warehouse, Parking, Roads, Loading Docks",
        "⚡ 3 model types with advanced noise/drift simulation for robustness",
        "📦 Export to ONNX - Deploy on any embedded system",
      ],
    },
    {
      title: "Choose Your Robot Type",
      icon: "🎯",
      description: "Each model trained for specific real-world scenarios.",
      content: [
        "🟢 Differential - Office/Warehouse corridors, doorways, clutter navigation",
        "🔵 Ackermann - Parking lots, road navigation, lane-keeping scenarios",
        "🟠 Rover/Skid-Steer - Warehouse racks, loading docks, tight-space maneuvering",
      ],
    },
    {
      title: "Real-World Training",
      icon: "⚙️",
      description: "V1 includes comprehensive obstacle scenarios.",
      content: [
        "🏗️ Complex obstacles: L-shapes, corridors, narrow passages, clusters",
        "🌪️ Noise simulation: Sensor drift, heading drift, speed/turn variations",
        "🎲 Randomization: Spawn positions, actuator scaling for robustness",
        "📊 PPO algorithm recommended - 15k+ steps for production quality",
      ],
    },
    {
      title: "Monitor Training Progress",
      icon: "🚀",
      description: "Watch your AI master real-world navigation!",
      content: [
        "📈 Live metrics - Reward, collision rate, episode length",
        "🎬 Real-time simulation - See distinct robot shapes for each model",
        "💬 Detailed console logs - Track scenario coverage",
        "✅ Training completes when model handles all obstacle types",
      ],
    },
    {
      title: "Deploy to Production",
      icon: "📦",
      description: "Your model is ready for real-world flat-ground deployment.",
      content: [
        "✅ ONNX format - Compatible with TensorRT, OpenVINO, ONNX Runtime",
        "🎯 Trained on diverse scenarios - Generalizes to new environments",
        "💪 Robust to real-world noise - Sensor drift, actuator variations",
        "🌐 V1 Guarantee: Works perfectly on all flat-ground surfaces",
      ],
    },
  ];

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 to-slate-950 p-8 shadow-2xl">
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 text-2xl text-slate-400 hover:text-slate-200 transition"
        >
          ×
        </button>

        <div className="text-center">
          <div className="text-6xl mb-4">{step.icon}</div>
          <div className="text-2xl font-bold text-slate-100 mb-2">{step.title}</div>
          <div className="text-sm text-slate-400 mb-6">{step.description}</div>
        </div>

        <div className="space-y-3 mb-8">
          {step.content.map((item, index) => (
            <div
              key={index}
              className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-slate-300"
            >
              {item}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            {steps.map((_, index) => (
              <div
                key={index}
                className={`h-2 w-2 rounded-full transition ${
                  index === currentStep ? "bg-emerald-400 w-6" : "bg-slate-700"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-3">
            {currentStep > 0 && (
              <button
                onClick={() => setCurrentStep(currentStep - 1)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 transition"
              >
                ← Back
              </button>
            )}
            <button
              onClick={() => {
                if (isLast) {
                  onDismiss();
                } else {
                  setCurrentStep(currentStep + 1);
                }
              }}
              className="rounded-lg border border-emerald-500/40 bg-gradient-to-r from-emerald-500/20 to-green-500/20 px-6 py-2 text-sm font-semibold text-emerald-200 hover:from-emerald-500/30 hover:to-green-500/30 transition shadow-lg"
            >
              {isLast ? "🚀 Get Started!" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

