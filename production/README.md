# Chapple Works — Production Pipeline V0.1

Goal: turn a short business idea into a tested, documented, reusable product with minimal user prompts.

## Stages
1. **Capture:** write a product brief from a conversation, transcript or rough idea. Unknowns remain explicitly marked.
2. **Specify:** define users, jobs-to-be-done, screens, data, integrations, permissions, acceptance tests, ownership, and $0 operating constraints.
3. **Build:** create a working prototype in an isolated project directory; never overwrite another client's work.
4. **Verify:** run applicable checks, review mobile and desktop behavior, confirm links and persistence, and record test evidence.
5. **Review:** ask the owner only for decisions that cannot safely be inferred, credentials, permissions, or final acceptance.
6. **Package:** versioned deliverables, documentation, known limitations, source links, ownership/reuse terms, and product catalog record.

## Non-negotiables
- No paid services without explicit approval.
- Do not put private business data, client information, API keys, or credentials in this public repository.
- Never touch another business's repositories or accounts.
- Do not claim tests or integrations work unless verified.
- Client-specific content is not automatically licensed for resale.
- Use GitHub for public demo source only; a secure authenticated backend is required before real customer data.
- Keep a single source of truth for each product, with statuses: idea, specified, building, testing, review, released.

## First automation milestone
Use the GitHub issue form `Product build request` to capture a minimal brief in one submission. The builder then derives a spec, implementation plan and acceptance tests without repeatedly asking for routine choices. This is **workflow standardization**, not autonomous AI execution. Fully automatic build/test/deploy requires additional runner and permissions.
