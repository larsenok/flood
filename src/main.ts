import { Game } from './Game';
import { Renderer } from './Renderer';

const app = document.getElementById('app');
if (!app) {
  throw new Error('App root not found.');
}

const canvas = document.createElement('canvas');
app.appendChild(canvas);

const renderer = new Renderer(canvas);
const game = new Game(canvas, renderer);

void game.init();

window.addEventListener('beforeunload', () => game.destroy());
