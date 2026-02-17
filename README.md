# Flooded

A daily browser puzzle where water pushes in from the map boundary, and you place limited sandbags to save the largest dry area and protect key items.

## Tech
- TypeScript
- HTML5 Canvas (single canvas)
- Vite
- Supabase (leaderboard via REST)

## Controls
- Click / tap land tile: place/remove sandbag
- You **cannot** place on HOME or HOSPITAL tiles

Top bar shows level date, placements remaining, score, and flood coverage percent.

## Score submit flow
- Once a HOME is contained, a **Submit score** button appears near the bottom.
- Blank nickname submits as `ANON`.
- Time spent is measured from your first placed sandbag until submit.
- After submit, you can open the side leaderboard panel.
