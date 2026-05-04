# Claude Code Instructions

- Read the files related to the task before answering. Do not assume.
- Shared local DB is `portal_db` on `localhost:5432`.
- Schemas:
  - `talos`: `dev_talos_us`, `dev_talos_uk`
  - `atlas`: `dev_atlas`
  - `xplan`: `dev_xplan`
  - `kairos`: `chronos`
  - `sso`: `auth`
- Connection strings live in each app's `.env.local`.
- No `||` fallback logic. Let the code fail.
- Do not add unnecessary error handling or optional behavior.
- Run the relevant checks before opening a PR.
- Branch names use the app prefix, for example `talos/...`, `xplan/...`, `atlas/...`.
- PR titles use app scope and the Claude tag, for example `fix(talos): ... [claude]`.
- Do not suggest hard refresh. Check the in-app version badge and the deploy state instead.
- UI should stay clean, dense, professional, and fast. Use the existing Targon theme and avoid flashy styling.
