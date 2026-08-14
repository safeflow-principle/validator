export const ROUTES = [
  { pattern: "/", purpose: "Local welcome and project entry point", milestone: "skeleton" },
  { pattern: "/projects", purpose: "Local projects list and deletion", milestone: "workflow" },
  { pattern: "/projects/:projectId", purpose: "Project information and human-validation progress", milestone: "workflow" },
  { pattern: "/projects/:projectId/annotate", purpose: "Blinded annotation workspace with persistent resume", milestone: "workflow" },
  { pattern: "/projects/:projectId/review", purpose: "Human-only annotation review", milestone: "workflow" },
  { pattern: "/mock/annotation", purpose: "Synthetic blinded annotation screen", milestone: "skeleton" },
  { pattern: "/settings/data", purpose: "Local dataset import, mapping, and preflight", milestone: "milestone 2" },
] as const;
