# Flood Control Engineer

A daily browser puzzle where water pushes in from the map boundary and rivers, and you place limited levees to save the largest dry area and protect key districts.

## Tech
- TypeScript
- HTML5 Canvas (single canvas)
- Vite

## Run locally
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
```

Vite outputs production files to `dist/`, which can be deployed directly to Vercel as a static site.

## Controls
- Click / tap land tile: place/remove levee
- **R**: restart
- **Z**: undo
- **N**: new daily level

Top bar shows level date, placements remaining, score, and flood coverage percent.
