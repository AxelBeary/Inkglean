# Product Model Discussions & REQ Batch Writing

Learned from REQ-023 multi-style pricing model session (2026-08-02).

## Product Model Discussions (REQ-level design, not feature patches)

When the user engages in product model design (e.g. multi-style pricing restructure):

1. **Present ALL decision points at once** with real-world metaphors (milk tea shop, specialty store). User confirmed: "你整个出来我一起看". Never drip-feed decisions one by one.
2. **User gives extremely structured critiques** — numbered points, edge cases, arbitrage analysis, concrete counter-proposals. This is NOT rejection; it's collaborative refinement. Accept every valid point immediately, don't defend the old design.
3. **Propose v1/v2 phasing proactively** — user appreciates when you say "this is real but v1 only does X, full engine in v2". They will confirm or adjust. Never try to build the complete system in v1.
4. **Confirm the final model verbally before writing the REQ** — summarize the agreed structure in one message, get "很好" or corrections, THEN write the doc. Writing before confirming wastes a full REQ rewrite.
5. **User's metaphors ARE the spec** — "奶茶店先选喝哪款再选大小杯" directly maps to data model hierarchy. Don't translate into UX jargon; keep the metaphor in the REQ as the user's original words.

## REQ Batch Writing

When dispatched to write multiple REQs in one batch:

1. Read the dispatch comms file + feedback source doc FIRST, then check existing REQ numbering (`docs/requirements/` + `docs/archive/requirements/`).
2. Write ALL files in one parallel batch (write_file calls are independent). Don't serialize.
3. Each REQ must have: background, user quotes (verbatim for hard constraints), feature description, acceptance criteria ("当……时，应该……"), effort estimate, dependencies, open questions.
4. Single commit for the whole batch: `docs(req): REQ-0XX~0YY 简述`. Push immediately.
5. For "user must participate" REQs (product model redesign), mark status 🟡 and write open questions instead of fake acceptance criteria. Upgrade to 🟢 only after user confirms.

## Key Anti-Patterns

- Don't propose a "simple" model and expect the user to accept it — they WILL find the edge cases (arbitrage, quantity controls, template inheritance). Propose the simple version but pre-identify the gaps yourself.
- Don't use checkboxes (复选框) for addons that have quantity/variant semantics — user explicitly called this out.
- Don't force uniform structure on simple users — single-style artists should see a flat model (退化), not be forced through a two-level hierarchy.
