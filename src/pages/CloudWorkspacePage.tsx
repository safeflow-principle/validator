import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { ProjectSummary } from "../core/types";
import { cloudWorkspaceIsConfigured } from "../cloud/config";
import { getSupabaseClient } from "../cloud/client";
import { addExistingWorkspaceMember, createCloudWorkspace, listCloudWorkspaces, SupabaseProjectRepository } from "../cloud/repositories";
import { sendSignInLink, signOutCloud } from "../cloud/auth";
import { ProjectStateBadge } from "../components/ProjectStateBadge";

export function CloudWorkspacePage() {
  const configured = cloudWorkspaceIsConfigured();
  const [session, setSession] = useState<Session | null>();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string>();
  const [projects, setProjects] = useState<ProjectSummary[]>();
  const [workspaceName, setWorkspaceName] = useState<string>();
  const [workspaceId, setWorkspaceId] = useState<string>();
  const [role, setRole] = useState<string>();
  const [newWorkspaceName, setNewWorkspaceName] = useState("SafeFlow Research");
  const [inviteEmail, setInviteEmail] = useState("");

  useEffect(() => {
    if (!configured) return;
    const client = getSupabaseClient();
    void client.auth.getSession().then(({ data, error }) => {
      if (error) setMessage(error.message);
      setSession(data.session);
    });
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => data.subscription.unsubscribe();
  }, [configured]);

  useEffect(() => {
    if (!session) return;
    void listCloudWorkspaces().then(async (workspaces) => {
      const selected = workspaces[0];
      if (!selected) { setMessage("Your account has no accepted SafeFlow workspace membership yet."); return; }
      setWorkspaceId(selected.workspace.id); setRole(selected.membership.role);
      setWorkspaceName(`${selected.workspace.name} · ${selected.membership.role}`);
      setProjects(await new SupabaseProjectRepository(selected.workspace.id).listProjects());
    }).catch((reason: unknown) => setMessage(reason instanceof Error ? reason.message : "Could not load the cloud workspace."));
  }, [session]);

  async function requestLink(event: React.FormEvent) {
    event.preventDefault(); setMessage("Sending sign-in link…");
    try { await sendSignInLink(email); setMessage("Check your email for the SafeFlow sign-in link."); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not send sign-in link."); }
  }

  async function createWorkspace(event: React.FormEvent) {
    event.preventDefault(); setMessage("Creating cloud workspace…");
    try { await createCloudWorkspace(newWorkspaceName); window.location.reload(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not create the workspace."); }
  }

  async function inviteResearcher(event: React.FormEvent) {
    event.preventDefault();
    if (!workspaceId) return;
    setMessage("Adding researcher…");
    try { await addExistingWorkspaceMember(workspaceId, inviteEmail, "RESEARCHER"); setInviteEmail(""); setMessage("Researcher added. They can now sign into this workspace."); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Could not add the researcher."); }
  }

  if (!configured) return <main className="project-shell"><header className="page-header"><a className="wordmark" href="/">SafeFlow</a></header><span className="eyebrow">Cloud Workspace</span><h1>Cloud Workspace is unavailable</h1><p>Local Workspace remains fully available in this browser.</p><a className="primary-link" href="/projects">Open Local Workspace</a></main>;
  if (session === undefined) return <main className="loading-screen"><p>Restoring cloud session…</p></main>;
  if (!session) return <main className="project-shell"><header className="page-header"><a className="wordmark" href="/">SafeFlow</a></header><span className="eyebrow">Cloud Workspace</span><h1>Sign in</h1><p>Cloud project data is stored in your authenticated SafeFlow workspace and may be accessed by authorized workspace members.</p><form className="mapping-panel" onSubmit={requestLink}><label>Email address<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label><button className="primary-link button-link" type="submit">Email me a sign-in link</button></form>{message && <p role="status">{message}</p>}<p><a href="/projects">Continue with Local Workspace</a></p></main>;

  return <main className="project-shell"><header className="page-header"><a className="wordmark" href="/">SafeFlow</a><button className="secondary-link button-link" onClick={() => void signOutCloud()} type="button">Sign out</button></header><span className="eyebrow">CLOUD</span><h1>{workspaceName ?? "Cloud Workspace"}</h1><p>This project data is stored in your authenticated SafeFlow cloud workspace and may be accessed by authorized workspace members.</p>{message && <p role="status">{message}</p>}{!workspaceId ? <section className="backup-restore-card"><form onSubmit={createWorkspace}><label>Workspace name<input onChange={(event) => setNewWorkspaceName(event.target.value)} required value={newWorkspaceName} /></label><button className="primary-link button-link" type="submit">Create Cloud Workspace</button></form></section> : !projects ? <p>Loading cloud projects…</p> : projects.length === 0 ? <section className="empty-state"><h2>No cloud projects are available in this workspace</h2><p>An owner can create a cloud copy from a Local Workspace project.</p></section> : <div className="project-list">{projects.map((summary) => <article className="project-card" key={summary.project.id}><div><div className="badge-row"><span className="workspace-badge">CLOUD</span><ProjectStateBadge state={summary.project.status} /></div><h2>{summary.project.name}</h2><p>{summary.sourceName}</p></div><dl className="project-stats"><div><dt>Items</dt><dd>{summary.progress.total}</dd></div><div><dt>Submitted</dt><dd>{summary.progress.submitted}</dd></div><div><dt>Complete</dt><dd>{summary.progress.percentComplete}%</dd></div></dl><a className="primary-link button-link" href={`/cloud/projects/${summary.project.id}`}>Open</a></article>)}</div>}{role === "OWNER" && workspaceId && <section className="backup-restore-card"><div><strong>Add a research assistant</strong><p>First invite this email in Supabase Authentication. Then add the accepted account here.</p></div><form onSubmit={inviteResearcher}><label>Email<input onChange={(event) => setInviteEmail(event.target.value)} required type="email" value={inviteEmail} /></label><button className="secondary-link button-link" type="submit">Add as Researcher</button></form></section>}<p><a href="/projects">Switch to Local Workspace</a></p></main>;
}
