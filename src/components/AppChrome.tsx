import type { ReactNode } from "react";

function routeIsActive(path: string, target: string) {
  if (target === "/projects") return path.startsWith("/projects");
  if (target === "/training") return path.startsWith("/training");
  if (target === "/settings/data") return path === target;
  if (target === "/docs/getting-started") return path.startsWith("/docs");
  return path === target;
}

export function AppChrome({ children }: { children: ReactNode }) {
  const path = window.location.pathname;
  const cloud = path.startsWith("/cloud");
  const links = [
    ["Projects", "/projects"],
    ["Training", "/training"],
    ["Validate", "/settings/data"],
    ["Docs", "/docs/getting-started"],
  ] as const;
  return (
    <div className="app-frame">
      <header className="app-nav">
        <a className="wordmark" href="/" aria-label="SafeFlow Human Validator home">SafeFlow</a>
        <nav aria-label="Primary navigation">
          {links.map(([label, href]) => <a aria-current={routeIsActive(path, href) ? "page" : undefined} href={href} key={href}>{label}</a>)}
        </nav>
        <div className="workspace-switcher">
          <span className="workspace-badge">{cloud ? "CLOUD" : "LOCAL"}</span>
          <a href={cloud ? "/cloud" : "/cloud"}>{cloud ? "Workspace" : "Sign in"}</a>
        </div>
      </header>
      <div className="app-main">{children}</div>
      <footer className="app-footer">
        <span>SafeFlow Human Validator</span>
        <a href="/docs">Documentation</a>
        <a href="/docs/privacy">Privacy</a>
        <a href="https://safeflow.app">SafeFlow</a>
      </footer>
    </div>
  );
}
