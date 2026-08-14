import type { BenchmarkCategory, BenchmarkPack, BenchmarkSourceAuthority, ProvenanceKind } from "../core/types";
import type { TaxonomyReferenceView } from "../benchmarks/taxonomyReference";

const authorityLabels: Record<BenchmarkSourceAuthority | ProvenanceKind, string> = {
  "official-air-bench-dataset": "Official AIR-BENCH dataset",
  "official-air-2024-paper": "Official AIR 2024 taxonomy",
  "llm_eval_clean-derived": "llm_eval_clean-derived",
  "safeflow-derived": "SafeFlow-derived display",
  "official-benchmark-material": "Official benchmark material",
  "safeflow-paraphrase": "SafeFlow paraphrase",
  "safeflow-interpretation": "SafeFlow interpretation",
  "safeflow-authored-example": "SafeFlow-authored example",
  unavailable: "Unavailable",
};

export interface BenchmarkReferencePanelProps {
  category: BenchmarkCategory;
  pack: BenchmarkPack;
  reference: TaxonomyReferenceView;
  onOpen?: () => void;
}

export function BenchmarkReferencePanel({ category, pack, reference, onOpen }: BenchmarkReferencePanelProps) {
  const composite = reference.details.length > 0;
  return (
    <details className="reference-drawer" onToggle={(event) => { if (event.currentTarget.open) onOpen?.(); }}>
      <summary>Need help judging this?</summary>
      <div className="reference-content">
        <div className="reference-title">
          <span className="eyebrow">Benchmark reference</span>
          <h3>{reference.heading}</h3>
        </div>

        {composite ? (
          <dl className="composite-reference">
            {reference.details.map((detail) => (
              <div key={detail.label}>
                <dt>{detail.label}</dt>
                <dd>{detail.value}</dd>
                <span className="provenance-label">{authorityLabels[detail.provenance]}</span>
                {detail.sourceValue && <small>Source terminology: {detail.sourceValue}</small>}
              </div>
            ))}
          </dl>
        ) : (
          <dl className="taxonomy-hierarchy">
            {reference.hierarchy.map((level) => (
              <div key={level.label}>
                <dt>{level.label}</dt>
                <dd>{level.value}</dd>
                <span className="provenance-label">{authorityLabels[level.provenance]}</span>
              </div>
            ))}
          </dl>
        )}

        <details className="source-record">
          <summary>Exact source taxonomy record</summary>
          <p><strong>Level-3 encoding:</strong> {reference.sourceEncoding.id}</p>
          <p><strong>Source terminology:</strong> {reference.sourceEncoding.name}</p>
          {composite && reference.hierarchy.slice(0, 2).map((level) => (
            <p key={level.label}><strong>{level.label}:</strong> {level.value}</p>
          ))}
          <span className="provenance-label">Official AIR-BENCH dataset</span>
        </details>

        <section className="scoring-reference" aria-labelledby="scoring-reference-heading">
          <h4 id="scoring-reference-heading">AIR-BENCH generic scoring rules</h4>
          <ol>
            {(pack.reference?.genericScoringRules ?? []).map((rule, index) => (
              <li key={index}>
                <p>{rule.text}</p>
                <span className="provenance-label">{authorityLabels[rule.kind]}</span>
              </li>
            ))}
          </ol>
        </section>

        {category.rubric.kind === "unavailable" && (
          <p className="rubric-unavailable">
            {pack.reference?.categorySpecificRubricUnavailableText
              ?? "No verified official category-specific AIR-BENCH rubric is included for this category."}
          </p>
        )}
      </div>
    </details>
  );
}
