import { LevelData, TileType, parseLevel } from './Level';
import { SeededRng, hashStringToInt, toDateKey } from './utils';

interface RawLevel {
  date?: string;
  size: [number, number] | number;
  wallBudget: number;
  tiles: string[];
  districts?: Array<{ type: 'HOME' | 'HOSPITAL' | 'POWER_STATION'; x: number; y: number }>;
  notes?: string;
}


export async function loadRandomLevel(seed = `random-${toDateKey()}`): Promise<LevelData> {
  return standardizeLevel(normalizeForSandbagFlow(generateLevel(seed)));
}

export async function loadDailyLevel(dateKey = toDateKey()): Promise<LevelData> {
  try {
    const response = await fetch(`/levels/${dateKey}.json`);
    if (response.ok) {
      const raw = (await response.json()) as RawLevel;
      const parsed = standardizeLevel(normalizeForSandbagFlow(parseLevel(raw, dateKey)));
      return { ...parsed, wallBudget: sandbagBudgetForDate(dateKey) };
    }
  } catch {
    // fallback to generator
  }
  const generated = standardizeLevel(normalizeForSandbagFlow(generateLevel(dateKey)));
  return { ...generated, wallBudget: sandbagBudgetForDate(dateKey) };
}

function standardizeLevel(level: LevelData): LevelData {
  if (level.width <= 14) return level;
  const cropPerSide = 1;
  const width = level.width - cropPerSide * 2;
  const height = level.height;
  const tiles = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      tiles[y * width + x] = level.tiles[y * level.width + (x + cropPerSide)];
    }
  }
  const districts = level.districts
    .map((d) => ({ ...d, x: d.x - cropPerSide }))
    .filter((d) => d.x >= 0 && d.x < width);
  return { ...level, width, height, tiles, districts };
}

function normalizeForSandbagFlow(level: LevelData): LevelData {
  const tiles = level.tiles.slice();
  for (let i = 0; i < tiles.length; i += 1) {
    if (tiles[i] === TileType.WATER || tiles[i] === TileType.OUTFLOW) {
      tiles[i] = TileType.LAND;
    }
  }
  return {
    ...level,
    tiles,
  };
}


function sandbagBudgetForDate(dateKey: string): number {
  const rng = new SeededRng(hashStringToInt(`${dateKey}-sandbags`));
  return rng.int(11, 15);
}

function generateLevel(dateKey: string): LevelData {
  const width = 14;
  const height = 16;
  const total = width * height;
  const rng = new SeededRng(hashStringToInt(dateKey));
  const tiles = new Uint8Array(total);
  tiles.fill(TileType.LAND);

  // Build mountain ridges from spaced seed points so placement looks intentional.
  const centers = selectMountainCenters(width, height, rng, rng.int(4, 6), 3);
  for (const center of centers) {
    paintMountainCluster(tiles, width, height, rng, center.x, center.y, rng.int(8, 14));
  }

  // Add a short connecting branch from some clusters to avoid isolated random pixels.
  for (let i = 0; i < centers.length; i += 1) {
    if (rng.next() > 0.55) continue;
    const from = centers[i];
    const to = centers[(i + 1) % centers.length];
    paintMountainBridge(tiles, width, height, rng, from.x, from.y, to.x, to.y, rng.int(3, 6));
  }

  smoothMountainNoise(tiles, width, height, rng);

  for (let pass = 0; pass < 2; pass += 1) {
    clearMountainLockedPockets(tiles, width, height);
  }

  // clear some guaranteed build area around the center target
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  for (let y = centerY - 2; y <= centerY + 2; y += 1) {
    for (let x = centerX - 2; x <= centerX + 2; x += 1) {
      tiles[y * width + x] = TileType.LAND;
    }
  }

  const home = { type: 'HOME' as const, x: centerX, y: centerY };
  const used = new Set<number>([home.y * width + home.x]);
  const hospitalTargets = [
    { x: centerX - 3, y: centerY - 2 },
    { x: centerX + 3, y: centerY - 1 },
    { x: centerX - 2, y: centerY + 3 },
    { x: centerX + 2, y: centerY + 3 },
  ];
  const hospitals = hospitalTargets
    .map((target) => findNearestBuildableTile(target.x, target.y, width, height, tiles, used))
    .filter((tile): tile is { x: number; y: number } => tile !== null)
    .map((tile) => ({ type: 'HOSPITAL' as const, x: tile.x, y: tile.y }));

  const districts: LevelData['districts'] = [home, ...hospitals];

  return {
    date: dateKey,
    width,
    height,
    wallBudget: sandbagBudgetForDate(dateKey),
    tiles,
    districts,
  };
}

function selectMountainCenters(
  width: number,
  height: number,
  rng: SeededRng,
  desired: number,
  minSpacing: number,
): Array<{ x: number; y: number }> {
  const centers: Array<{ x: number; y: number }> = [];
  let tries = 0;
  while (centers.length < desired && tries < 220) {
    tries += 1;
    const candidate = { x: rng.int(2, width - 2), y: rng.int(2, height - 2) };
    if (
      centers.every((c) =>
        Math.abs(c.x - candidate.x) + Math.abs(c.y - candidate.y) >= minSpacing + rng.int(0, 2),
      )
    ) {
      centers.push(candidate);
    }
  }
  if (centers.length === 0) {
    centers.push({ x: Math.floor(width / 2), y: Math.floor(height / 2) });
  }
  return centers;
}

function paintMountainCluster(
  tiles: Uint8Array,
  width: number,
  height: number,
  rng: SeededRng,
  startX: number,
  startY: number,
  size: number,
): void {
  let x = startX;
  let y = startY;
  for (let i = 0; i < size; i += 1) {
    if (x > 0 && y > 0 && x < width - 1 && y < height - 1) {
      tiles[y * width + x] = TileType.ROCK;
      if (rng.next() > 0.62 && x + 1 < width - 1) tiles[y * width + (x + 1)] = TileType.ROCK;
      if (rng.next() > 0.72 && y + 1 < height - 1) tiles[(y + 1) * width + x] = TileType.ROCK;
    }
    x = Math.max(1, Math.min(width - 2, x + rng.int(-1, 2)));
    y = Math.max(1, Math.min(height - 2, y + rng.int(-1, 2)));
  }
}

function paintMountainBridge(
  tiles: Uint8Array,
  width: number,
  height: number,
  rng: SeededRng,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  thickness: number,
): void {
  const steps = Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY));
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    const x = Math.round(fromX + (toX - fromX) * t) + rng.int(-1, 2);
    const y = Math.round(fromY + (toY - fromY) * t) + rng.int(-1, 2);
    for (let k = 0; k < thickness; k += 1) {
      const px = Math.max(1, Math.min(width - 2, x + rng.int(-1, 2)));
      const py = Math.max(1, Math.min(height - 2, y + rng.int(-1, 2)));
      tiles[py * width + px] = TileType.ROCK;
    }
  }
}

function smoothMountainNoise(tiles: Uint8Array, width: number, height: number, rng: SeededRng): void {
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = y * width + x;
      let neighbors = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          if (tiles[(y + dy) * width + (x + dx)] === TileType.ROCK) neighbors += 1;
        }
      }
      if (tiles[idx] === TileType.ROCK && neighbors <= 1) {
        tiles[idx] = TileType.LAND;
      } else if (tiles[idx] === TileType.LAND && neighbors >= 5 && rng.next() > 0.35) {
        tiles[idx] = TileType.ROCK;
      }
    }
  }
}



function clearMountainLockedPockets(tiles: Uint8Array, width: number, height: number): void {
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      if (tiles[i] !== TileType.LAND) {
        continue;
      }
      const n = tiles[(y - 1) * width + x] === TileType.ROCK;
      const s = tiles[(y + 1) * width + x] === TileType.ROCK;
      const w = tiles[y * width + (x - 1)] === TileType.ROCK;
      const e = tiles[y * width + (x + 1)] === TileType.ROCK;
      if (n && s && w && e) {
        tiles[(y - 1) * width + x] = TileType.LAND;
      }
    }
  }
}


function findNearestBuildableTile(
  targetX: number,
  targetY: number,
  width: number,
  height: number,
  tiles: Uint8Array,
  used: Set<number>,
): { x: number; y: number } | null {
  const maxRadius = Math.max(width, height);
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) {
          continue;
        }
        const x = targetX + dx;
        const y = targetY + dy;
        if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) {
          continue;
        }
        const index = y * width + x;
        if (tiles[index] === TileType.ROCK || used.has(index)) {
          continue;
        }
        used.add(index);
        return { x, y };
      }
    }
  }
  return null;
}
