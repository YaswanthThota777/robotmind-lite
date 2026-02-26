/**
 * App.tsx – page router.
 *
 * Pages:
 *  "home"     → HomePage      (project list, empty state, new-project button)
 *  "wizard"   → ProjectWizard (5-step robot creation flow)
 *  "training" → TrainingPage  (full simulation + training workspace)
 */
import { useState, useCallback } from "react";
import { HomePage } from "./pages/HomePage";
import { ProjectWizard } from "./pages/ProjectWizard";
import { TrainingPage } from "./pages/TrainingPage";
import type { AppPage, ProfileOption, Project } from "./types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8000";

// ── project persistence ───────────────────────────────────────────────────────

const STORAGE_KEY = "robotmind_projects_v2";

const loadProjects = (): Project[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
};

const saveProjects = (projects: Project[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    /* storage full – ignore */
  }
};

// ── app ───────────────────────────────────────────────────────────────────────

const App = () => {
  const [page,     setPage]     = useState<AppPage>("home");
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [envProfiles] = useState<ProfileOption[]>([
    { key: "flat_ground_differential_v1", label: "Flat Ground Differential (V1)",
      description: "Office, warehouse, corridor, doorway, cluttered spaces" },
    { key: "flat_ground_ackermann_v1",    label: "Flat Ground Ackermann (V1)",
      description: "Parking, road navigation, lane-keeping, obstacle course" },
    { key: "flat_ground_rover_v1",        label: "Flat Ground Rover (V1)",
      description: "Warehouse, loading dock, pallet navigation, tight spaces" },
  ]);

  const persistProjects = useCallback((updated: Project[]) => {
    setProjects(updated);
    saveProjects(updated);
  }, []);

  // ── navigation ──────────────────────────────────────────────────────────────

  const handleNavigate = useCallback((target: AppPage, projectId?: string) => {
    if (projectId) setActiveId(projectId);
    setPage(target);
  }, []);

  // ── project CRUD ────────────────────────────────────────────────────────────

  const handleCreateProject = useCallback(
    (project: Project) => persistProjects([project, ...projects]),
    [projects, persistProjects]
  );

  const handleUpdateProject = useCallback(
    (updated: Project) =>
      persistProjects(projects.map((p) => (p.id === updated.id ? updated : p))),
    [projects, persistProjects]
  );

  const handleDeleteProject = useCallback(
    (id: string) => {
      persistProjects(projects.filter((p) => p.id !== id));
      if (activeId === id) setActiveId(null);
    },
    [projects, activeId, persistProjects]
  );

  const activeProject = projects.find((p) => p.id === activeId) ?? null;

  // ── render ──────────────────────────────────────────────────────────────────

  if (page === "home") {
    return (
      <HomePage
        projects={projects}
        onNavigate={handleNavigate}
        onDeleteProject={handleDeleteProject}
      />
    );
  }

  if (page === "wizard") {
    return (
      <ProjectWizard
        onNavigate={handleNavigate}
        onCreateProject={handleCreateProject}
        environmentProfiles={envProfiles}
      />
    );
  }

  if (page === "training" && activeProject) {
    return (
      <TrainingPage
        project={activeProject}
        apiBase={API_BASE}
        onNavigate={handleNavigate}
        onUpdateProject={handleUpdateProject}
      />
    );
  }

  // Fallback – no active project
  return (
    <div className="h-screen flex items-center justify-center bg-night-900 text-slate-400">
      <div className="text-center space-y-3">
        <div className="text-4xl">🤖</div>
        <div className="text-sm">No project selected.</div>
        <button
          className="px-4 py-2 rounded-lg bg-night-800 border border-night-700
                     hover:border-slate-600 text-xs text-slate-300 transition-colors"
          onClick={() => setPage("home")}
        >
          Go to Home
        </button>
      </div>
    </div>
  );
};

export default App;
