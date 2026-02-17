import type { UiState } from './types';

export function drawTopBar(
  ctx: CanvasRenderingContext2D,
  width: number,
  ui: UiState,
  drawSandbagBadge: (x: number, y: number, width: number, height: number, used: number, total: number) => void,
): void {
  ctx.fillStyle = '#0a1222';
  ctx.fillRect(0, 0, width, 56);
  ctx.fillStyle = '#dbe5ff';
  ctx.font = '600 15px Inter, system-ui, sans-serif';
  ctx.fillText(`Level ${ui.levelLabel}`, 16, 23);

  const used = Math.max(0, ui.wallBudget - ui.placementsRemaining);
  drawSandbagBadge(16, 30, 118, 20, used, ui.wallBudget);

  ctx.fillStyle = '#dbe5ff';
  ctx.font = '500 14px Inter, system-ui, sans-serif';
  ctx.fillText(`Score ${ui.score}`, 150, 45);

  const floodedPct = Math.round((ui.floodedTiles / Math.max(1, ui.totalTiles)) * 100);
  ctx.fillStyle = floodedPct < 45 ? '#6de8a5' : floodedPct < 70 ? '#ffd978' : '#ff8d7e';
  ctx.fillText(`Flooded ${floodedPct}%`, 250, 45);

  ctx.fillStyle = '#e6eeff';
  ctx.font = '600 13px Inter, system-ui, sans-serif';
  const textWidth = ctx.measureText(ui.displayDate).width;
  ctx.fillText(ui.displayDate, width - textWidth - 18, 33);
}
