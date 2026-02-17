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
  return normalizeForSandbagFlow(generateLevel(seed));
}

export async function loadDailyLevel(dateKey = toDateKey()): Promise<LevelData> {
  try {
    const response = await fetch(`/levels/${dateKey}.json`);
    if (response.ok) {
      const raw = (await response.json()) as RawLevel;
      return normalizeForSandbagFlow(parseLevel(raw, dateKey));
    }
  } catch {
    // fallback to generator
  }
  return normalizeForSandbagFlow(generateLevel(dateKey));
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

function generateLevel(dateKey: string): LevelData {
  const width = 16;
  const height = 16;
  const total = width * height;
  const rng = new SeededRng(hashStringToInt(dateKey));
  const tiles = new Uint8Array(total);
  tiles.fill(TileType.LAND);

  // strategic mountain clusters
  const clusters = 7;
  for (let c = 0; c < clusters; c += 1) {
    const cx = rng.int(2, width - 2);
    const cy = rng.int(2, height - 2);
    const clusterSize = rng.int(6, 11);
    for (let i = 0; i < clusterSize; i += 1) {
      const x = Math.max(1, Math.min(width - 2, cx + rng.int(-2, 3)));
      const y = Math.max(1, Math.min(height - 2, cy + rng.int(-2, 3)));
      tiles[y * width + x] = TileType.ROCK;
    }
  }

  // sprinkle extra mountain tiles so there are many viable enclosure options
  for (let i = 0; i < 18; i += 1) {
    const x = rng.int(1, width - 1);
    const y = rng.int(1, height - 1);
    tiles[y * width + x] = TileType.ROCK;
  }

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
    wallBudget: 16,
    tiles,
    districts,
  };
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
