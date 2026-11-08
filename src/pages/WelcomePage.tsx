const steps = [
  ["Train", "Learn benchmark-specific scoring with guided examples."],
  ["Validate", "Review model responses independently while automated-judge results remain hidden."],
  ["Finalize", "Freeze completed human judgments into an immutable validation record."],
  ["Compare", "Deliberately unblind the automated judge after human validation is finalized."],
  ["Investigate", "Measure judge reliability and inspect category-level and case-level disagreements."],
] as const;

export function WelcomePage() {
  return <main className="welcome-shell">
    <section className="welcome-hero">
      <p className="eyebrow">SafeFlow Human Validator</p>
      <h1>Human validation for AI evaluations.</h1>
      <p className="hero-copy">Train reviewers, conduct benchmark-aware blinded validation, and measure how reliably automated LLM judges evaluate model behavior.</p>
      <p className="hero-rationale">Automated evaluators need validation too.</p>
      <p className="beta-notice"><span>PUBLIC BETA</span> SafeFlow Human Validator is free to use during the public beta.</p>
      <section className="hero-workspace-choices" aria-label="Choose Local or Cloud Workspace">
        <article className="hero-workspace-local">
          <div className="entry-heading"><span className="workspace-badge">LOCAL</span><strong>No account required</strong></div>
          <h2>Start in this browser.</h2>
          <p>Training and local validation are available immediately. Project and training data remain in this browser.</p>
          <div className="welcome-actions">
            <a className="primary-link" href="/training/air-bench-2024">Start AIR-BENCH Training</a>
            <a className="button-link secondary-link" href="/settings/data">Validate a Dataset</a>
            <a className="text-link" href="/projects">Open Local Projects <span aria-hidden="true">→</span></a>
          </div>
          <p className="first-time-cue">New to human validation? Start with the AIR-BENCH practice module. Training progress is local to this browser.</p>
        </article>
        <article className="hero-workspace-cloud">
          <div className="entry-heading"><span className="workspace-badge">CLOUD</span><strong>Invitation required</strong></div>
          <h2>Join a research workspace.</h2>
          <p>Authorized researchers can open shared cloud projects with role-based access. Sign-in is only for Cloud Workspace.</p>
          <a className="button-link secondary-link" href="/cloud">Sign in to Cloud Workspace</a>
        </article>
      </section>
    </section>

    <section className="workflow-section" aria-labelledby="workflow-heading">
      <p className="eyebrow" id="workflow-heading">Research workflow</p>
      <ol className="workflow-steps">{steps.map(([title, description]) => <li key={title}><span>{title}</span><p>{description}</p></li>)}</ol>
    </section>

    <p className="credibility-strip">Benchmark-aware <span aria-hidden="true">·</span> Structurally blinded <span aria-hidden="true">·</span> Immutable finalization <span aria-hidden="true">·</span> Reproducible judge analysis</p>
    <p className="workflow-explainer-link"><a href="/docs/llm-judge-validation">How does LLM judge validation work? <span aria-hidden="true">→</span></a></p>

    <section className="workspace-cards" aria-labelledby="workspace-heading">
      <div className="section-heading"><p className="eyebrow">Choose your workspace</p><h2 id="workspace-heading">Local control or authorized collaboration.</h2></div>
      <article>
        <span className="workspace-badge">LOCAL</span><h3>Work entirely in this browser.</h3>
        <p className="workspace-promise">Your evaluation project data is not uploaded when using Local Workspace.</p>
        <ul><li>No account required</li><li>Local project persistence</li><li>Local validation and analysis</li><li>Backup and restore</li></ul>
        <a className="button-link secondary-link" href="/projects">Use Local Workspace</a>
      </article>
      <article>
        <span className="workspace-badge">CLOUD</span><h3>Collaborate with authorized researchers.</h3>
        <ul><li>Sign-in required</li><li>Persistent cloud projects</li><li>Role-based access</li><li>Shared research workflows</li></ul>
        <p>Cloud project data is stored in your authenticated SafeFlow workspace and is accessible to authorized members according to project permissions.</p>
        <a className="button-link secondary-link" href="/cloud">Sign In</a>
      </article>
    </section>
  </main>;
}
