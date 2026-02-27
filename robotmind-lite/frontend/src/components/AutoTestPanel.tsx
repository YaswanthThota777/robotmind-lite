/**
 * AutoTestPanel — Automated behavioral diagnosis for a trained model.
 *
 * Runs 6 tests via /auto-test-model, shows each result as a card with
 * PASS / WARN / FAIL badge, detailed metric, and a one-click Fix button
 * that pre-fills the training config with recommended parameters.
 */
import { useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface TestResult {
  test_id: string;
  name: string;
  status: "pass" | "warn" | "fail" | "skip";
  severity: "none" | "low" | "medium" | "high";
  metric_label: string;
  metric_value: number;
  unit: string;
  threshold_pass: number;
  description: string;
  fix_description: string;
  fix_params: Record<string, unknown>;
  has_fix: boolean;
}

interface AutoTestResult {
  run_id: number;
  overall: "pass" | "warn" | "fail";
  health_score: number;
  tests: TestResult[];
  issues: TestResult[];
  summary: { pass: number; warn: number; fail: number; skip: number; total_tested: number };
  primary_metrics: {
    goal_reach_rate: number;
    collision_rate: number;
    spin_rate: number;
    avg_coverage: number;
    avg_reward: number;
  };
  elapsed_seconds: number;
  episodes_per_test: number;
  environment_profile: string;
}

interface AutoTestPanelProps {
  apiBase: string;
  runId: number | null;
  defaultEnvProfile: string;
  /** Called when user clicks "Apply Fix & Retrain" — merges fix params */
  onApplyFix: (fixParams: Record<string, unknown>) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  pass: {
    badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    border: "border-emerald-500/20",
    icon: "✓",
    bar: "bg-emerald-500",
  },
  warn: {
    badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    border: "border-amber-500/30",
    icon: "⚠",
    bar: "bg-amber-500",
  },
  fail: {
    badge: "bg-red-500/20 text-red-300 border-red-500/30",
    border: "border-red-500/30",
    icon: "✕",
    bar: "bg-red-500",
  },
  skip: {
    badge: "bg-slate-700/50 text-slate-400 border-slate-600/30",
    border: "border-slate-700/30",
    icon: "–",
    bar: "bg-slate-600",
  },
} as const;

const HEALTH_COLOR = (score: number) => {
  if (score >= 75) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
};

const HEALTH_BAR_COLOR = (score: number) => {
  if (score >= 75) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
};

const OVERALL_LABEL = { pass: "Healthy", warn: "Issues Found", fail: "Critical Issues" };

// ── Component ──────────────────────────────────────────────────────────────

export const AutoTestPanel = ({
  apiBase,
  runId,
  defaultEnvProfile,
  onApplyFix,
}: AutoTestPanelProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AutoTestResult | null>(null);
  const [episodes, setEpisodes] = useState(20);
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [appliedFixes, setAppliedFixes] = useState<Set<string>>(new Set());

  const toggleExpand = (testId: string) => {
    setExpandedTests((prev) => {
      const next = new Set(prev);
      next.has(testId) ? next.delete(testId) : next.add(testId);
      return next;
    });
  };

  const runDiagnosis = async () => {
    if (!runId) {
      setError("Select a trained model run first.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setAppliedFixes(new Set());

    try {
      const res = await fetch(`${apiBase}/auto-test-model`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          run_id: runId,
          environment_profile: defaultEnvProfile,
          episodes_per_test: episodes,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = err.detail;
        throw new Error(
          typeof detail === "string" ? detail : JSON.stringify(detail) || "Diagnosis failed"
        );
      }

      const data: AutoTestResult = await res.json();
      setResult(data);
      // Auto-expand all failed tests
      const failIds = new Set(
        data.tests.filter((t) => t.status === "fail").map((t) => t.test_id)
      );
      setExpandedTests(failIds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Diagnosis failed");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFix = (test: TestResult) => {
    onApplyFix(test.fix_params);
    setAppliedFixes((prev) => new Set([...prev, test.test_id]));
  };

  return (
    <div className="space-y-4">
      {/* ── Controls ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold text-slate-100 text-sm">Automated Behavioral Diagnosis</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Runs 6 behavioral tests — goal seeking, wall avoidance, spinning, generalization,
              coverage, and path efficiency. Detects issues and suggests exact fixes.
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-slate-400">Episodes:</label>
              <select
                value={episodes}
                onChange={(e) => setEpisodes(Number(e.target.value))}
                className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
              >
                <option value={10}>10 (fast)</option>
                <option value={20}>20 (recommended)</option>
                <option value={40}>40 (thorough)</option>
              </select>
            </div>
            <button
              onClick={runDiagnosis}
              disabled={loading || !runId}
              className={`px-4 py-2 rounded-xl text-sm font-semibold
                ${loading || !runId
                  ? "bg-slate-700 text-slate-500 cursor-not-allowed"
                  : "bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/30"
                } transition-all`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-violet-300 border-t-transparent animate-spin" />
                  Running {episodes} episodes/test…
                </span>
              ) : "🔬 Run Diagnosis"}
            </button>
          </div>
        </div>

        {!runId && (
          <div className="mt-2 text-xs text-amber-400">
            ⚠ Select a trained model run in the Model section above first.
          </div>
        )}
      </div>

      {/* ── Error ──────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3 text-sm text-red-300">
          ✕ {error}
        </div>
      )}

      {/* ── Results ────────────────────────────────────────────────────────── */}
      {result && (
        <div className="space-y-4">
          {/* Health score header */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-widest font-medium mb-1">
                  Overall Health
                </div>
                <div className={`text-3xl font-bold ${HEALTH_COLOR(result.health_score)}`}>
                  {result.health_score}
                  <span className="text-lg font-normal text-slate-400">/100</span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {OVERALL_LABEL[result.overall]} · {result.summary.pass} passed ·{" "}
                  {result.summary.warn} warnings · {result.summary.fail} failed ·{" "}
                  tested {result.episodes_per_test} episodes per check
                  · {result.elapsed_seconds}s
                </div>
              </div>
              <div className="text-right space-y-1.5">
                {[
                  { label: "Goal reach", value: result.primary_metrics.goal_reach_rate, unit: "%" },
                  { label: "Collision", value: result.primary_metrics.collision_rate, unit: "%" },
                  { label: "Spinning", value: result.primary_metrics.spin_rate, unit: "%" },
                  { label: "Coverage", value: result.primary_metrics.avg_coverage, unit: "%" },
                ].map(({ label, value, unit }) => (
                  <div key={label} className="flex items-center gap-3 text-xs">
                    <span className="text-slate-500 w-20 text-right">{label}</span>
                    <span className="text-slate-200 font-mono w-12 text-right">
                      {value.toFixed(1)}{unit}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {/* Health bar */}
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${HEALTH_BAR_COLOR(result.health_score)}`}
                style={{ width: `${result.health_score}%` }}
              />
            </div>
          </div>

          {/* Issue summary banner (if issues exist) */}
          {result.issues.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-900/10 p-3">
              <div className="text-xs font-semibold text-amber-300 mb-1">
                {result.summary.fail} critical · {result.summary.warn} warnings detected
              </div>
              <div className="text-xs text-slate-400">
                Click each issue card below to see the exact fix. Use "Apply Fix & Retrain" to
                automatically configure the training panel with improved settings.
              </div>
            </div>
          )}

          {/* ── Test cards grid ───────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-3">
            {result.tests.map((test) => {
              const styles = STATUS_STYLES[test.status] ?? STATUS_STYLES.skip;
              const isExpanded = expandedTests.has(test.test_id);
              const fixApplied = appliedFixes.has(test.test_id);

              return (
                <div
                  key={test.test_id}
                  className={`rounded-xl border ${styles.border} bg-slate-900/40 overflow-hidden`}
                >
                  {/* Card header — always visible */}
                  <button
                    onClick={() => toggleExpand(test.test_id)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold border ${styles.badge}`}>
                        {styles.icon}
                      </span>
                      <div>
                        <div className="text-sm font-semibold text-slate-100">{test.name}</div>
                        {test.status !== "skip" && (
                          <div className="text-xs text-slate-400">
                            {test.metric_label}: <span className="text-slate-200 font-mono">{test.metric_value.toFixed(1)}{test.unit}</span>
                            {" "}
                            <span className="text-slate-500">(pass if {test.status === "pass" ? "✓" : `< ${test.threshold_pass}${test.unit}`})</span>
                          </div>
                        )}
                        {test.status === "skip" && (
                          <div className="text-xs text-slate-500">Skipped — insufficient data</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${styles.badge}`}>
                        {test.status}
                      </span>
                      <span className="text-slate-500 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-slate-800/50">
                      {/* Metric bar */}
                      {test.status !== "skip" && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-slate-400 mb-1">
                            <span>{test.metric_label}</span>
                            <span className="font-mono">{test.metric_value.toFixed(1)}{test.unit}</span>
                          </div>
                          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${styles.bar}`}
                              style={{ width: `${Math.min(100, test.metric_value)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Description */}
                      <p className="text-xs text-slate-300 leading-relaxed mt-2">
                        {test.description}
                      </p>

                      {/* Fix block — only for non-pass tests */}
                      {test.has_fix && test.fix_description && (
                        <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
                            Recommended Fix
                          </div>
                          <p className="text-xs text-slate-300 leading-relaxed mb-3">
                            {test.fix_description}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleApplyFix(test)}
                              disabled={fixApplied}
                              className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all
                                ${fixApplied
                                  ? "bg-emerald-700/40 text-emerald-300 border border-emerald-600/30 cursor-default"
                                  : "bg-violet-600 hover:bg-violet-500 text-white shadow shadow-violet-900/30"
                                }`}
                            >
                              {fixApplied ? "✓ Fix Applied to Training Config" : "⚡ Apply Fix & Retrain"}
                            </button>
                          </div>
                          {/* Show what params will be set */}
                          {Object.keys(test.fix_params).length > 0 && (
                            <details className="mt-2">
                              <summary className="text-[10px] text-slate-500 cursor-pointer hover:text-slate-400">
                                View parameter changes
                              </summary>
                              <pre className="mt-1 text-[10px] text-slate-400 font-mono bg-slate-900 rounded p-2 overflow-x-auto">
                                {JSON.stringify(test.fix_params, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* All-clear message */}
          {result.issues.length === 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-900/10 p-4 text-center">
              <div className="text-2xl mb-1">🎉</div>
              <div className="text-sm font-semibold text-emerald-300">All tests passed!</div>
              <div className="text-xs text-slate-400 mt-1">
                This model is behaviorally healthy and ready for real-world testing.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
