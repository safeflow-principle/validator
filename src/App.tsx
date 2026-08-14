import { MockAnnotationPage } from "./pages/MockAnnotationPage";
import { DatasetImportPage } from "./pages/DatasetImportPage";
import { ProjectAnnotationPage } from "./pages/ProjectAnnotationPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ProjectReviewPage } from "./pages/ProjectReviewPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ROUTES } from "./routes";

function HomePage() {
  return (
    <main className="home-shell">
      <p className="eyebrow">SafeFlow research tooling</p>
      <h1>Independent human validation, kept on this device.</h1>
      <p>Import a local evaluation dataset, annotate blinded model responses, and resume your work entirely in this browser.</p>
      <a className="primary-link" href="/projects">Open local projects</a>
      <a className="secondary-link" href="/settings/data">Import a local dataset</a>
      <a className="tertiary-link" href="/mock/annotation">Open synthetic demo</a>
      <details>
        <summary>Route map</summary>
        <ul>{ROUTES.map((route) => <li key={route.pattern}><code>{route.pattern}</code> — {route.purpose}</li>)}</ul>
      </details>
    </main>
  );
}

export function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/mock/annotation") return <MockAnnotationPage />;
  if (path === "/settings/data") return <DatasetImportPage />;
  if (path === "/projects") return <ProjectsPage />;
  const review = path.match(/^\/projects\/([^/]+)\/review$/);
  if (review) return <ProjectReviewPage projectId={decodeURIComponent(review[1])} />;
  const annotation = path.match(/^\/projects\/([^/]+)\/annotate$/);
  if (annotation) return <ProjectAnnotationPage projectId={decodeURIComponent(annotation[1])} />;
  const project = path.match(/^\/projects\/([^/]+)$/);
  if (project) return <ProjectDetailPage projectId={decodeURIComponent(project[1])} />;
  return <HomePage />;
}
