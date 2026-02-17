import type { UiAction } from './Input';
import { DistrictType, LevelData, TileType } from './Level';
import { drawLeaderboardPanel } from './ui/drawLeaderboardPanel';
import { drawSubmitModal } from './ui/drawSubmitModal';
import { drawTopBar } from './ui/drawTopBar';
import { roundRect } from './ui/roundRect';
import type { UiState } from './ui/types';

interface UiHitTarget {
  key: UiAction;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type { UiState };

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
  private uiHitTargets: UiHitTarget[] = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable.');
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

  getUiActionAt(px: number, py: number): UiAction | null {
    for (let i = this.uiHitTargets.length - 1; i >= 0; i -= 1) {
      const t = this.uiHitTargets[i];
      if (px >= t.x && px <= t.x + t.width && py >= t.y && py <= t.y + t.height) return t.key;
    }
    return null;
  }

  getCellAt(level: LevelData, px: number, py: number): { x: number; y: number } | null {
    const x = Math.floor((px - this.offsetX) / this.gridSize);
    const y = Math.floor((py - this.offsetY) / this.gridSize);
    if (x < 0 || y < 0 || x >= level.width || y >= level.height) return null;
    return { x, y };
  }

  render(level: LevelData, levees: Uint8Array, leveePlacedAtMs: Float64Array, flooded: Uint8Array, ui: UiState): void {
    const ctx = this.ctx;
    this.uiHitTargets = [];
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

    drawTopBar(ctx, this.width, ui, (x, y, width, height, used, total) => this.drawSandbagBadge(x, y, width, height, used, total));

    for (let y = 0; y < level.height; y += 1) {
      for (let x = 0; x < level.width; x += 1) {
        const i = y * level.width + x;
        const px = this.offsetX + x * this.gridSize;
        const py = this.offsetY + y * this.gridSize;
        const isBoundary = x === 0 || y === 0 || x === level.width - 1 || y === level.height - 1;
        this.drawTile(level.tiles[i], px, py, this.gridSize, flooded[i] === 1, isBoundary, ui.timeMs);
        if (levees[i] === 1) this.drawLevee(px, py, this.gridSize, ui.timeMs, leveePlacedAtMs[i]);
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
    this.drawButtons();
    this.drawLeaderboardToggle(ui);
    this.drawBottomActions(ui);
    if (ui.leaderboardOpen) drawLeaderboardPanel(ctx, this.width, this.height, ui);
    if (ui.submitModalOpen) drawSubmitModal(ctx, this.width, this.height, ui, (...args) => this.drawButton(...args));

    if (ui.hoverX >= 0 && !ui.submitModalOpen) {
      ctx.strokeStyle = '#f3f6ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.offsetX + ui.hoverX * this.gridSize + 1, this.offsetY + ui.hoverY * this.gridSize + 1, this.gridSize - 2, this.gridSize - 2);
    }
  }

  private drawTile(type: number, x: number, y: number, size: number, flooded: boolean, isBoundary: boolean, timeMs: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = type === TileType.ROCK ? '#51586a' : type === TileType.WATER ? '#1e66d6' : type === TileType.OUTFLOW ? '#0c3c83' : '#87b678';
    ctx.fillRect(x, y, size, size);
    if (isBoundary && type === TileType.LAND && !flooded) {
      ctx.fillStyle = 'rgba(255, 250, 200, 0.16)';
      ctx.fillRect(x, y, size, size);
    }
    if (flooded && type !== TileType.ROCK) {
      const phase = timeMs * 0.0064 + x * 0.13 + y * 0.09;
      const wobble = Math.sin(phase) * 0.06;
      const alpha = 0.74 + wobble;
      ctx.fillStyle = `rgba(83, 184, 255, ${alpha})`;
      ctx.fillRect(x, y, size, size);

      const crestY = y + size * (0.31 + Math.sin(phase * 1.8) * 0.08);
      const crestY2 = y + size * (0.65 + Math.cos(phase * 1.35) * 0.07);
      ctx.strokeStyle = 'rgba(210, 242, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 1, crestY);
      ctx.lineTo(x + size - 1, crestY);
      ctx.moveTo(x + 1, crestY2);
      ctx.lineTo(x + size - 1, crestY2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(190, 232, 255, 0.52)';
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
    const spawnAnim = ageMs === Number.POSITIVE_INFINITY ? 1 : Math.min(1, ageMs / 520);
    const dropEase = 1 - Math.pow(1 - spawnAnim, 3);
    const bounce = Math.exp(-7 * spawnAnim) * Math.sin(spawnAnim * 16);
    const dropOffset = (1 - dropEase) * -size * 0.95;
    const settleLift = bounce * size * 0.1;
    const w = size * 0.94 * (1 + Math.max(0, bounce) * 0.06);
    const h = size * 0.54 * (1 - Math.max(0, bounce) * 0.08);
    const left = x + size * 0.5 - w * 0.5;
    const top = y + size * 0.58 - h * 0.5 + dropOffset - settleLift;

    ctx.fillStyle = 'rgba(20, 24, 32, 0.24)';
    roundRect(ctx, left + w * 0.1, top + h * 0.72, w * 0.8, h * 0.5, h * 0.3);
    ctx.fill();

    const knotInset = w * 0.07;
    const bulge = h * 0.24;
    ctx.fillStyle = '#d0b082';
    ctx.beginPath();
    ctx.moveTo(left + knotInset, top + h * 0.18);
    ctx.quadraticCurveTo(left + w * 0.5, top - bulge, left + w - knotInset, top + h * 0.18);
    ctx.quadraticCurveTo(left + w + w * 0.08, top + h * 0.56, left + w - knotInset, top + h * 0.85);
    ctx.quadraticCurveTo(left + w * 0.5, top + h + bulge * 0.5, left + knotInset, top + h * 0.85);
    ctx.quadraticCurveTo(left - w * 0.08, top + h * 0.56, left + knotInset, top + h * 0.18);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#7e5a35';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left + w * 0.22, top + h * 0.18);
    ctx.lineTo(left + w * 0.22, top + h * 0.82);
    ctx.moveTo(left + w * 0.78, top + h * 0.18);
    ctx.lineTo(left + w * 0.78, top + h * 0.82);
    ctx.stroke();
  }

  private drawSandbagBadge(x: number, y: number, width: number, height: number, used: number, total: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#1b2538';
    roundRect(ctx, x, y, width, height, 10);
    ctx.fill();
    ctx.strokeStyle = '#314766';
    ctx.stroke();
    this.drawLevee(x + 2, y - 8, 28);
    ctx.fillStyle = '#dce7ff';
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillText(`${used}/${total}`, x + 34, y + 14);
  }

  private drawDistrict(type: DistrictType, x: number, y: number, size: number, flooded: boolean): void {
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
    let x = this.width - (this.buttons.length * 118 + 6);
    for (let i = 0; i < this.buttons.length; i += 1) {
      this.drawButton(x, 12, 110, 30, this.buttons[i].label, this.buttons[i].key);
      x += 118;
    }
  }

  private drawBottomActions(ui: UiState): void {
    if (!ui.hasContainedArea) return;
    if (!ui.scoreSubmitted) {
      const label = ui.scoreSubmitting ? 'Submitting…' : 'Submit score';
      this.drawButton(this.width * 0.5 - 84, this.height - 54, 168, 34, label, 'submit_score', '#2b5f3e');
      return;
    }

    const baseY = this.height - 54;
    const statusX = this.width * 0.5 - 152;
    const statusW = 170;
    this.drawStatusChip(statusX, baseY, statusW, 34, 'Score submitted');
    this.drawButton(statusX + statusW + 10, baseY, 124, 34, ui.copyScoreLabel, 'copy_score', '#345f87');
  }

  private drawStatusChip(x: number, y: number, width: number, height: number, label: string): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#28426c';
    roundRect(ctx, x, y, width, height, 8);
    ctx.fill();
    ctx.strokeStyle = '#3f5f8d';
    ctx.stroke();
    ctx.fillStyle = '#dce7ff';
    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.fillText(label, x + 10, y + 20);
  }

  private drawLeaderboardToggle(ui: UiState): void {
    const label = ui.leaderboardOpen ? 'Close board' : 'Leaderboard';
    this.drawButton(this.width - 130, 76, 116, 30, label, ui.leaderboardOpen ? 'close_leaderboard' : 'toggle_leaderboard', '#24324b');
  }

  private drawButton(x: number, y: number, width: number, height: number, label: string, key: UiAction, fill = '#1b2538'): void {
    const ctx = this.ctx;
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, width, height, 8);
    ctx.fill();
    ctx.strokeStyle = '#2f4263';
    ctx.stroke();
    ctx.fillStyle = '#dce7ff';
    ctx.font = '500 12px Inter, system-ui, sans-serif';
    ctx.fillText(label, x + 8, y + 19);
    this.uiHitTargets.push({ key, x, y, width, height });
  }
}
