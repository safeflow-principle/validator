export const ROUTES = [
  { pattern: "/", purpose: "Local welcome and project entry point", milestone: "skeleton" },
  { pattern: "/projects", purpose: "Local projects list", milestone: "future MVP" },
  { pattern: "/projects/:projectId", purpose: "Project status and local items", milestone: "future MVP" },
  { pattern: "/projects/:projectId/annotate/:itemId", purpose: "Blinded annotation workspace", milestone: "future MVP" },
  { pattern: "/mock/annotation", purpose: "Synthetic blinded annotation screen", milestone: "skeleton" },
  { pattern: "/settings/data", purpose: "Local data import/export/delete controls", milestone: "future MVP" },
] as const;
