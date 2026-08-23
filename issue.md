# Implementation Plan: LiveOverlay Core Features (Settings & UI)

## Objective
Implement the core settings management and dual-interface (Control Panel & Overlay) for the LiveOverlay project using Bun, ElysiaJS, Tailwind CSS, and GSAP.

## Backend Requirements (`src/index.ts`)
Update the existing ElysiaJS server to include a settings API:

1. **Static Files**: Ensure the server continues to serve static files from the `public/` directory (already configured with `@elysiajs/static`).
2. **Settings API**:
   - Create a `GET /api/settings` route. This route should read from a local file named `settings.json`. If `settings.json` does not exist, create it with default data (e.g., `{"tiktokUsername": "", "runningText": ""}`) and return the default data.
   - Create a `POST /api/settings` route. This route should accept JSON data from the frontend, parse it, and save (overwrite) it into `settings.json`. Ensure it returns a success response (e.g., `{"success": true}`).
   - *Note for AI*: Use Bun's native File I/O (`Bun.file()`, `Bun.write()`) for reading and writing `settings.json`.

## Frontend Requirements (`public/`)

### 1. Control Panel (`public/gui.html`)
Create an HTML file acting as the dashboard for the overlay:
- **Styling**: Include Tailwind CSS via CDN (`<script src="https://cdn.tailwindcss.com"></script>`).
- **UI Elements**:
  - Build a clean form with two input fields: "Username TikTok" and "Running Text".
  - Add a "Save" button.
- **Logic (JavaScript)**:
  - On page load, optionally fetch `GET /api/settings` to pre-fill the form inputs.
  - On "Save" button click, prevent default submission, gather the input values, and send them via `fetch()` to `POST /api/settings` with a JSON body.
  - Provide a simple visual indicator (e.g., displaying a "Saved!" text briefly) upon a successful POST request.

### 2. Overlay Interface (`public/overlay.html`)
Create an HTML file meant to be loaded into OBS or streaming software as a browser source:
- **Styling**: Make the page background transparent and text color white (`body { background: transparent; color: white; }`). Include Tailwind CSS via CDN if needed for layout.
- **Data Loading**:
  - On page load, execute a `fetch()` call to `GET /api/settings` to retrieve the saved "Username TikTok" and "Running Text" values.
  - Inject these retrieved values into designated DOM elements on the screen.
- **Animation (GSAP)**:
  - Include GSAP via CDN (`<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>`).
  - Add a smooth entrance animation for the text elements (e.g., fading in and sliding up) to trigger right after the data has been loaded and injected into the DOM.

## Execution Notes for AI
- Focus on clean, functional implementation.
- You can overwrite or modify `src/index.ts` to add the new routes.
- The project already has Bun and ElysiaJS set up. Just add the required logic and HTML files.
