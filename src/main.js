import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { MenuScene } from './scenes/MenuScene.js';
import { GameScene } from './scenes/GameScene.js';
import { GameOverScene } from './scenes/GameOverScene.js';

// firstFrameReady already called in index.html inline script.
// This module is deferred so SDK + firstFrameReady fired before we get here.

function getGameSize() {
  const w = window.innerWidth  || 390;
  const h = window.innerHeight || 844;
  return { width: w, height: h };
}

const { width, height } = getGameSize();
const dpr = window.devicePixelRatio || 1;
const config = {
  type: Phaser.AUTO,
  width,
  height,
  parent: 'game-container',
  backgroundColor: '#030812',
   resolution: window.devicePixelRatio || 1,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: [BootScene, MenuScene, GameScene, GameOverScene],
  input: { activePointers: 2 },
  render: { antialias: true, pixelArt: false,  powerPreference: 'high-performance', roundPixels: false }
};

function startGame() {
  // YouTube Playables WebView quirk — viewport can briefly be 0
  if (window.innerHeight === 0) {
    window.addEventListener('resize', () => {
      if (window.innerHeight > 0) startGame();
    }, { once: true });
    return;
  }
  new Phaser.Game(config);
}

startGame();