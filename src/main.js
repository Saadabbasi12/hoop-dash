import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';

/**
 * Responsive sizing: fills the full viewport on every device.
 * On desktop this means the full browser window.
 * On mobile portrait it fills the screen edge-to-edge.
 * A sensible max-width keeps it from becoming unplayable on ultra-wide monitors.
 */
function getGameSize() {
  const w = window.innerWidth  || 390;
  const h = window.innerHeight || 844;
  // Always use full viewport — RESIZE mode handles dynamic changes
  return { width: w, height: h };
}

const { width, height } = getGameSize();

const config = {
  type: Phaser.AUTO,
  width,
  height,
  parent: 'game-container',              // matches index.html div id
  backgroundColor: '#0a0a1a',
  scale: {
    mode: Phaser.Scale.RESIZE,         // always fill available space
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
  input: { activePointers: 2 },
  render: { antialias: true, pixelArt: false, roundPixels: false }
};

function startGame() {
  // YouTube Playables WebView quirk — viewport height can briefly be 0
  if (window.innerHeight === 0) {
    window.addEventListener('resize', () => {
      if (window.innerHeight > 0) startGame();
    }, { once: true });
    return;
  }

  const game = new Phaser.Game(config);

  // Expose for debugging
  if (typeof window !== 'undefined') {
    window._mirrorDashGame = game;
  }
}

startGame();