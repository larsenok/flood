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
      return parseLevel(raw, dateKey);
    }
  } catch {
    // fallback to generator
  }
  return generateLevel(dateKey);
}

function generateLevel(dateKey: string): LevelData {
  const width = 16;
  const height = 16;
  const total = width * height;
  const rng = new SeededRng(hashStringToInt(dateKey));
  const tiles = new Uint8Array(total);
  tiles.fill(TileType.LAND);

  const riverX = rng.int(2, width - 2);
  for (let y = 0; y < height; y += 1) {
    const x = Math.max(1, Math.min(width - 2, riverX + Math.floor((rng.next() - 0.5) * 3)));
    tiles[y * width + x] = TileType.WATER;
    if (rng.next() < 0.45) {
      const nx = Math.max(0, Math.min(width - 1, x + (rng.next() < 0.5 ? -1 : 1)));
      tiles[y * width + nx] = TileType.WATER;
    }
  }

  for (let i = 0; i < 12; i += 1) {
    const x = rng.int(0, width);
    const y = rng.int(0, height);
    const index = y * width + x;
    if (tiles[index] === TileType.LAND) {
      tiles[index] = TileType.ROCK;
    }
  }

  const outflowY = rng.int(0, height);
  tiles[outflowY * width + (width - 1)] = TileType.OUTFLOW;

  const districts: LevelData['districts'] = [];
  for (let i = 0; i < 22; i += 1) {
    const x = rng.int(0, width);
    const y = rng.int(0, height);
    const tile = tiles[y * width + x];
    if (tile !== TileType.LAND) {
      continue;
    }
    const roll = rng.next();
    const type = roll < 0.6 ? 'HOME' : roll < 0.8 ? 'HOSPITAL' : 'POWER_STATION';
    districts.push({ type, x, y });
  }

  return {
    date: dateKey,
    width,
    height,
    wallBudget: 12,
    tiles,
    districts,
  };
}
