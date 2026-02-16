import { LevelData, TileType } from './Level';

export interface UiState {
  levelLabel: string;
  wallBudget: number;
  placementsRemaining: number;
  score: number;
  floodedTiles: number;
  totalTiles: number;
  hoverX: number;
  hoverY: number;
  timeMs: number;
}

export class Renderer {
  private readonly buttons = [
    { key: 'restart', label: 'Restart (R)' },
    { key: 'undo', label: 'Undo (Z)' },
    { key: 'new_map', label: 'New map (N)' },
  ] as const;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private gridSize = 24;
  private offsetX = 0;
  private offsetY = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas context unavailable.');
    }
    this.ctx = ctx;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * this.dpr);
    this.canvas.height = Math.floor(rect.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
  }

  getUiActionAt(px: number, py: number): 'restart' | 'undo' | 'new_map' | null {
    const startX = this.width - (this.buttons.length * 118 + 6);
    if (py < 12 || py > 42) return null;
    for (let i = 0; i < this.buttons.length; i += 1) {
      const x = startX + i * 118;
      if (px >= x && px <= x + 110) return this.buttons[i].key;
    }
    return null;
  }

  getCellAt(level: LevelData, px: number, py: number): { x: number; y: number } | null {
    const x = Math.floor((px - this.offsetX) / this.gridSize);
    const y = Math.floor((py - this.offsetY) / this.gridSize);
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) {
      return null;
    }
    return { x, y };
  }

  render(level: LevelData, levees: Uint8Array, leveePlacedAtMs: Float64Array, flooded: Uint8Array, ui: UiState): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#87b678';
    ctx.fillRect(0, 0, this.width, this.height);

    const topBarH = 56;
    const legendH = 30;
    const pad = 24;
    const availableW = this.width - pad * 2;
    const availableH = this.height - topBarH - legendH - pad * 2;
    this.gridSize = Math.floor(Math.min(availableW / level.width, availableH / level.height));
    this.offsetX = Math.floor((this.width - this.gridSize * level.width) * 0.5);
    this.offsetY = topBarH + Math.floor((this.height - topBarH - legendH - this.gridSize * level.height) * 0.5);

    this.drawTopBar(ui);

    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const i = y * level.width + x;
        const px = this.offsetX + x * this.gridSize;
        const py = this.offsetY + y * this.gridSize;
        const isBoundary = x === 0 || y === 0 || x === level.width - 1 || y === level.height - 1;
        this.drawTile(level.tiles[i], px, py, this.gridSize, flooded[i] === 1, isBoundary, ui.timeMs);
        if (levees[i] === 1) {
          this.drawLevee(px, py, this.gridSize, ui.timeMs, leveePlacedAtMs[i]);
        }
      }
    }

    for (let i = 0; i < level.districts.length; i += 1) {
      const d = level.districts[i];
      const px = this.offsetX + d.x * this.gridSize;
      const py = this.offsetY + d.y * this.gridSize;
      this.drawDistrict(d.type, px, py, this.gridSize, flooded[d.y * level.width + d.x] === 1);
    }

    this.drawGrid(level);
    this.drawLegend(topBarH + 6);

    if (ui.hoverX >= 0) {
      ctx.strokeStyle = '#f3f6ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        this.offsetX + ui.hoverX * this.gridSize + 1,
        this.offsetY + ui.hoverY * this.gridSize + 1,
        this.gridSize - 2,
        this.gridSize - 2,
      );
    }

    this.drawButtons();
  }

  private drawTopBar(ui: UiState): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a1222';
    ctx.fillRect(0, 0, this.width, 56);
    ctx.fillStyle = '#dbe5ff';
    ctx.font = '600 15px Inter, system-ui, sans-serif';
    ctx.fillText(`Level ${ui.levelLabel}`, 16, 23);

    const used = Math.max(0, ui.wallBudget - ui.placementsRemaining);
    const bagX = 16;
    const bagY = 30;
    const bagW = 118;
    const bagH = 20;
    this.drawSandbagBadge(bagX, bagY, bagW, bagH, used, ui.wallBudget);

    ctx.fillStyle = '#dbe5ff';
    ctx.font = '500 14px Inter, system-ui, sans-serif';
    ctx.fillText(`Score ${ui.score}`, 150, 45);

    const floodedPct = Math.round((ui.floodedTiles / Math.max(1, ui.totalTiles)) * 100);
    ctx.fillStyle = floodedPct < 45 ? '#6de8a5' : floodedPct < 70 ? '#ffd978' : '#ff8d7e';
    ctx.fillText(`Flooded ${floodedPct}%`, 250, 45);

  }

  private drawTile(
    type: number,
    x: number,
    y: number,
    size: number,
    flooded: boolean,
    isBoundary: boolean,
    timeMs: number,
  ): void {
    const ctx = this.ctx;
    if (type === TileType.ROCK) {
      ctx.fillStyle = '#51586a';
    } else if (type === TileType.WATER) {
      ctx.fillStyle = '#1e66d6';
    } else if (type === TileType.OUTFLOW) {
      ctx.fillStyle = '#0c3c83';
    } else {
      ctx.fillStyle = '#87b678';
    }
    ctx.fillRect(x, y, size, size);

    if (isBoundary && type === TileType.LAND && !flooded) {
      ctx.fillStyle = 'rgba(255, 250, 200, 0.16)';
      ctx.fillRect(x, y, size, size);
    }

    if (flooded && type !== TileType.ROCK) {
      const phase = timeMs * 0.0048 + x * 0.11 + y * 0.07;
      const wobble = Math.sin(phase) * 0.05;
      const alpha = 0.74 + wobble;
      ctx.fillStyle = `rgba(83, 184, 255, ${alpha})`;
      ctx.fillRect(x, y, size, size);

      const crestY = y + size * (0.32 + Math.sin(phase * 1.7) * 0.08);
      const crestY2 = y + size * (0.64 + Math.cos(phase * 1.3) * 0.07);
      ctx.strokeStyle = 'rgba(210, 242, 255, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 1, crestY);
      ctx.lineTo(x + size - 1, crestY);
      ctx.moveTo(x + 1, crestY2);
      ctx.lineTo(x + size - 1, crestY2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(190, 232, 255, 0.5)';
      ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }

    if (type === TileType.OUTFLOW) {
      ctx.strokeStyle = '#85ceff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
    }
  }

  private drawLevee(x: number, y: number, size: number, timeMs = 0, placedAtMs = 0): void {
    const ctx = this.ctx;
    const ageMs = placedAtMs > 0 ? Math.max(0, timeMs - placedAtMs) : Number.POSITIVE_INFINITY;
    const spawnAnim = ageMs === Number.POSITIVE_INFINITY ? 1 : Math.min(1, ageMs / 220);
    const pulse = (1 - spawnAnim) * Math.sin(ageMs * 0.03) * 0.06;
    const scale = 0.92 + spawnAnim * 0.08 + pulse;
    const w = size * 0.76 * scale;
    const h = size * 0.4 * scale;
    const cx = x + size * 0.5;
    const cy = y + size * 0.56;
    const left = cx - w * 0.5;
    const top = cy - h * 0.5;
    const bandH = h / 3;
    ctx.fillStyle = '#be9b69';
    ctx.fillRect(left, top, w, bandH);
    ctx.fillStyle = '#d2b283';
    ctx.fillRect(left, top + bandH, w, bandH);
    ctx.fillStyle = '#b48c5d';
    ctx.fillRect(left, top + bandH * 2, w, bandH);
    ctx.strokeStyle = '#735333';
    ctx.lineWidth = 1;
    ctx.strokeRect(left, top, w, h);
    ctx.strokeStyle = 'rgba(255, 247, 222, 0.5)';
    ctx.beginPath();
    ctx.moveTo(left + 1, top + 1);
    ctx.lineTo(left + w - 1, top + 1);
    ctx.stroke();
  }

  private drawSandbagBadge(
    x: number,
    y: number,
    width: number,
    height: number,
    used: number,
    total: number,
  ): void {
    const ctx = this.ctx;
    const radius = 10;
    ctx.fillStyle = '#1b2538';
    roundRect(ctx, x, y, width, height, radius);
    ctx.fill();
    ctx.strokeStyle = '#314766';
    ctx.stroke();

    this.drawLevee(x + 6, y - 4, 24);
    ctx.fillStyle = '#dce7ff';
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillText(`${used}/${total}`, x + 34, y + 14);
  }

  private drawDistrict(type: string, x: number, y: number, size: number, flooded: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x + size * 0.5, y + size * 0.5);
    ctx.globalAlpha = flooded ? 0.72 : 1;

    if (type === 'HOME') {
      ctx.fillStyle = '#fff5e7';
      ctx.fillRect(-size * 0.18, -size * 0.05, size * 0.36, size * 0.24);
      ctx.fillStyle = '#df5a5a';
      ctx.beginPath();
      ctx.moveTo(-size * 0.22, -size * 0.05);
      ctx.lineTo(0, -size * 0.24);
      ctx.lineTo(size * 0.22, -size * 0.05);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'HOSPITAL') {
      ctx.fillStyle = '#eef5ff';
      ctx.fillRect(-size * 0.18, -size * 0.18, size * 0.36, size * 0.36);
      ctx.fillStyle = '#ed5555';
      ctx.fillRect(-size * 0.05, -size * 0.14, size * 0.1, size * 0.28);
      ctx.fillRect(-size * 0.14, -size * 0.05, size * 0.28, size * 0.1);
    } else {
      ctx.fillStyle = '#ffd36d';
      ctx.fillRect(-size * 0.2, -size * 0.18, size * 0.4, size * 0.36);
      ctx.fillStyle = '#6b532c';
      ctx.fillRect(-size * 0.08, -size * 0.08, size * 0.16, size * 0.16);
    }

    ctx.restore();
  }

  private drawGrid(level: LevelData): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(6, 10, 16, 0.45)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= level.width; x += 1) {
      const px = this.offsetX + x * this.gridSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(px, this.offsetY);
      ctx.lineTo(px, this.offsetY + level.height * this.gridSize);
      ctx.stroke();
    }
    for (let y = 0; y <= level.height; y += 1) {
      const py = this.offsetY + y * this.gridSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(this.offsetX, py);
      ctx.lineTo(this.offsetX + level.width * this.gridSize, py);
      ctx.stroke();
    }
  }

  private drawLegend(y: number): void {
    const ctx = this.ctx;
    const items = [
      { c: '#87b678', label: 'Dry land' },
      { c: '#53b8ff', label: 'Flooded water' },
      { c: '#d0b98d', label: 'Sandbag' },
      { c: '#51586a', label: 'Mountain' },
    ];

    let x = 16;
    ctx.font = '500 12px Inter, system-ui, sans-serif';
    for (let i = 0; i < items.length; i += 1) {
      ctx.fillStyle = items[i].c;
      ctx.fillRect(x, y, 12, 12);
      ctx.strokeStyle = '#111827';
      ctx.strokeRect(x, y, 12, 12);
      ctx.fillStyle = '#cdd8f3';
      ctx.fillText(items[i].label, x + 18, y + 10);
      x += 130;
    }
  }

  private drawButtons(): void {
    const ctx = this.ctx;
    let x = this.width - (this.buttons.length * 118 + 6);
    for (let i = 0; i < this.buttons.length; i += 1) {
      ctx.fillStyle = '#1b2538';
      ctx.fillRect(x, 12, 110, 30);
      ctx.strokeStyle = '#2f4263';
      ctx.strokeRect(x, 12, 110, 30);
      ctx.fillStyle = '#dce7ff';
      ctx.font = '500 12px Inter, system-ui, sans-serif';
      ctx.fillText(this.buttons[i].label, x + 8, 31);
      x += 118;
    }
  }

}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
