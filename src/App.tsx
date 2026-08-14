import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import { ROUTES } from "./routes";

const MockAnnotationPage = lazy(() => import("./pages/MockAnnotationPage").then((module) => ({ default: module.MockAnnotationPage })));
const DatasetImportPage = lazy(() => import("./pages/DatasetImportPage").then((module) => ({ default: module.DatasetImportPage })));
const ProjectAnnotationPage = lazy(() => import("./pages/ProjectAnnotationPage").then((module) => ({ default: module.ProjectAnnotationPage })));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage").then((module) => ({ default: module.ProjectDetailPage })));
const ProjectReviewPage = lazy(() => import("./pages/ProjectReviewPage").then((module) => ({ default: module.ProjectReviewPage })));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage").then((module) => ({ default: module.ProjectsPage })));

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : "The local page could not be opened." };
  }
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("SafeFlow route failed to render", error, info.componentStack);
  }
  render() {
    if (this.state.error) return <main className="project-shell"><h1>Could not open this local page</h1><p className="error-message">{this.state.error}</p><a href="/">Return home</a></main>;
    return this.props.children;
  }
}

function RoutedPage({ children }: { children: ReactNode }) {
  return <RouteErrorBoundary><Suspense fallback={<main className="loading-screen"><p>Opening local workspace…</p></main>}>{children}</Suspense></RouteErrorBoundary>;
}

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
  if (path === "/mock/annotation") return <RoutedPage><MockAnnotationPage /></RoutedPage>;
  if (path === "/settings/data") return <RoutedPage><DatasetImportPage /></RoutedPage>;
  if (path === "/projects") return <RoutedPage><ProjectsPage /></RoutedPage>;
  const review = path.match(/^\/projects\/([^/]+)\/review$/);
  if (review) return <RoutedPage><ProjectReviewPage projectId={decodeURIComponent(review[1])} /></RoutedPage>;
  const annotation = path.match(/^\/projects\/([^/]+)\/annotate$/);
  if (annotation) return <RoutedPage><ProjectAnnotationPage projectId={decodeURIComponent(annotation[1])} /></RoutedPage>;
  const project = path.match(/^\/projects\/([^/]+)$/);
  if (project) return <RoutedPage><ProjectDetailPage projectId={decodeURIComponent(project[1])} /></RoutedPage>;
  return <HomePage />;
}
