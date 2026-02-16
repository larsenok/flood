import { InputController } from './Input';
import { LevelData, TileType, idx } from './Level';
import { loadDailyLevel } from './LevelLoader';
import { Renderer } from './Renderer';
import { SimResult, runSimulation } from './Simulation';
import { toDateKey } from './utils';

interface Snapshot {
  levees: Uint8Array;
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

  constructor(private readonly canvas: HTMLCanvasElement, private readonly renderer: Renderer) {}

  async init(): Promise<void> {
    await this.loadLevel();
    this.input = new InputController(
      this.canvas,
      {
        onCellPrimary: (x, y) => this.toggleLevee(x, y),
        onRestart: () => this.restart(),
        onUndo: () => this.undo(),
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
    this.levees = new Uint8Array(this.level.width * this.level.height);
    this.displayedFlooded = new Uint8Array(this.level.width * this.level.height);
    this.history = [];
    this.applyHashState();
    this.recompute();
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
      if (this.level.tiles[idxVal] !== TileType.LAND) continue;
      this.levees[idxVal] = 1;
    }
  }

  private onResize = (): void => {
    this.renderer.resize();
  };

  private restart(): void {
    this.levees.fill(0);
    this.history = [];
    this.recompute();
  }

  private undo(): void {
    const snap = this.history.pop();
    if (!snap) {
      return;
    }
    this.levees.set(snap.levees);
    this.recompute();
  }

  private toggleLevee(x: number, y: number): void {
    const i = idx(x, y, this.level.width);
    const tile = this.level.tiles[i];
    if (tile !== TileType.LAND) {
      return;
    }
    const placed = this.countPlaced();
    if (this.levees[i] === 0 && placed >= this.level.wallBudget) {
      return;
    }
    this.pushHistory();
    this.levees[i] = this.levees[i] === 1 ? 0 : 1;
    this.recompute();
  }

  private pushHistory(): void {
    this.history.push({ levees: this.levees.slice() });
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  private countPlaced(): number {
    let count = 0;
    for (let i = 0; i < this.levees.length; i += 1) {
      if (this.levees[i] === 1) {
        count += 1;
      }
    }
    return count;
  }


  private countFlooded(cells: Uint8Array): number {
    let count = 0;
    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i] === 1) {
        count += 1;
      }
    }
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
    for (let i = 0; i < this.levees.length; i += 1) {
      if (this.levees[i] === 1) {
        placed.push(i);
      }
    }
    const encoded = placed.map((v) => v.toString(36)).join('.');
    history.replaceState(null, '', `#${this.level.date}|${encoded}`);
  }

  private tick = (): void => {
    const now = performance.now();
    const animatedFlooded = this.getAnimatedFlooded(now);
    this.renderer.render(this.level, this.levees, animatedFlooded, {
      levelLabel: this.level.date,
      wallBudget: this.level.wallBudget,
      placementsRemaining: this.level.wallBudget - this.countPlaced(),
      score: this.sim.score,
      floodedTiles: this.countFlooded(animatedFlooded),
      totalTiles: this.level.width * this.level.height,
      hoverX: this.input.state.hoverX,
      hoverY: this.input.state.hoverY,
      timeMs: now,
    });
    this.raf = requestAnimationFrame(this.tick);
  };

  private getAnimatedFlooded(now: number): Uint8Array {
    if (!this.sim.waterActive || this.sim.floodOrder.length === 0) {
      this.displayedFlooded.fill(0);
      return this.displayedFlooded;
    }
    const elapsed = now - this.floodAnimStartMs;
    const cellsPerSecond = 900;
    const revealCount = Math.min(
      this.sim.floodOrder.length,
      Math.floor((elapsed / 1000) * cellsPerSecond) + 1,
    );
    this.displayedFlooded.fill(0);
    for (let i = 0; i < revealCount; i += 1) {
      this.displayedFlooded[this.sim.floodOrder[i]] = 1;
    }
    return this.displayedFlooded;
  }
}
