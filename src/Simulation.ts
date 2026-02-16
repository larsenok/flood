import { LevelData, TileType } from './Level';

export interface SimResult {
  flooded: Uint8Array;
  floodOrder: Int32Array;
  score: number;
  dryLand: number;
  waterActive: boolean;
  hasContainedArea: boolean;
}

export function runSimulation(level: LevelData, levees: Uint8Array, buffer?: Uint8Array): SimResult {
  const total = level.width * level.height;
  const flooded = buffer && buffer.length === total ? buffer : new Uint8Array(total);
  flooded.fill(0);
  const floodOrder = new Int32Array(total);
  const blocked = computeBlockedMask(level, levees);

  const hasContainedArea = detectContainedArea(level, levees);
  const waterActive = hasContainedArea;

  if (!waterActive) {
    return {
      flooded,
      floodOrder: floodOrder.subarray(0, 0),
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
    if (blocked[i] === 1) continue;
    flooded[i] = 1;
    floodOrder[tail] = i;
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

  return { flooded, floodOrder: floodOrder.subarray(0, tail), score, dryLand, waterActive, hasContainedArea };

  function visit(nx: number, ny: number): void {
    if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) {
      return;
    }
    const ni = ny * level.width + nx;
    if (flooded[ni] !== 0) {
      return;
    }
    if (blocked[ni] === 1) {
      return;
    }
    flooded[ni] = 1;
    floodOrder[tail] = ni;
    queue[tail++] = ni;
  }
}

function detectContainedArea(level: LevelData, levees: Uint8Array): boolean {
  const blockedWithLevees = computeBlockedMask(level, levees);
  const blockedRocksOnly = computeBlockedMask(level, undefined, false);
  const reachableWithLevees = computeReachableFromBoundary(level, blockedWithLevees);
  const reachableRocksOnly = computeReachableFromBoundary(level, blockedRocksOnly);

  for (let i = 0; i < level.districts.length; i += 1) {
    const district = level.districts[i];
    if (district.type !== 'HOME') {
      continue;
    }
    const districtIndex = district.y * level.width + district.x;
    const enclosedNow = reachableWithLevees[districtIndex] === 0;
    const wasOpenWithoutLevees = reachableRocksOnly[districtIndex] === 1;
    if (enclosedNow && wasOpenWithoutLevees) {
      return true;
    }
  }

  return false;
}

function computeReachableFromBoundary(level: LevelData, blocked: Uint8Array): Uint8Array {
  const total = level.width * level.height;
  const reachable = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  for (let i = 0; i < total; i += 1) {
    const x = i % level.width;
    const y = Math.floor(i / level.width);
    const isBoundary = x === 0 || y === 0 || x === level.width - 1 || y === level.height - 1;
    if (!isBoundary || blocked[i] === 1) {
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

  return reachable;

  function walk(nx: number, ny: number): void {
    if (nx < 0 || ny < 0 || nx >= level.width || ny >= level.height) {
      return;
    }
    const ni = ny * level.width + nx;
    if (reachable[ni] === 1 || blocked[ni] === 1) {
      return;
    }
    reachable[ni] = 1;
    queue[tail++] = ni;
  }
}


function computeBlockedMask(level: LevelData, levees?: Uint8Array, applyCornerClosure = true): Uint8Array {
  const total = level.width * level.height;
  const blocked = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    if (level.tiles[i] === TileType.ROCK || (levees && levees[i] !== 0)) {
      blocked[i] = 1;
    }
  }

  if (applyCornerClosure) {
    for (let y = 0; y < level.height - 1; y += 1) {
      for (let x = 0; x < level.width - 1; x += 1) {
        const a = y * level.width + x;
        const b = (y + 1) * level.width + (x + 1);
        if (blocked[a] === 1 && blocked[b] === 1) {
          blocked[y * level.width + (x + 1)] = 1;
          blocked[(y + 1) * level.width + x] = 1;
        }

        const c = y * level.width + (x + 1);
        const d = (y + 1) * level.width + x;
        if (blocked[c] === 1 && blocked[d] === 1) {
          blocked[y * level.width + x] = 1;
          blocked[(y + 1) * level.width + (x + 1)] = 1;
        }
      }
    }
  }

  return blocked;
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
