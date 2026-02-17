import type { UiAction } from './Input';
import { DistrictType, LevelData, TileType } from './Level';
import { LeaderboardEntry } from './Leaderboard';

interface UiHitTarget {
  key: UiAction;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiState {
  levelLabel: string;
  displayDate: string;
  wallBudget: number;
  placementsRemaining: number;
  score: number;
  floodedTiles: number;
  totalTiles: number;
  hoverX: number;
  hoverY: number;
  timeMs: number;
  hasContainedArea: boolean;
  leaderboardOpen: boolean;
  leaderboardLoading: boolean;
  leaderboardError: string | null;
  leaderboardEntries: LeaderboardEntry[];
  scoreSubmitted: boolean;
  scoreSubmitting: boolean;
  submitModalOpen: boolean;
  submitNameDraft: string;
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

    this.drawTopBar(ui);

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
    if (ui.leaderboardOpen) this.drawLeaderboardPanel(ui);
    if (ui.submitModalOpen) this.drawSubmitModal(ui);

    if (ui.hoverX >= 0 && !ui.submitModalOpen) {
      ctx.strokeStyle = '#f3f6ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.offsetX + ui.hoverX * this.gridSize + 1, this.offsetY + ui.hoverY * this.gridSize + 1, this.gridSize - 2, this.gridSize - 2);
    }
  }

  private drawTopBar(ui: UiState): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#0a1222';
    ctx.fillRect(0, 0, this.width, 56);
    ctx.fillStyle = '#dbe5ff';
    ctx.font = '600 15px Inter, system-ui, sans-serif';
    ctx.fillText(`Level ${ui.levelLabel}`, 16, 23);

    const used = Math.max(0, ui.wallBudget - ui.placementsRemaining);
    this.drawSandbagBadge(16, 30, 118, 20, used, ui.wallBudget);

    ctx.fillStyle = '#dbe5ff';
    ctx.font = '500 14px Inter, system-ui, sans-serif';
    ctx.fillText(`Score ${ui.score}`, 150, 45);

    const floodedPct = Math.round((ui.floodedTiles / Math.max(1, ui.totalTiles)) * 100);
    ctx.fillStyle = floodedPct < 45 ? '#6de8a5' : floodedPct < 70 ? '#ffd978' : '#ff8d7e';
    ctx.fillText(`Flooded ${floodedPct}%`, 250, 45);

    ctx.fillStyle = '#e6eeff';
    ctx.font = '600 13px Inter, system-ui, sans-serif';
    const textWidth = ctx.measureText(ui.displayDate).width;
    ctx.fillText(ui.displayDate, this.width - textWidth - 18, 33);
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
    const label = ui.scoreSubmitting ? 'Submitting…' : ui.scoreSubmitted ? 'Score submitted' : 'Submit score';
    const action: UiAction = ui.scoreSubmitted ? 'toggle_leaderboard' : 'submit_score';
    this.drawButton(this.width * 0.5 - 84, this.height - 54, 168, 34, label, action, ui.scoreSubmitted ? '#28426c' : '#2b5f3e');
  }

  private drawLeaderboardToggle(ui: UiState): void {
    const label = ui.leaderboardOpen ? 'Close board' : 'Leaderboard';
    this.drawButton(this.width - 130, 76, 116, 30, label, ui.leaderboardOpen ? 'close_leaderboard' : 'toggle_leaderboard', '#24324b');
  }

  private drawLeaderboardPanel(ui: UiState): void {
    const ctx = this.ctx;
    const panelW = Math.min(450, this.width - 140);
    const panelH = Math.min(410, this.height - 150);
    const x = this.width - panelW - 20;
    const y = 112;
    const colRank = x + 18;
    const colWho = x + 56;
    const colScore = x + 130;
    const colFlood = x + 208;
    const colBags = x + 282;
    const colTime = x + 356;

    const headerY = y + 50;
    const bodyTop = y + 62;

    ctx.fillStyle = 'rgba(34, 45, 64, 0.95)';
    roundRect(ctx, x, y, panelW, panelH, 12);
    ctx.fill();
    ctx.strokeStyle = '#7f9ed1';
    ctx.stroke();

    ctx.fillStyle = '#edf3ff';
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    ctx.fillText('Flood Leaderboard', x + 16, y + 28);

    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.fillText('#', colRank, headerY);
    ctx.fillText('Who', colWho, headerY);
    ctx.fillText('Score', colScore, headerY);
    ctx.fillText('Flood%', colFlood, headerY);
    ctx.fillText('Bags', colBags, headerY);
    ctx.fillText('Time', colTime, headerY);

    ctx.strokeStyle = 'rgba(170, 197, 240, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 12, bodyTop);
    ctx.lineTo(x + panelW - 12, bodyTop);
    ctx.stroke();

    const separators = [colWho - 12, colScore - 12, colFlood - 12, colBags - 12, colTime - 12];
    for (const sx of separators) {
      ctx.beginPath();
      ctx.moveTo(sx, y + 38);
      ctx.lineTo(sx, y + panelH - 14);
      ctx.stroke();
    }

    if (ui.leaderboardLoading) {
      ctx.fillStyle = '#dbe7ff';
      ctx.fillText('Loading leaderboard…', x + 16, y + 86);
      return;
    }
    if (ui.leaderboardError) {
      ctx.fillStyle = '#ffb5b5';
      ctx.fillText(ui.leaderboardError, x + 16, y + 86);
      return;
    }

    let rowY = y + 86;
    const maxRows = Math.min(11, ui.leaderboardEntries.length);
    for (let i = 0; i < maxRows; i += 1) {
      const e = ui.leaderboardEntries[i];
      const sec = Math.round(e.time_spent_ms / 1000);
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.fillRect(x + 12, rowY - 14, panelW - 24, 20);
      }
      ctx.fillStyle = '#eaf1ff';
      ctx.font = '500 12px Inter, system-ui, sans-serif';
      ctx.fillText(String(i + 1), colRank, rowY);
      ctx.fillText(e.nickname, colWho, rowY);
      ctx.fillText(String(e.score), colScore, rowY);
      ctx.fillText(String(e.flooded_pct), colFlood, rowY);
      ctx.fillText(`${e.bags_used}/${e.wall_budget}`, colBags, rowY);
      ctx.fillText(`${sec}s`, colTime, rowY);
      rowY += 24;
    }
  }

  private drawSubmitModal(ui: UiState): void {
    const ctx = this.ctx;
    const overlay = 'rgba(8, 12, 20, 0.52)';
    const modalW = Math.min(320, this.width - 40);
    const modalH = 168;
    const x = (this.width - modalW) * 0.5;
    const y = (this.height - modalH) * 0.5;

    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = '#2c3f5f';
    roundRect(ctx, x, y, modalW, modalH, 12);
    ctx.fill();
    ctx.strokeStyle = '#8db2e6';
    ctx.stroke();

    ctx.fillStyle = '#eff5ff';
    ctx.font = '600 16px Inter, system-ui, sans-serif';
    ctx.fillText('Submit score', x + 16, y + 28);
    ctx.font = '500 13px Inter, system-ui, sans-serif';
    ctx.fillText('Who (3 letters)', x + 16, y + 56);

    ctx.fillStyle = '#122137';
    roundRect(ctx, x + 16, y + 64, modalW - 32, 38, 8);
    ctx.fill();
    ctx.strokeStyle = '#5c7faf';
    ctx.stroke();

    const value = ui.submitNameDraft || '___';
    ctx.fillStyle = '#e8f1ff';
    ctx.font = '600 22px monospace';
    ctx.fillText(value.padEnd(3, '_').slice(0, 3), x + 26, y + 90);

    this.drawButton(x + 16, y + modalH - 48, 98, 30, 'Cancel', 'submit_score_cancel', '#37475f');
    this.drawButton(x + modalW - 114, y + modalH - 48, 98, 30, ui.scoreSubmitting ? 'Saving…' : 'Submit', 'submit_score_confirm', '#2d6e4a');
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
