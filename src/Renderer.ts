import { LevelData, TileType } from './Level';
import { easeOutCubic } from './utils';

export interface UiState {
  levelLabel: string;
  placementsRemaining: number;
  score: number;
  drainageOk: boolean;
  hoverX: number;
  hoverY: number;
  timeMs: number;
}

interface BuildAnim {
  index: number;
  startedAt: number;
}

export class Renderer {
  private readonly buttons = [
    { key: 'restart', label: 'Restart (R)' },
    { key: 'undo', label: 'Undo (Z)' },
    { key: 'new', label: 'New Game (N)' },
  ] as const;
  private readonly ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private width = 0;
  private height = 0;
  private gridSize = 24;
  private offsetX = 0;
  private offsetY = 0;
  private readonly buildAnims: BuildAnim[] = [];

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

  addBuildAnimation(index: number, now: number): void {
    this.buildAnims.push({ index, startedAt: now });
    if (this.buildAnims.length > 48) {
      this.buildAnims.shift();
    }
  }

  getUiActionAt(px: number, py: number): 'restart' | 'undo' | 'new' | null {
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

  render(level: LevelData, levees: Uint8Array, flooded: Uint8Array, ui: UiState): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const topBarH = 56;
    const pad = 24;
    const availableW = this.width - pad * 2;
    const availableH = this.height - topBarH - pad * 2;
    this.gridSize = Math.floor(Math.min(availableW / level.width, availableH / level.height));
    this.offsetX = Math.floor((this.width - this.gridSize * level.width) * 0.5);
    this.offsetY = topBarH + Math.floor((this.height - topBarH - this.gridSize * level.height) * 0.5);

    this.drawTopBar(ui);

    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const i = y * level.width + x;
        const px = this.offsetX + x * this.gridSize;
        const py = this.offsetY + y * this.gridSize;
        this.drawTile(level.tiles[i], px, py, this.gridSize, flooded[i] === 1, ui.timeMs);
        if (levees[i] === 1) {
          this.drawLevee(px, py, this.gridSize, this.getAnimScale(i, ui.timeMs));
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
    ctx.fillStyle = '#0f1523';
    ctx.fillRect(0, 0, this.width, 56);
    ctx.fillStyle = '#dbe5ff';
    ctx.font = '600 15px Inter, system-ui, sans-serif';
    ctx.fillText(`Level ${ui.levelLabel}`, 16, 23);
    ctx.font = '500 14px Inter, system-ui, sans-serif';
    ctx.fillText(`Levees ${ui.placementsRemaining}`, 16, 45);
    ctx.fillText(`Score ${ui.score}`, 150, 45);
    ctx.fillStyle = ui.drainageOk ? '#63d486' : '#ff8d7e';
    ctx.fillText(ui.drainageOk ? 'Drainage: OK' : 'Drainage: No route', 250, 45);
  }

  private drawTile(type: number, x: number, y: number, size: number, flooded: boolean, timeMs: number): void {
    const ctx = this.ctx;
    if (type === TileType.ROCK) {
      ctx.fillStyle = '#4d5566';
    } else if (type === TileType.WATER) {
      ctx.fillStyle = '#2f73d8';
    } else if (type === TileType.OUTFLOW) {
      const pulse = (Math.sin(timeMs * 0.005) + 1) * 0.5;
      ctx.fillStyle = `rgba(68, 183, 255, ${0.55 + pulse * 0.4})`;
    } else {
      ctx.fillStyle = flooded ? '#4a657f' : '#6f9b68';
    }
    ctx.fillRect(x, y, size, size);

    if (flooded && type === TileType.LAND) {
      ctx.fillStyle = 'rgba(52, 149, 255, 0.36)';
      ctx.fillRect(x, y, size, size);
    }
  }

  private drawLevee(x: number, y: number, size: number, scale: number): void {
    const ctx = this.ctx;
    const w = size * 0.74 * scale;
    const h = size * 0.36 * scale;
    const cx = x + size * 0.5;
    const cy = y + size * 0.55;
    ctx.fillStyle = '#c9b38b';
    ctx.fillRect(cx - w * 0.5, cy - h * 0.5, w, h);
    ctx.strokeStyle = '#8f7650';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - w * 0.5, cy - h * 0.5, w, h);
  }

  private drawDistrict(type: string, x: number, y: number, size: number, flooded: boolean): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x + size * 0.5, y + size * 0.5);
    ctx.globalAlpha = flooded ? 0.7 : 1;

    if (type === 'HOME') {
      ctx.fillStyle = '#f2eee1';
      ctx.fillRect(-size * 0.18, -size * 0.05, size * 0.36, size * 0.24);
      ctx.fillStyle = '#d15f5f';
      ctx.beginPath();
      ctx.moveTo(-size * 0.22, -size * 0.05);
      ctx.lineTo(0, -size * 0.24);
      ctx.lineTo(size * 0.22, -size * 0.05);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'HOSPITAL') {
      ctx.fillStyle = '#e6efff';
      ctx.fillRect(-size * 0.18, -size * 0.18, size * 0.36, size * 0.36);
      ctx.fillStyle = '#df4f4f';
      ctx.fillRect(-size * 0.05, -size * 0.14, size * 0.1, size * 0.28);
      ctx.fillRect(-size * 0.14, -size * 0.05, size * 0.28, size * 0.1);
    } else {
      ctx.fillStyle = '#f5c45d';
      ctx.fillRect(-size * 0.2, -size * 0.18, size * 0.4, size * 0.36);
      ctx.fillStyle = '#634c28';
      ctx.fillRect(-size * 0.08, -size * 0.08, size * 0.16, size * 0.16);
    }

    ctx.restore();
  }

  private drawGrid(level: LevelData): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(9, 12, 18, 0.35)';
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

  private getAnimScale(index: number, now: number): number {
    for (let i = this.buildAnims.length - 1; i >= 0; i -= 1) {
      const a = this.buildAnims[i];
      if (a.index !== index) {
        continue;
      }
      const elapsed = now - a.startedAt;
      if (elapsed > 220) {
        this.buildAnims.splice(i, 1);
        return 1;
      }
      return easeOutCubic(Math.max(0, elapsed / 220));
    }
    return 1;
  }
}
