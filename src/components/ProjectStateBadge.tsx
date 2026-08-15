export function projectStateLabel(state: string): string {
  return state.replaceAll("_", " ");
}

export function ProjectStateBadge({ state }: { state: string }) {
  return <span className={`status-pill state-${state.toLowerCase().replaceAll("_", "-")}`}>{projectStateLabel(state)}</span>;
}
