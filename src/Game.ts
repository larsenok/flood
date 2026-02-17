import { InputController } from './Input';
import { fetchLeaderboard, LeaderboardEntry, submitScore } from './Leaderboard';
import { LevelData, TileType, idx } from './Level';
import { loadDailyLevel, loadRandomLevel } from './LevelLoader';
import { Renderer } from './Renderer';
import { SimResult, runSimulation } from './Simulation';
import { handleSubmitNameKey } from './submitNameInput';
import { formatDisplayDate, toDateKey } from './utils';

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
  private submitModalOpen = false;
  private submitNameDraft = '';
  private copyScoreLabel = 'Copy score';

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
        onSubmitScore: () => this.openSubmitModal(),
        onSubmitScoreConfirm: () => void this.handleSubmitScore(),
        onSubmitScoreCancel: () => this.closeSubmitModal(),
        onCopyScore: () => void this.copySubmittedScore(),
        onToggleLeaderboard: () => void this.toggleLeaderboard(),
        onCloseLeaderboard: () => this.closeLeaderboard(),
        onKeyDown: (ev) => this.onKeyDown(ev),
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
    window.removeEventListener('resize', this.onResize);
  }

  private async loadLevel(dateKey = toDateKey()): Promise<void> {
    this.level = await loadDailyLevel(dateKey);
    this.resetBoardState();
    this.applyHashState();
    this.recompute();
  }

  private async newMap(): Promise<void> {
    this.level = await loadRandomLevel(toDateKey());
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
    this.submitModalOpen = false;
    this.submitNameDraft = '';
    this.copyScoreLabel = 'Copy score';
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
    this.submitModalOpen = false;
    this.submitNameDraft = '';
    this.copyScoreLabel = 'Copy score';
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
    if (this.submitModalOpen) return;
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

  private openSubmitModal(): void {
    if (!this.sim.hasContainedArea || this.scoreSubmitting || this.scoreSubmitted) return;
    this.submitNameDraft = this.submitNameDraft.slice(0, 3);
    this.submitModalOpen = true;
  }

  private closeSubmitModal(): void {
    this.submitModalOpen = false;
  }

  private async handleSubmitScore(): Promise<void> {
    if (!this.submitModalOpen || !this.sim.hasContainedArea || this.scoreSubmitting || this.scoreSubmitted) return;
    const nickname = this.normalizeNickname(this.submitNameDraft);
    this.scoreSubmitting = true;
    this.leaderboardError = null;
    try {
      const bagsUsed = this.countPlaced();
      const floodedTiles = this.countFlooded(this.sim.flooded);
      const totalTiles = this.level.width * this.level.height;
      const floodedPct = this.getFloodedPct(this.sim.flooded);
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
      this.copyScoreLabel = 'Copy score';
      this.submitModalOpen = false;
      await this.loadLeaderboard();
      this.leaderboardOpen = true;
    } catch (err) {
      this.leaderboardError = err instanceof Error ? err.message : 'Failed to submit score';
    } finally {
      this.scoreSubmitting = false;
    }
  }

  private onKeyDown(ev: KeyboardEvent): boolean {
    if (!this.submitModalOpen) {
      return false;
    }
    const update = handleSubmitNameKey(ev.key, this.submitNameDraft);
    this.submitNameDraft = update.nextDraft;
    if (update.close) {
      this.closeSubmitModal();
      return true;
    }
    if (update.submit) {
      void this.handleSubmitScore();
      return true;
    }
    return update.consumed;
  }

  private normalizeNickname(raw: string): string {
    const cleaned = raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
    return cleaned.length > 0 ? cleaned.padEnd(3, 'X') : 'ANON';
  }

  private async copySubmittedScore(): Promise<void> {
    if (!this.scoreSubmitted) return;
    const floodedPct = this.getFloodedPct(this.sim.flooded);
    const shareText = `${floodedPct}% flooded · ${this.getFloodHypeText(floodedPct)}
${window.location.href}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
      } else {
        throw new Error('clipboard unavailable');
      }
      this.copyScoreLabel = 'Copied!';
    } catch {
      this.copyScoreLabel = 'Copy failed';
    }
  }

  private getFloodedPct(cells: Uint8Array): number {
    const floodedTiles = this.countFlooded(cells);
    const totalTiles = this.level.width * this.level.height;
    return Math.round((floodedTiles / Math.max(1, totalTiles)) * 100);
  }

  private getFloodHypeText(floodedPct: number): string {
    if (floodedPct <= 12) return 'Legendary flood shutdown!';
    if (floodedPct <= 25) return 'Elite barrier run!';
    if (floodedPct <= 40) return 'Strong defenses, keep pushing!';
    if (floodedPct <= 60) return 'Solid attempt, more wall tech next run!';
    if (floodedPct <= 80) return 'Chaotic waters, clutch up next game!';
    return 'The flood won this one—run it back!';
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
      displayDate: formatDisplayDate(this.level.date),
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
      copyScoreLabel: this.copyScoreLabel,
      submitModalOpen: this.submitModalOpen,
      submitNameDraft: this.submitNameDraft,
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
