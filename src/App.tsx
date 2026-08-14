import { MockAnnotationPage } from "./pages/MockAnnotationPage";
import { DatasetImportPage } from "./pages/DatasetImportPage";
import { ROUTES } from "./routes";

function HomePage() {
  return (
    <main className="home-shell">
      <p className="eyebrow">SafeFlow research tooling</p>
      <h1>Independent human validation, kept on this device.</h1>
      <p>This architecture skeleton separates human annotations from automated-judge and reference artifacts.</p>
      <a className="primary-link" href="/mock/annotation">Open synthetic annotation</a>
      <a className="secondary-link" href="/settings/data">Import a local dataset</a>
      <details>
        <summary>Route map</summary>
        <ul>{ROUTES.map((route) => <li key={route.pattern}><code>{route.pattern}</code> — {route.purpose}</li>)}</ul>
      </details>
    </main>
  );
}

export function App() {
  if (window.location.pathname === "/mock/annotation") return <MockAnnotationPage />;
  if (window.location.pathname === "/settings/data") return <DatasetImportPage />;
  return <HomePage />;
}
