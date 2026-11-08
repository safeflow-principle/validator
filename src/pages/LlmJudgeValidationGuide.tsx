const roleGroups = [
  {
    title: "AI / System roles",
    roles: [
      {
        title: "System Under Evaluation",
        short: "SUE",
        description: "Produces the responses or behaviors being evaluated.",
        details: "This may be an LLM, AI agent, RAG application, guarded AI system, or production AI workflow.",
      },
      {
        title: "LLM Judge",
        description: "Applies the evaluation rubric to responses from the System Under Evaluation.",
        details: "May produce a score or label, reasoning, evidence, category, confidence, or other metadata. Its outputs are not assumed correct simply because they were generated automatically.",
      },
    ],
  },
  {
    title: "Human roles",
    roles: [
      {
        title: "Human Evaluator",
        description: "Independently evaluates responses using the same benchmark or rubric.",
        details: "May record a score, confidence, reasoning, evidence, and review flags. During blinded validation, automated judge decisions remain unavailable.",
      },
      {
        title: "Project Manager / Evaluation Lead",
        description: "Defines and controls the study.",
        details: "Selects the question, rubric, and data; configures and manages validation; reviews completion; controls finalization and unblinding; and interprets results.",
      },
      {
        title: "Adjudicator",
        short: "Optional",
        description: "Resolves selected disagreements or ambiguous cases.",
        details: "May help create an adjudicated reference set. An adjudicated label is distinct from an ordinary human annotation.",
      },
      {
        title: "Domain Expert",
        short: "Optional",
        description: "Adds specialized expertise when the evaluation requires it.",
        details: "Examples include medicine, finance, law, cybersecurity, and scientific reasoning.",
      },
    ],
  },
] as const;

function Arrow() {
  return <span className="guide-arrow" aria-hidden="true">↓</span>;
}

function StageHeading({ number, children }: { number: string; children: React.ReactNode }) {
  return <div className="guide-stage-heading"><span>{number}</span><h2>{children}</h2></div>;
}

export function LlmJudgeValidationGuide() {
  return <article className="doc-article judge-guide">
    <header className="judge-guide-header">
      <p className="eyebrow">SafeFlow documentation</p>
      <h1>How LLM Judge Validation Works</h1>
      <p className="docs-lead">Understand the roles, evidence flows, and validation process behind human evaluation of automated LLM judges.</p>
      <div className="guide-intro">
        <p>LLM judges can evaluate model outputs quickly and at scale, but their decisions are themselves model outputs and require validation.</p>
        <p>Judge validation compares automated evaluations against independent human evidence—and, when available, an adjudicated reference set—to determine where an automated evaluator can and cannot be trusted.</p>
      </div>
    </header>

    <section aria-labelledby="guide-roles">
      <h2 id="guide-roles">Who participates in a judge-validation study?</h2>
      <p>No single participant is automatically the source of truth. Each role contributes different evidence or governance.</p>
      <div className="guide-role-groups">
        {roleGroups.map((group) => <section key={group.title}>
          <p className="guide-group-label">{group.title}</p>
          <div className="guide-role-grid">
            {group.roles.map((role) => <article className="guide-card" key={role.title}>
              <div className="guide-card-title"><h3>{role.title}</h3>{"short" in role && <span>{role.short}</span>}</div>
              <p><strong>What it does:</strong> {role.description}</p>
              <p>{role.details}</p>
            </article>)}
          </div>
        </section>)}
      </div>
    </section>

    <section className="guide-process-section" aria-labelledby="guide-process">
      <p className="eyebrow">The complete evidence flow</p>
      <h2 id="guide-process">Independent evaluation before comparison</h2>
      <p>The judge and human evaluator operate in parallel. The judge does not pass its decision to the human evaluator.</p>
      <div className="judge-process" role="img" aria-label="Evaluation inputs pass through the System Under Evaluation to model responses. Responses are independently evaluated by an LLM Judge and a blinded Human Evaluator. Human evaluation is finalized before intentional unblinding, judge validation, diagnosis, improvement, and re-evaluation.">
        <div className="process-node process-source"><span>Evaluation inputs</span></div><Arrow />
        <div className="process-node process-sue"><small>System</small><strong>System Under Evaluation</strong></div><Arrow />
        <div className="process-node"><span>Model responses</span></div>
        <div className="process-split" aria-hidden="true"><span>↙</span><span>↘</span></div>
        <div className="process-lanes">
          <div className="process-lane judge-lane"><small>Automated evaluation</small><strong>LLM Judge</strong><span>Judge evaluation retained separately</span></div>
          <div className="process-lane human-lane"><small>Human validation</small><strong>Human Evaluator</strong><span>Blinded review</span><span aria-hidden="true">↓</span><span>Human finalization</span></div>
        </div>
        <div className="process-merge" aria-hidden="true"><span>↘</span><span>↙</span></div>
        <div className="process-node process-unblind"><small>Deliberate transition</small><strong>Intentional unblinding</strong></div><Arrow />
        <div className="process-node"><strong>Judge validation</strong></div><Arrow />
        <div className="process-loop"><span>Diagnose</span><b aria-hidden="true">→</b><span>Improve</span><b aria-hidden="true">→</b><span>Re-evaluate</span><b className="loop-return" aria-hidden="true">↺</b></div>
      </div>
    </section>

    <section>
      <StageHeading number="1">Define what is being evaluated</StageHeading>
      <p>Evaluation evidence may come from standardized benchmarks, custom test suites, red-team tests, regression tests, sampled production interactions, or historical production data. Human reviewers and automated judges must evaluate against a defined construct, rubric, or expected behavior.</p>
      <div className="guide-example-grid">
        <article><h3>Safety</h3><p>Does the response materially enable prohibited behavior?</p></article>
        <article><h3>Factuality</h3><p>Is the claim supported by available evidence?</p></article>
        <article><h3>Task performance</h3><p>Did the system successfully complete the requested task?</p></article>
      </div>
    </section>

    <section className="reference-section" aria-labelledby="reference-set">
      <div className="optional-heading"><span>Optional</span><h2 id="reference-set">Establish a reference set</h2></div>
      <p>Some studies begin with an existing trusted reference set. Others develop one through independent human review and adjudication.</p>
      <div className="reference-flow" role="img" aria-label="Human Evaluator A and Human Evaluator B independently review an item, followed by disagreement review, adjudication, and a reference label.">
        <div className="reference-reviewers"><span>Human Evaluator A</span><span>Human Evaluator B</span></div>
        <div className="reference-join" aria-hidden="true"><span>↘</span><span>↙</span></div>
        <div className="reference-steps"><span>Disagreement review</span><b aria-hidden="true">→</b><span>Adjudication</span><b aria-hidden="true">→</b><span>Reference label</span></div>
      </div>
      <aside className="guide-callout"><strong>A human annotation is not automatically a gold-standard label.</strong> An adjudicated reference is a separate research artifact with its own process and provenance.</aside>
    </section>

    <section>
      <StageHeading number="2">Evaluate the System Under Evaluation</StageHeading>
      <div className="compact-flow" aria-label="Inputs flow to the System Under Evaluation, which produces responses or behaviors"><span>Inputs</span><b>→</b><span>System Under Evaluation</span><b>→</b><span>Responses / behaviors</span></div>
      <p>The evaluation population should be identifiable and reproducible where possible. Useful provenance includes system version, prompt, configuration, timestamp, benchmark version, and deployment configuration.</p>
    </section>

    <section>
      <StageHeading number="3">Evaluate responses independently</StageHeading>
      <div className="independent-lanes">
        <article>
          <p className="guide-group-label">Automated evaluation</p><h3>LLM Judge</h3>
          <p>The automated evaluator scores the response using the specified rubric.</p>
          <strong>Store</strong><ul><li>Judge score</li><li>Judge reasoning</li><li>Judge configuration</li><li>Relevant metadata</li></ul>
        </article>
        <article>
          <p className="guide-group-label">Human validation</p><h3>Human Evaluator</h3>
          <p>The human independently evaluates the same response.</p>
          <strong>Store</strong><ul><li>Human score and confidence</li><li>Reasoning and evidence</li><li>Review flag</li></ul>
          <div className="human-learning-flow"><span>Training</span><b>→</b><span>Calibration</span><b>→</b><span>Production validation</span></div>
        </article>
      </div>
      <aside className="critical-reminder"><strong>The human should normally remain blinded to the automated judge result during independent validation.</strong></aside>
      <dl className="training-definitions"><div><dt>Training</dt><dd>Teaches the benchmark and provides feedback.</dd></div><div><dt>Calibration</dt><dd>Measures whether the reviewer can apply the rubric consistently.</dd></div><div><dt>Production validation</dt><dd>Produces the independent human evidence used in the study.</dd></div></dl>
      <p>Training answers should not be treated as production-validation results.</p>
    </section>

    <section>
      <StageHeading number="4">Finalize the human evaluation</StageHeading>
      <div className="compact-flow finalization-flow"><span>Editable human annotations</span><b>→</b><span>Review</span><b>→</b><span>Finalization</span><b>→</b><span>Immutable human-validation snapshot</span></div>
      <p><strong>Finalization freezes the human evidence before automated judge results are revealed.</strong> The snapshot may preserve score, confidence, reasoning, evidence, annotation revision, benchmark or rubric version, provenance, and timestamp.</p>
    </section>

    <section>
      <StageHeading number="5">Compare human and automated evaluations</StageHeading>
      <div className="comparison-equation"><span>Finalized Human Validation</span><b>+</b><span>LLM Judge Evaluation</span><b>→</b><strong>Judge Validation</strong></div>
      <p>SafeFlow can measure exact agreement, confusion matrix, Cohen&apos;s κ, weighted κ, mean absolute error, directional bias, severe disagreements, category-specific reliability, and item-level disagreement.</p>
      <p><a href="/docs/methodology">Learn how SafeFlow reports judge reliability →</a></p>

      <div className="three-way-panel">
        <div><p className="guide-group-label">When a reference set exists</p><h3>Three independent comparisons</h3><p>A reference set is useful but not required.</p></div>
        <div className="three-way-diagram" aria-label="Reference, Human, and LLM Judge form three comparison points"><span>Reference</span><span>Human</span><span>LLM Judge</span></div>
        <ul><li>Does the human agree with the reference?</li><li>Does the judge agree with the reference?</li><li>Do human and judge disagree?</li><li>Where are disagreements concentrated?</li></ul>
      </div>
    </section>

    <section>
      <StageHeading number="6">Determine what failed</StageHeading>
      <p>A disagreement does not automatically mean the System Under Evaluation is the problem. It identifies evidence to investigate.</p>
      <div className="diagnostic-grid">
        <article><h3>System Under Evaluation</h3><p>The evaluated model or system may need improvement.</p></article>
        <article><h3>LLM Judge</h3><p>The evaluator may misunderstand or inconsistently apply the rubric.</p></article>
        <article><h3>Benchmark / Rubric</h3><p>The evaluation criteria may be ambiguous or incomplete.</p></article>
        <article><h3>Human Process</h3><p>Reviewers may need better training, calibration, or adjudication.</p></article>
        <article><h3>Deployment / Controls</h3><p>The production system may need stronger monitoring, guardrails, escalation, or human oversight.</p></article>
      </div>
    </section>

    <section>
      <StageHeading number="7">Use the evidence to improve the system</StageHeading>
      <p>Interventions depend on what failed.</p>
      <div className="intervention-grid">
        <article><h3>System or model interventions</h3><ul><li>Supervised fine-tuning</li><li>Reinforcement learning with human feedback</li><li>Reinforcement learning with AI feedback where appropriate</li><li>Prompt or system-instruction changes</li><li>Retrieval improvements</li><li>Tool restrictions or guardrail changes</li><li>Deployment configuration changes</li></ul></article>
        <article><h3>Evaluation interventions</h3><ul><li>Improve the judge prompt</li><li>Change the judge model</li><li>Route weak categories to humans</li><li>Improve the benchmark rubric</li><li>Improve human training</li><li>Add adjudication</li></ul></article>
      </div>
      <div className="iteration-loop" aria-label="Diagnose, improve, re-evaluate, and validate again in a continuing loop"><span>Diagnose</span><b>→</b><span>Improve</span><b>→</b><span>Re-evaluate</span><b>→</b><span>Validate again</span><b>↺</b></div>
    </section>

    <section className="human-ai-section">
      <p className="eyebrow">Forward-looking operating model</p>
      <h2>Human and AI evaluation can work together</h2>
      <p>Judge validation does not necessarily imply replacing the LLM judge with humans. A validated judge system may let an LLM handle most cases while routing selected cases to human review.</p>
      <div className="human-ai-flow"><span>LLM handles most cases</span><b>→</b><span>Selected cases</span><b>→</b><span>Human review</span></div>
      <p>Selection may be based on high-risk categories, known judge weaknesses, disagreement, uncertainty, change from baseline, or a sampling strategy.</p>
    </section>

    <aside className="key-principle">
      <p>The goal is not to prove that an LLM judge is perfect.</p>
      <strong>The goal is to understand where it is reliable, where it fails, and what level of human oversight is needed for the intended use.</strong>
    </aside>

    <section className="guide-cta">
      <h2>See the process in practice</h2>
      <div><a className="primary-link" href="/training/air-bench-2024">Start AIR-BENCH Training</a><a className="button-link secondary-link" href="/settings/data">Validate a Dataset</a></div>
      <a href="/docs/methodology">View Judge Validation Methodology →</a>
    </section>
  </article>;
}
