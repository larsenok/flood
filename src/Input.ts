export interface InputState {
  hoverX: number;
  hoverY: number;
}

export interface InputCallbacks {
  onCellPrimary: (x: number, y: number) => void;
  onRestart: () => void;
  onUndo: () => void;
  onNewMap: () => void;
  onSubmitScore: () => void;
  onToggleLeaderboard: () => void;
  onCloseLeaderboard: () => void;
}

export type UiAction = 'restart' | 'undo' | 'new_map' | 'submit_score' | 'toggle_leaderboard' | 'close_leaderboard';

export class InputController {
  state: InputState = { hoverX: -1, hoverY: -1 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly callbacks: InputCallbacks,
    private readonly getCellAt: (px: number, py: number) => { x: number; y: number } | null,
    private readonly getUiActionAt: (px: number, py: number) => UiAction | null,
  ) {
    canvas.addEventListener('mousemove', this.onPointerMove);
    canvas.addEventListener('mouseleave', this.onPointerLeave);
    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('touchstart', this.onTouch, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
  }

  destroy(): void {
    this.canvas.removeEventListener('mousemove', this.onPointerMove);
    this.canvas.removeEventListener('mouseleave', this.onPointerLeave);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('touchstart', this.onTouch);
    window.removeEventListener('keydown', this.onKeyDown);
  }

  private onPointerMove = (ev: MouseEvent): void => {
    const cell = this.getCellAt(ev.clientX, ev.clientY);
    if (!cell) {
      this.state.hoverX = -1;
      this.state.hoverY = -1;
      return;
    }
    this.state.hoverX = cell.x;
    this.state.hoverY = cell.y;
  };

  private onPointerLeave = (): void => {
    this.state.hoverX = -1;
    this.state.hoverY = -1;
  };

  private onClick = (ev: MouseEvent): void => {
    if (this.triggerUiAction(ev.clientX, ev.clientY)) {
      return;
    }
    const cell = this.getCellAt(ev.clientX, ev.clientY);
    if (cell) this.callbacks.onCellPrimary(cell.x, cell.y);
  };

  private onTouch = (ev: TouchEvent): void => {
    ev.preventDefault();
    const touch = ev.changedTouches.item(0);
    if (!touch) return;
    if (this.triggerUiAction(touch.clientX, touch.clientY)) {
      return;
    }
    const cell = this.getCellAt(touch.clientX, touch.clientY);
    if (cell) this.callbacks.onCellPrimary(cell.x, cell.y);
  };

  private triggerUiAction(px: number, py: number): boolean {
    const action = this.getUiActionAt(px, py);
    if (!action) {
      return false;
    }
    if (action === 'restart') this.callbacks.onRestart();
    else if (action === 'undo') this.callbacks.onUndo();
    else if (action === 'new_map') this.callbacks.onNewMap();
    else if (action === 'submit_score') this.callbacks.onSubmitScore();
    else if (action === 'toggle_leaderboard') this.callbacks.onToggleLeaderboard();
    else if (action === 'close_leaderboard') this.callbacks.onCloseLeaderboard();
    return true;
  }

  private onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === 'r' || ev.key === 'R') {
      this.callbacks.onRestart();
      return;
    }
    if (ev.key === 'z' || ev.key === 'Z') {
      this.callbacks.onUndo();
      return;
    }
    if (ev.key === 'n' || ev.key === 'N') {
      this.callbacks.onNewMap();
      return;
    }
    if (ev.key === 'l' || ev.key === 'L') {
      this.callbacks.onToggleLeaderboard();
    }
  };
}
