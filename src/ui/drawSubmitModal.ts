import type { DrawButton, UiState } from './types';
import { roundRect } from './roundRect';

export function drawSubmitModal(ctx: CanvasRenderingContext2D, width: number, height: number, ui: UiState, drawButton: DrawButton): void {
  const overlay = 'rgba(8, 12, 20, 0.52)';
  const modalW = Math.min(320, width - 40);
  const modalH = 168;
  const x = (width - modalW) * 0.5;
  const y = (height - modalH) * 0.5;

  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, width, height);

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

  drawButton(x + 16, y + modalH - 48, 98, 30, 'Cancel', 'submit_score_cancel', '#37475f');
  drawButton(x + modalW - 114, y + modalH - 48, 98, 30, ui.scoreSubmitting ? 'Saving…' : 'Submit', 'submit_score_confirm', '#2d6e4a');
}
