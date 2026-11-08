# Managed validation: future boundary

Managed validation is explicitly outside the local-first MVP. This document records an architectural boundary; it is not a plan to add managed functionality to the current application.

## Not present

This document records an early roadmap and is not a statement of current capabilities. The application now has an optional, deployer-controlled Supabase Cloud Workspace with authentication, workspace roles, and project-level validator assignment. Local Workspace remains browser-local: its validator IDs are pseudonymous device-local identifiers, not accounts. Payments, managed-workforce administration, hidden-gold quality control, and a hosted SafeFlow synchronization service are still outside the open-source application.

## What should remain reusable

If a separate managed product is explored later, the following contracts can remain conceptually reusable:

- benchmark-pack schema and provenance rules;
- project, item, annotation, and adjudicated-annotation relationships;
- pure annotation state machine;
- structurally blinded annotation view model;
- immutable pack versions and finalized annotation revisions.

## Required future design work

A managed system would require a separate threat model, informed consent and data-processing policy, tenancy and authorization design, encryption and retention controls, assignment and adjudication protocols, append-only audit events, incident response, data residency decisions, and deletion/export guarantees.

The local application must not silently become a managed client. Any future transmission would require a distinct product mode, explicit user action and disclosure, a clearly identified destination, and tests proving that local-only projects cannot sync. Ideally, managed deployment lives behind a separate adapter or application entry point so cloud concerns cannot leak into the local storage implementation.

No managed capability should be inferred from the current `validatorId` field or future-compatible entity relationships.
