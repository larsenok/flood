export type DistrictType = 'HOME' | 'HOSPITAL' | 'POWER_STATION';

export const enum TileType {
  LAND = 0,
  WATER = 1,
  ROCK = 2,
  OUTFLOW = 3,
}

export interface District {
  type: DistrictType;
  x: number;
  y: number;
}

export interface LevelData {
  date: string;
  width: number;
  height: number;
  wallBudget: number;
  tiles: Uint8Array;
  districts: District[];
  notes?: string;
}

interface RawLevel {
  date?: string;
  size: [number, number] | number;
  wallBudget: number;
  tiles: string[];
  districts?: District[];
  notes?: string;
}

const TILE_CHAR_TO_TYPE: Record<string, TileType> = {
  L: TileType.LAND,
  W: TileType.WATER,
  R: TileType.ROCK,
  O: TileType.OUTFLOW,
};

export function parseLevel(raw: RawLevel, date: string): LevelData {
  const [width, height] = Array.isArray(raw.size) ? raw.size : [raw.size, raw.size];
  if (!Number.isInteger(width) || !Number.isInteger(height)) {
    throw new Error('Invalid level size.');
  }
  if (raw.tiles.length !== height) {
    throw new Error(`Level tile rows mismatch. expected=${height} got=${raw.tiles.length}`);
  }
  const tiles = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = raw.tiles[y];
    if (row.length !== width) {
      throw new Error(`Level tile width mismatch at row=${y}`);
    }
    for (let x = 0; x < width; x += 1) {
      const char = row[x];
      const type = TILE_CHAR_TO_TYPE[char];
      if (type === undefined) {
        throw new Error(`Unsupported tile '${char}' at (${x}, ${y}).`);
      }
      tiles[y * width + x] = type;
    }
  }

  const districts = (raw.districts ?? []).filter((d) => {
    if (d.x < 0 || d.x >= width || d.y < 0 || d.y >= height) {
      return false;
    }
    if (d.type === 'HOSPITAL' && tiles[d.y * width + d.x] === TileType.ROCK) {
      return false;
    }
    return true;
  });

  return {
    date: raw.date ?? date,
    width,
    height,
    wallBudget: raw.wallBudget,
    tiles,
    districts,
    notes: raw.notes,
  };
}

export function idx(x: number, y: number, width: number): number {
  return y * width + x;
}
