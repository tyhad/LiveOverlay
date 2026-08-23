# Implementation Plan: Dead Code Cleanup & Security Note Clarification

## Objective
Clean up unused legacy client assets/scripts from the previous boilerplate landing page and clarify security configuration in the documentation.

## Tasks

### 1. Dead Code & Build Script Cleanup
- **Remove Dead Files**:
  - Delete `src/client/app.ts` (legacy GSAP hero animation script).
  - Delete `public/js/app.js` (and the `public/js/` folder if empty).
- **Update `package.json` Scripts**:
  - Remove `"build:js"` script.
  - Simplify `"build"` script from `"bun run build:css && bun run build:js"` to `"bun run build:css"`.
- **Dependency Cleanup (Optional)**:
  - If `gsap` is only loaded via CDN in `overlay.html` and not bundled by Bun, ensure package dependencies in `package.json` accurately reflect the project state.

### 2. Documentation Update (`README.md`)
- **Clarify `SETTINGS_SECRET` Behavior**:
  - Add an explicit note in the **Konfigurasi & Keamanan** section stating that `SETTINGS_SECRET` is **optional**.
  - Clearly explain that if `SETTINGS_SECRET` is not configured in `.env`, the `POST /api/settings` endpoint remains accessible without authentication (relying only on loopback `127.0.0.1` restriction), so users are aware that authentication is opt-in.

## Execution Notes for AI
- Make sure existing commands like `bun run build` and `bun run dev` continue to work without errors.
- Keep `README.md` clean and easy to follow.
