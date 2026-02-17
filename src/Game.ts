import { InputController } from './Input';
import { fetchLeaderboard, LeaderboardEntry, submitScore } from './Leaderboard';
import { LevelData, TileType, idx } from './Level';
import { loadDailyLevel, loadRandomLevel } from './LevelLoader';
import { Renderer } from './Renderer';
import { SimResult, runSimulation } from './Simulation';
import { toDateKey } from './utils';

interface Snapshot {
  levees: Uint8Array;
  leveePlacedAtMs: Float64Array;
}

export class Game {
  private level!: LevelData;
  private levees = new Uint8Array(0);
  private sim!: SimResult;
  private input!: InputController;
  private history: Snapshot[] = [];
  private readonly maxHistory = 10;
  private raf = 0;
  private displayedFlooded = new Uint8Array(0);
  private floodAnimStartMs = 0;
  private leveePlacedAtMs = new Float64Array(0);
  private firstPlacementAtMs: number | null = null;
  private scoreSubmitting = false;
  private scoreSubmitted = false;
  private leaderboardOpen = false;
  private leaderboardLoading = false;
  private leaderboardError: string | null = null;
  private leaderboardEntries: LeaderboardEntry[] = [];
  private nicknameDialog: HTMLDivElement | null = null;

  constructor(private readonly canvas: HTMLCanvasElement, private readonly renderer: Renderer) {}

  async init(): Promise<void> {
    await this.loadLevel();
    this.input = new InputController(
      this.canvas,
      {
        onCellPrimary: (x, y) => this.toggleLevee(x, y),
        onRestart: () => this.restart(),
        onUndo: () => this.undo(),
        onNewMap: () => this.newMap(),
        onSubmitScore: () => void this.handleSubmitScore(),
        onToggleLeaderboard: () => void this.toggleLeaderboard(),
        onCloseLeaderboard: () => this.closeLeaderboard(),
      },
      (px, py) => this.renderer.getCellAt(this.level, px, py),
      (px, py) => this.renderer.getUiActionAt(px, py),
    );
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.tick();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.input.destroy();
    this.removeNicknameDialog();
    window.removeEventListener('resize', this.onResize);
  }

  private async loadLevel(dateKey = toDateKey()): Promise<void> {
    this.level = await loadDailyLevel(dateKey);
    this.resetBoardState();
    this.applyHashState();
    this.recompute();
  }

  private async newMap(): Promise<void> {
    this.level = await loadRandomLevel();
    this.resetBoardState();
    this.recompute();
  }

  private resetBoardState(): void {
    this.levees = new Uint8Array(this.level.width * this.level.height);
    this.displayedFlooded = new Uint8Array(this.level.width * this.level.height);
    this.leveePlacedAtMs = new Float64Array(this.level.width * this.level.height);
    this.history = [];
    this.firstPlacementAtMs = null;
    this.scoreSubmitting = false;
    this.scoreSubmitted = false;
    this.leaderboardOpen = false;
    this.leaderboardError = null;
  }

  private applyHashState(): void {
    const raw = window.location.hash.slice(1);
    if (!raw) return;
    const [dateKey, encoded] = raw.split('|');
    if (dateKey !== this.level.date || !encoded) return;
    this.levees.fill(0);
    const pieces = encoded.split('.').filter(Boolean);
    for (let i = 0; i < pieces.length; i += 1) {
      const idxVal = Number.parseInt(pieces[i], 36);
      if (!Number.isFinite(idxVal) || idxVal < 0 || idxVal >= this.levees.length) continue;
      if (!this.canPlaceAtIndex(idxVal)) continue;
      this.levees[idxVal] = 1;
    }
  }

  private onResize = (): void => this.renderer.resize();

  private restart(): void {
    this.levees.fill(0);
    this.leveePlacedAtMs.fill(0);
    this.history = [];
    this.firstPlacementAtMs = null;
    this.scoreSubmitted = false;
    this.recompute();
  }

  private undo(): void {
    const snap = this.history.pop();
    if (!snap) return;
    this.levees.set(snap.levees);
    this.leveePlacedAtMs.set(snap.leveePlacedAtMs);
    if (this.countPlaced() === 0) this.firstPlacementAtMs = null;
    this.recompute();
  }

  private canPlaceAtIndex(i: number): boolean {
    if (this.level.tiles[i] !== TileType.LAND) return false;
    for (let j = 0; j < this.level.districts.length; j += 1) {
      const d = this.level.districts[j];
      if ((d.type === 'HOME' || d.type === 'HOSPITAL') && d.y * this.level.width + d.x === i) {
        return false;
      }
    }
    return true;
  }

  private toggleLevee(x: number, y: number): void {
    const i = idx(x, y, this.level.width);
    if (!this.canPlaceAtIndex(i)) return;
    const placed = this.countPlaced();
    if (this.levees[i] === 0 && placed >= this.level.wallBudget) return;
    this.pushHistory();
    if (this.levees[i] === 1) {
      this.levees[i] = 0;
      this.leveePlacedAtMs[i] = 0;
      if (this.countPlaced() === 0) this.firstPlacementAtMs = null;
    } else {
      this.levees[i] = 1;
      const now = performance.now();
      this.leveePlacedAtMs[i] = now;
      if (this.firstPlacementAtMs === null) this.firstPlacementAtMs = now;
    }
    this.recompute();
  }

  private async handleSubmitScore(): Promise<void> {
    if (!this.sim.hasContainedArea || this.scoreSubmitting || this.scoreSubmitted) return;
    const nicknameInput = await this.promptNickname();
    if (nicknameInput === null) return;
    const nickname = this.normalizeNickname(nicknameInput);
    this.scoreSubmitting = true;
    this.leaderboardError = null;
    try {
      const bagsUsed = this.countPlaced();
      const floodedTiles = this.countFlooded(this.sim.flooded);
      const totalTiles = this.level.width * this.level.height;
      const floodedPct = Math.round((floodedTiles / Math.max(1, totalTiles)) * 100);
      const elapsedMs = this.firstPlacementAtMs === null ? 0 : Math.max(0, Math.round(performance.now() - this.firstPlacementAtMs));
      await submitScore({
        nickname,
        level_date: this.level.date,
        score: this.sim.score,
        flooded_pct: floodedPct,
        bags_used: bagsUsed,
        wall_budget: this.level.wallBudget,
        dry_land: this.sim.dryLand,
        flooded_tiles: floodedTiles,
        total_tiles: totalTiles,
        time_spent_ms: elapsedMs,
      });
      this.scoreSubmitted = true;
      await this.loadLeaderboard();
      this.leaderboardOpen = true;
    } catch (err) {
      this.leaderboardError = err instanceof Error ? err.message : 'Failed to submit score';
    } finally {
      this.scoreSubmitting = false;
    }
  }


  private async promptNickname(): Promise<string | null> {
    this.removeNicknameDialog();
    const host = this.canvas.parentElement ?? document.body;
    const dialog = document.createElement('div');
    dialog.style.position = 'fixed';
    dialog.style.inset = '0';
    dialog.style.display = 'flex';
    dialog.style.alignItems = 'center';
    dialog.style.justifyContent = 'center';
    dialog.style.background = 'rgba(5, 10, 18, 0.66)';
    dialog.style.zIndex = '50';

    const card = document.createElement('div');
    card.style.width = 'min(320px, calc(100vw - 40px))';
    card.style.padding = '16px';
    card.style.borderRadius = '12px';
    card.style.background = '#101b2f';
    card.style.border = '1px solid #39527c';
    card.style.boxShadow = '0 12px 30px rgba(0, 0, 0, 0.4)';

    const title = document.createElement('h3');
    title.textContent = 'Submit score';
    title.style.margin = '0 0 8px';
    title.style.color = '#dce7ff';
    title.style.font = '600 16px Inter, system-ui, sans-serif';

    const note = document.createElement('p');
    note.textContent = 'Enter 3-letter nickname (blank = ANON)';
    note.style.margin = '0 0 12px';
    note.style.color = '#b9caef';
    note.style.font = '500 12px Inter, system-ui, sans-serif';

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 3;
    input.autocomplete = 'off';
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    input.style.padding = '10px';
    input.style.borderRadius = '8px';
    input.style.border = '1px solid #314766';
    input.style.background = '#0a1222';
    input.style.color = '#dce7ff';
    input.style.font = '600 14px Inter, system-ui, sans-serif';

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '8px';
    actions.style.marginTop = '12px';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.style.padding = '8px 12px';
    cancel.style.borderRadius = '8px';
    cancel.style.border = '1px solid #3b4f70';
    cancel.style.background = '#19263d';
    cancel.style.color = '#dce7ff';
    cancel.style.cursor = 'pointer';

    const submit = document.createElement('button');
    submit.type = 'button';
    submit.textContent = 'Submit';
    submit.style.padding = '8px 12px';
    submit.style.borderRadius = '8px';
    submit.style.border = '1px solid #357750';
    submit.style.background = '#2b5f3e';
    submit.style.color = '#e7ffe7';
    submit.style.cursor = 'pointer';

    actions.append(cancel, submit);
    card.append(title, note, input, actions);
    dialog.append(card);
    host.append(dialog);
    this.nicknameDialog = dialog;

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    input.focus();

    return await new Promise<string | null>((resolve) => {
      let finished = false;
      const finish = (value: string | null): void => {
        if (finished) return;
        finished = true;
        document.removeEventListener('keydown', onKeyDown);
        this.removeNicknameDialog();
        resolve(value);
      };

      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
        } else if (event.key === 'Enter') {
          event.preventDefault();
          finish(input.value);
        }
      };

      document.addEventListener('keydown', onKeyDown);
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) finish(null);
      });
      cancel.addEventListener('click', () => finish(null));
      submit.addEventListener('click', () => finish(input.value));
    });
  }

  private removeNicknameDialog(): void {
    if (!this.nicknameDialog) return;
    this.nicknameDialog.remove();
    this.nicknameDialog = null;
  }

  private normalizeNickname(raw: string): string {
    const cleaned = raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    return cleaned.length > 0 ? cleaned.padEnd(3, 'X') : 'ANON';
  }

  private async toggleLeaderboard(): Promise<void> {
    this.leaderboardOpen = !this.leaderboardOpen;
    if (this.leaderboardOpen && this.leaderboardEntries.length === 0) await this.loadLeaderboard();
  }

  private closeLeaderboard(): void {
    this.leaderboardOpen = false;
  }

  private async loadLeaderboard(): Promise<void> {
    this.leaderboardLoading = true;
    this.leaderboardError = null;
    try {
      this.leaderboardEntries = await fetchLeaderboard(this.level.date);
    } catch (err) {
      this.leaderboardError = err instanceof Error ? err.message : 'Failed to load leaderboard';
    } finally {
      this.leaderboardLoading = false;
    }
  }

  private pushHistory(): void {
    this.history.push({ levees: this.levees.slice(), leveePlacedAtMs: this.leveePlacedAtMs.slice() });
    if (this.history.length > this.maxHistory) this.history.shift();
  }

  private countPlaced(): number {
    let count = 0;
    for (let i = 0; i < this.levees.length; i += 1) if (this.levees[i] === 1) count += 1;
    return count;
  }

  private countFlooded(cells: Uint8Array): number {
    let count = 0;
    for (let i = 0; i < cells.length; i += 1) if (cells[i] === 1) count += 1;
    return count;
  }

  private recompute(): void {
    this.sim = runSimulation(this.level, this.levees, this.sim?.flooded);
    this.floodAnimStartMs = performance.now();
    this.displayedFlooded.fill(0);
    this.updateHash();
  }

  private updateHash(): void {
    const placed: number[] = [];
    for (let i = 0; i < this.levees.length; i += 1) if (this.levees[i] === 1) placed.push(i);
    const encoded = placed.map((v) => v.toString(36)).join('.');
    history.replaceState(null, '', `#${this.level.date}|${encoded}`);
  }

  private tick = (): void => {
    const now = performance.now();
    const animatedFlooded = this.getAnimatedFlooded(now);
    this.renderer.render(this.level, this.levees, this.leveePlacedAtMs, animatedFlooded, {
      levelLabel: this.level.date,
      isNarrowScreen: window.innerWidth <= 640,
      wallBudget: this.level.wallBudget,
      placementsRemaining: this.level.wallBudget - this.countPlaced(),
      score: this.sim.score,
      floodedTiles: this.countFlooded(animatedFlooded),
      totalTiles: this.level.width * this.level.height,
      hoverX: this.input.state.hoverX,
      hoverY: this.input.state.hoverY,
      timeMs: now,
      hasContainedArea: this.sim.hasContainedArea,
      leaderboardOpen: this.leaderboardOpen,
      leaderboardLoading: this.leaderboardLoading,
      leaderboardError: this.leaderboardError,
      leaderboardEntries: this.leaderboardEntries,
      scoreSubmitted: this.scoreSubmitted,
      scoreSubmitting: this.scoreSubmitting,
    });
    this.raf = requestAnimationFrame(this.tick);
  };

  private getAnimatedFlooded(now: number): Uint8Array {
    if (!this.sim.waterActive || this.sim.floodOrder.length === 0) {
      this.displayedFlooded.fill(0);
      return this.displayedFlooded;
    }
    const elapsed = now - this.floodAnimStartMs;
    const steps = Math.min(this.sim.floodOrder.length, Math.floor(elapsed / 8) + 1);
    this.displayedFlooded.fill(0);
    for (let i = 0; i < steps; i += 1) this.displayedFlooded[this.sim.floodOrder[i]] = 1;
    return this.displayedFlooded;
  }
}
