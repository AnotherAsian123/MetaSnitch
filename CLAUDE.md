# CLAUDE.md

Project conventions for Claude — behavioral guidelines to reduce common LLM
coding mistakes, followed by project-specific instructions.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## CI / builds
- **Always watch the build go green.** After any push that triggers GitHub
  Actions (pushes to `main`/`master`/dev branches, version tags, or the
  `docker-publish.yml` workflow), monitor the resulting workflow run until it
  completes.
  - If it **succeeds**, report that the new `ghcr.io/anotherasian123/unraidtube-scrapper:latest`
    image is published.
  - If it **fails**, fetch the job logs, diagnose, push a fix, and re-run until
    it is green. Do not consider the task done while CI is red.

## Logging (always a priority)
- **Every error must be logged in two variations:**
  1. **Frontend (summarised):** a short, friendly, actionable message shown in the
     UI (toast/popup), ending with a pointer like *"see the log file for full
     details."* Never dump stack traces or raw tool output at the user.
  2. **Backend (maximally detailed):** the full context — exception/traceback, the
     exact command run (secrets redacted), exit codes, and complete tool output —
     written to `CONFIG_DIR/logs/` (`unraidtube.log` + `failed_downloads.log`).
- Prefer too much backend detail over too little. When adding any new failure
  path, wire up both variations; don't let an error surface as just an ID/URL.
- The user-facing summary and the backend detail are produced together at the
  point of failure (see `downloader._summarise_error` / `_write_failure_detail`).

## Repo facts
- Application Usage: This app will be first and foremost used in an Unraid Self Hosted setting. Ensure changes made and suggested are in line with Unraid Best Practices for app development.
