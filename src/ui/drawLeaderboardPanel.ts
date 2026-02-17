import type { UiState } from './types';
import { roundRect } from './roundRect';

export function drawLeaderboardPanel(ctx: CanvasRenderingContext2D, width: number, height: number, ui: UiState): void {
  const panelW = Math.min(450, width - 140);
  const panelH = Math.min(410, height - 150);
  const x = width - panelW - 20;
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
