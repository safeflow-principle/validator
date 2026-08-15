import { Component, lazy, Suspense, type ErrorInfo, type ReactNode } from "react";
import { AppChrome } from "./components/AppChrome";
import { WelcomePage } from "./pages/WelcomePage";

const MockAnnotationPage = lazy(() => import("./pages/MockAnnotationPage").then((module) => ({ default: module.MockAnnotationPage })));
const DatasetImportPage = lazy(() => import("./pages/DatasetImportPage").then((module) => ({ default: module.DatasetImportPage })));
const ProjectAnnotationPage = lazy(() => import("./pages/ProjectAnnotationPage").then((module) => ({ default: module.ProjectAnnotationPage })));
const ProjectDetailPage = lazy(() => import("./pages/ProjectDetailPage").then((module) => ({ default: module.ProjectDetailPage })));
const ProjectReviewPage = lazy(() => import("./pages/ProjectReviewPage").then((module) => ({ default: module.ProjectReviewPage })));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage").then((module) => ({ default: module.ProjectsPage })));
const TrainingHomePage = lazy(() => import("./pages/TrainingHomePage").then((module) => ({ default: module.TrainingHomePage })));
const AirBenchTrainingIntroPage = lazy(() => import("./pages/AirBenchTrainingIntroPage").then((module) => ({ default: module.AirBenchTrainingIntroPage })));
const AirBenchPracticePage = lazy(() => import("./pages/AirBenchPracticePage").then((module) => ({ default: module.AirBenchPracticePage })));
const AirBenchTrainingResultsPage = lazy(() => import("./pages/AirBenchTrainingResultsPage").then((module) => ({ default: module.AirBenchTrainingResultsPage })));
const FinalizedHumanResultsPage = lazy(() => import("./pages/FinalizedHumanResultsPage").then((module) => ({ default: module.FinalizedHumanResultsPage })));
const JudgeAnalysisPage = lazy(() => import("./pages/JudgeAnalysisPage").then((module) => ({ default: module.JudgeAnalysisPage })));
const CloudWorkspacePage = lazy(() => import("./pages/CloudWorkspacePage").then((module) => ({ default: module.CloudWorkspacePage })));
const CloudMigrationPage = lazy(() => import("./pages/CloudMigrationPage").then((module) => ({ default: module.CloudMigrationPage })));
const CloudProjectDetailPage = lazy(() => import("./pages/CloudProjectPages").then((module) => ({ default: module.CloudProjectDetailPage })));
const CloudProjectAnnotationPage = lazy(() => import("./pages/CloudProjectPages").then((module) => ({ default: module.CloudProjectAnnotationPage })));
const CloudProjectReviewPage = lazy(() => import("./pages/CloudProjectPages").then((module) => ({ default: module.CloudProjectReviewPage })));
const DocsPage = lazy(() => import("./pages/DocsPage").then((module) => ({ default: module.DocsPage })));

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
  return <RouteErrorBoundary><AppChrome><Suspense fallback={<main className="loading-screen"><p>Opening SafeFlow…</p></main>}>{children}</Suspense></AppChrome></RouteErrorBoundary>;
}

export function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";
  if (path === "/") return <RoutedPage><WelcomePage /></RoutedPage>;
  const docPage = path.match(/^\/docs(?:\/(getting-started|dataset-format|air-bench|methodology|privacy|backup))?$/);
  if (docPage) return <RoutedPage><DocsPage page={(docPage[1] ?? "index") as "index" | "getting-started" | "dataset-format" | "air-bench" | "methodology" | "privacy" | "backup"} /></RoutedPage>;
  if (path === "/mock/annotation") return <RoutedPage><MockAnnotationPage /></RoutedPage>;
  if (path === "/settings/data") return <RoutedPage><DatasetImportPage /></RoutedPage>;
  if (path === "/projects") return <RoutedPage><ProjectsPage /></RoutedPage>;
  if (path === "/cloud") return <RoutedPage><CloudWorkspacePage /></RoutedPage>;
  const cloudReview = path.match(/^\/cloud\/projects\/([^/]+)\/review$/);
  if (cloudReview) return <RoutedPage><CloudProjectReviewPage projectId={decodeURIComponent(cloudReview[1])} /></RoutedPage>;
  const cloudAnnotation = path.match(/^\/cloud\/projects\/([^/]+)\/annotate$/);
  if (cloudAnnotation) return <RoutedPage><CloudProjectAnnotationPage projectId={decodeURIComponent(cloudAnnotation[1])} /></RoutedPage>;
  const cloudProject = path.match(/^\/cloud\/projects\/([^/]+)$/);
  if (cloudProject) return <RoutedPage><CloudProjectDetailPage projectId={decodeURIComponent(cloudProject[1])} /></RoutedPage>;
  if (path === "/training") return <RoutedPage><TrainingHomePage /></RoutedPage>;
  if (path === "/training/air-bench-2024") return <RoutedPage><AirBenchTrainingIntroPage /></RoutedPage>;
  if (path === "/training/air-bench-2024/practice") return <RoutedPage><AirBenchPracticePage /></RoutedPage>;
  if (path === "/training/air-bench-2024/results") return <RoutedPage><AirBenchTrainingResultsPage /></RoutedPage>;
  const review = path.match(/^\/projects\/([^/]+)\/review$/);
  if (review) return <RoutedPage><ProjectReviewPage projectId={decodeURIComponent(review[1])} /></RoutedPage>;
  const annotation = path.match(/^\/projects\/([^/]+)\/annotate$/);
  if (annotation) return <RoutedPage><ProjectAnnotationPage projectId={decodeURIComponent(annotation[1])} /></RoutedPage>;
  const finalized = path.match(/^\/projects\/([^/]+)\/finalized$/);
  if (finalized) return <RoutedPage><FinalizedHumanResultsPage projectId={decodeURIComponent(finalized[1])} /></RoutedPage>;
  const analysis = path.match(/^\/projects\/([^/]+)\/analysis\/([^/]+)$/);
  if (analysis) return <RoutedPage><JudgeAnalysisPage projectId={decodeURIComponent(analysis[1])} analysisId={decodeURIComponent(analysis[2])} /></RoutedPage>;
  const migration = path.match(/^\/projects\/([^/]+)\/cloud-copy$/);
  if (migration) return <RoutedPage><CloudMigrationPage projectId={decodeURIComponent(migration[1])} /></RoutedPage>;
  const project = path.match(/^\/projects\/([^/]+)$/);
  if (project) return <RoutedPage><ProjectDetailPage projectId={decodeURIComponent(project[1])} /></RoutedPage>;
  return <RoutedPage><main className="project-shell"><p className="eyebrow">Page not found</p><h1>We couldn’t find that page.</h1><p><a href="/">Return to SafeFlow Human Validator</a></p></main></RoutedPage>;
}
