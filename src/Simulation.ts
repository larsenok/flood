import { LevelData, TileType } from './Level';

export interface SimResult {
  flooded: Uint8Array;
  score: number;
  dryLand: number;
  waterActive: boolean;
  hasContainedArea: boolean;
}

export function runSimulation(level: LevelData, levees: Uint8Array, buffer?: Uint8Array): SimResult {
  const total = level.width * level.height;
  const flooded = buffer && buffer.length === total ? buffer : new Uint8Array(total);
  flooded.fill(0);

  let placed = 0;
  for (let i = 0; i < levees.length; i += 1) {
    if (levees[i] === 1) {
      placed += 1;
    }
  }

  const hasContainedArea = detectContainedArea(level, levees);
  const waterActive = placed >= level.wallBudget && hasContainedArea;

  if (!waterActive) {
    return {
      flooded,
      score: 0,
      dryLand: 0,
      waterActive,
      hasContainedArea,
    };
  }

  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < total; i += 1) {
    const x = i % level.width;
    const y = Math.floor(i / level.width);
    const isBoundary = x === 0 || y === 0 || x === level.width - 1 || y === level.height - 1;
    const isWaterSource = level.tiles[i] === TileType.WATER;
    if (!isBoundary && !isWaterSource) continue;
    if (level.tiles[i] === TileType.ROCK || levees[i] !== 0) continue;
    flooded[i] = 1;
    queue[tail++] = i;
  }

  while (head < tail) {
    const index = queue[head++];

    const x = index % level.width;
    const y = Math.floor(index / level.width);

    visit(x + 1, y);
    visit(x - 1, y);
    visit(x, y + 1);
    visit(x, y - 1);
  }

  let dryLand = 0;
  for (let i = 0; i < total; i += 1) {
    if (level.tiles[i] === TileType.LAND && flooded[i] === 0 && levees[i] === 0) {
      dryLand += 1;
    }
  }

  let score = dryLand;
  const districtByIndex = new Map<number, 'HOME' | 'HOSPITAL' | 'POWER_STATION'>();
  for (let i = 0; i < level.districts.length; i += 1) {
    const d = level.districts[i];
    districtByIndex.set(d.y * level.width + d.x, d.type);
    const cellFlooded = flooded[d.y * level.width + d.x] === 1;
    if (d.type === 'HOME' && !cellFlooded) {
      score += 3;
    } else if (d.type === 'HOSPITAL' && !cellFlooded) {
      score += 10;
    } else if (d.type === 'POWER_STATION' && cellFlooded) {
      score -= 5;
    }
  }

  for (let i = 0; i < level.districts.length; i += 1) {
    const d = level.districts[i];
    if (d.type !== 'POWER_STATION') {
      continue;
    }
    const pIndex = d.y * level.width + d.x;
    if (flooded[pIndex] === 0) {
      continue;
    }
    score -= adjacentHomeCount(d.x, d.y, level.width, level.height, districtByIndex);
  }

  return { flooded, score, dryLand, waterActive, hasContainedArea };

  function visit(nx: number, ny: number): void {
    if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) {
      return;
    }
    const ni = ny * level.width + nx;
    if (flooded[ni] !== 0) {
      return;
    }
    if (level.tiles[ni] === TileType.ROCK || levees[ni] !== 0) {
      return;
    }
    flooded[ni] = 1;
    queue[tail++] = ni;
  }
}

function detectContainedArea(level: LevelData, levees: Uint8Array): boolean {
  const total = level.width * level.height;
  const reachable = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < total; i += 1) {
    const x = i % level.width;
    const y = Math.floor(i / level.width);
    const isBoundary = x === 0 || y === 0 || x === level.width - 1 || y === level.height - 1;
    if (!isBoundary || level.tiles[i] === TileType.ROCK || levees[i] !== 0) {
      continue;
    }
    reachable[i] = 1;
    queue[tail++] = i;
  }

  while (head < tail) {
    const i = queue[head++];
    const x = i % level.width;
    const y = Math.floor(i / level.width);
    walk(x + 1, y);
    walk(x - 1, y);
    walk(x, y + 1);
    walk(x, y - 1);
  }

  for (let i = 0; i < total; i += 1) {
    if (level.tiles[i] === TileType.ROCK || levees[i] !== 0) {
      continue;
    }
    if (reachable[i] === 0) {
      return true;
    }
  }

  return false;

  function walk(nx: number, ny: number): void {
    if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) {
      return;
    }
    const ni = ny * level.width + nx;
    if (reachable[ni] === 1 || level.tiles[ni] === TileType.ROCK || levees[ni] !== 0) {
      return;
    }
    reachable[ni] = 1;
    queue[tail++] = ni;
  }
}

function adjacentHomeCount(
  x: number,
  y: number,
  width: number,
  height: number,
  districtByIndex: Map<number, 'HOME' | 'HOSPITAL' | 'POWER_STATION'>,
): number {
  let homes = 0;
  if (x > 0 && districtByIndex.get(y * width + (x - 1)) === 'HOME') homes += 1;
  if (x < width - 1 && districtByIndex.get(y * width + (x + 1)) === 'HOME') homes += 1;
  if (y > 0 && districtByIndex.get((y - 1) * width + x) === 'HOME') homes += 1;
  if (y < height - 1 && districtByIndex.get((y + 1) * width + x) === 'HOME') homes += 1;
  return homes;
}
