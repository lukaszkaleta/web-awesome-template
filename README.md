## Quick start
1. Install deps
   - npm: `npm install`

2. Start dev server
   - `npm run dev`
   - Opens a local server on http://localhost:3000 (or the next free port)

3. Build for production
   - `npm run build`
   - Outputs to `dist/`

4. Preview production build (optional)
   - `npm run preview` (uses a simple static server)

## Scripts
- `npm run dev` — Bundle to `public/` and serve `public/` with watch and live reload
- `npm run build` — Bundle to `dist/` and copy static files from `public/`
- `npm run clean` — Remove build artifacts
- `npm run preview` — Serve `dist/` locally

## Project layout
```
public/
  index.html         # Your static entry HTML (served in dev; copied in build)
src/
  index.js           # App entry; imports your web components
  components/
    ....        # Components
build.mjs            # Build script using esbuild API (production)
```