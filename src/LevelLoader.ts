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
  const clusters = 4;
  for (let c = 0; c < clusters; c += 1) {
    const cx = rng.int(2, width - 2);
    const cy = rng.int(2, height - 2);
    const clusterSize = rng.int(4, 8);
    for (let i = 0; i < clusterSize; i += 1) {
      const x = Math.max(1, Math.min(width - 2, cx + rng.int(-1, 2)));
      const y = Math.max(1, Math.min(height - 2, cy + rng.int(-1, 2)));
      tiles[y * width + x] = TileType.ROCK;
    }
  }

  // clear some guaranteed build area around the center target
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);
  for (let y = centerY - 2; y <= centerY + 2; y += 1) {
    for (let x = centerX - 2; x <= centerX + 2; x += 1) {
      tiles[y * width + x] = TileType.LAND;
    }
  }

  const districts: LevelData['districts'] = [
    { type: 'HOME', x: centerX, y: centerY },
    { type: 'HOSPITAL', x: centerX - 3, y: centerY - 2 },
    { type: 'HOSPITAL', x: centerX + 3, y: centerY - 1 },
    { type: 'HOSPITAL', x: centerX - 2, y: centerY + 3 },
    { type: 'HOSPITAL', x: centerX + 2, y: centerY + 3 },
  ];

  return {
    date: dateKey,
    width,
    height,
    wallBudget: 14,
    tiles,
    districts,
  };
}
