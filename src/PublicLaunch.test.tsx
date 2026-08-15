import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { AppChrome } from "./components/AppChrome";
import { ProjectStateBadge } from "./components/ProjectStateBadge";
import { ProjectsPage } from "./pages/ProjectsPage";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("public launch experience", () => {
  it("explains SafeFlow and exposes the three main welcome actions without a cloud request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    window.history.replaceState({}, "", "/");
    render(<App />);
    expect(screen.getByRole("heading", { name: "Human validation for AI evaluations." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start AIR-BENCH Training" })).toHaveAttribute("href", "/training/air-bench-2024");
    expect(screen.getByRole("link", { name: "Validate a Dataset" })).toHaveAttribute("href", "/settings/data");
    expect(screen.getByRole("link", { name: /Open Projects/ })).toHaveAttribute("href", "/projects");
    expect(screen.getByText("Automated evaluators need validation too.")).toBeInTheDocument();
    expect(screen.getByText(/Benchmark-aware/)).toHaveTextContent("Structurally blinded");
    expect(screen.getByText("Work entirely in this browser.")).toBeInTheDocument();
    expect(screen.getByText("Your evaluation project data is not uploaded when using Local Workspace.")).toBeInTheDocument();
    expect(screen.getByText("Collaborate with authorized researchers.")).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("provides consistent primary navigation and explicit workspace wording", () => {
    window.history.replaceState({}, "", "/projects");
    const { rerender } = render(<AppChrome><main>Content</main></AppChrome>);
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByText("LOCAL")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Projects" })).toHaveAttribute("aria-current", "page");
    window.history.replaceState({}, "", "/cloud");
    rerender(<AppChrome><main>Cloud content</main></AppChrome>);
    expect(screen.getByText("CLOUD")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workspace" })).toBeInTheDocument();
  });

  it("opens the default Local projects view without contacting a cloud service", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<ProjectsPage />);
    expect(await screen.findByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Local" })).toHaveAttribute("aria-pressed", "true");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["/docs", "SafeFlow Validator Documentation"],
    ["/docs/getting-started", "Getting Started"],
    ["/docs/dataset-format", "Dataset Format"],
    ["/docs/air-bench", "AIR-BENCH Guide"],
    ["/docs/methodology", "Methodology"],
    ["/docs/privacy", "Privacy & Workspaces"],
    ["/docs/backup", "Backup & Recovery"],
  ])("renders documentation route %s", async (path, heading) => {
    window.history.replaceState({}, "", path);
    render(<App />);
    expect(await screen.findByRole("heading", { name: heading, level: 1 })).toBeInTheDocument();
  });

  it("renders domain project states with consistent human-facing labels", () => {
    const { rerender } = render(<ProjectStateBadge state="READY" />);
    expect(screen.getByText("READY")).toBeInTheDocument();
    rerender(<ProjectStateBadge state="HUMAN_FINALIZED" />);
    expect(screen.getByText("HUMAN FINALIZED")).toBeInTheDocument();
    rerender(<ProjectStateBadge state="UNBLINDED" />);
    expect(screen.getByText("UNBLINDED")).toBeInTheDocument();
  });

  it("keeps development terminology off the welcome and documentation index", async () => {
    render(<App />);
    const text = document.body.textContent ?? "";
    for (const term of ["Milestone", "mock dataset", "prototype", "dev only", "MVP"]) expect(text).not.toContain(term);
  });
});
