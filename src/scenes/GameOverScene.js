import Phaser from 'phaser';
import { YTPlayables } from '../utils/YTPlayables.js';
import { soundManager } from '../utils/SoundManager.js';
import gameoverbgUrl from '../assets/gameoverbg.png';

export class GameOverScene extends Phaser.Scene {
  constructor() { super({ key: 'GameOverScene' }); }

  init(data) {
    this.finalScore = data.score     || 0;
    this.bestScore  = data.bestScore || 0;
    this.baskets    = data.baskets   || 0;
  }

  preload() {
    this.load.image('gameoverbg', gameoverbgUrl);
  }

  create() {
    const W   = this.scale.width;
    const H   = this.scale.height;
    const S   = Math.min(W, H);
    const DPR = Math.min(window.devicePixelRatio || 1, 3);

    this.cameras.main.setBackgroundColor('#030812');

    // ── BACKGROUND ────────────────────────────────────────────────────────
    if (this.textures.exists('gameoverbg')) {
      const texSrc = this.textures.get('gameoverbg').source[0];
      const texW   = texSrc.width  || texSrc.naturalWidth  || 1;
      const texH   = texSrc.height || texSrc.naturalHeight || 1;
      try { this.textures.get('gameoverbg').setFilter(Phaser.Textures.FilterMode.LINEAR); } catch (e) {}
      const cover = Math.max(W / texW, H / texH);
      const bgImg = this.add.image(W / 2, H / 2, 'gameoverbg')
        .setDisplaySize(Math.ceil(texW * cover), Math.ceil(texH * cover))
        .setDepth(0);
      if (bgImg.setSmoothing) bgImg.setSmoothing(true);
    }

    // Subtle dark vignette overlay so text pops
    const vignette = this.add.graphics().setDepth(1);
    vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0.0, 0.0);
    vignette.fillRect(0, 0, W, H * 0.55);
    vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.0, 0.0, 0.45, 0.45);
    vignette.fillRect(0, H * 0.45, W, H * 0.55);

    this.cameras.main.fadeIn(400);

    const isNewBest = this.finalScore > 0 && this.finalScore >= this.bestScore;

    // ── CONFETTI for new best ──────────────────────────────────────────────
    if (isNewBest) {
      const cols = [0xffd700, 0xff6b35, 0x00f5d4, 0xff3355, 0x00aaff];
      const pieces = [];
      for (let i = 0; i < 28; i++) {
        const x = Phaser.Math.Between(W * 0.08, W * 0.92);
        const p = this.add.circle(x, H * 0.05, Phaser.Math.FloatBetween(3, 6), cols[i % cols.length], 0).setDepth(30);
        pieces.push({ p, x });
      }
      this.time.delayedCall(200, () => {
        pieces.forEach(({ p, x }, i) => {
          this.time.delayedCall(i * 22, () => {
            p.setAlpha(1);
            this.tweens.add({
              targets: p, y: H * 0.55, x: x + Phaser.Math.Between(-70, 70),
              alpha: 0, angle: Phaser.Math.Between(-160, 160),
              duration: Phaser.Math.Between(650, 1100), ease: 'Power1',
              onComplete: () => p.destroy()
            });
          });
        });
      });
    }

    // ── LAYOUT — anchor-based, never overlapping ──────────────────────────
    const isLandscape = W > H;

    // Label size needed early for layout height calculation
    const labelSize = Math.min(S * 0.034, 14);
    const labelH    = labelSize * 1.4;

    // How tall is the game-over image going to be when rendered?
    let titleH = 0;
    if (!isNewBest && this.textures.exists('gameover_img')) {
      const tex   = this.textures.get('gameover_img').source[0];
      const maxW  = Math.min(W * 0.52, 280);     // narrower cap on landscape
      const maxH  = Math.min(H * 0.22, 120);     // hard cap so it never eats too much room
      const scale = Math.min(maxW / tex.width, maxH / tex.height);
      titleH = tex.height * scale;
    } else {
      titleH = Math.min(S * 0.090, 48) * 1.5;  // text title height estimate
    }

    // Fixed pixel gap between each content block
    const blockGap     = isLandscape ? Math.min(H * 0.06, 30) : Math.min(H * 0.055, 40);
    // Extra gap specifically between the two buttons so they never touch
    const btnBtnGap    = isLandscape ? Math.min(H * 0.05, 22) : Math.min(H * 0.05, 30);

    // Score number size — capped tighter on landscape so it doesn't dominate
    const scoreSize = isLandscape
      ? Math.min(S * 0.16, 80)
      : Math.min(S * 0.22, 108);

    // Stat box height
    const statH = Math.min(H * 0.13, 68);

    // Button heights (used for vertical stacking)
    const btnH     = Math.min(H * 0.10, 52);
    const menuBtnH = Math.min(H * 0.09,  46);

    // Total content height
    const totalH  = titleH    + blockGap
                  + labelH   + blockGap * 0.4 + scoreSize + blockGap
                  + statH    + blockGap
                  + btnH     + btnBtnGap
                  + menuBtnH;

    // Center vertically — nudge downward slightly so buttons sit away from mid-screen
    const stackTop = Math.max((H - totalH) / 2 + H * 0.01, H * 0.04);

    // Anchor Y for each block
    let cursor = stackTop;

    const titleY   = cursor + titleH / 2;
    cursor        += titleH + blockGap;

    // SCORE label sits blockGap above the number
    const scoreY   = cursor + labelH + blockGap * 0.4 + scoreSize / 2;
    cursor        += labelH + blockGap * 0.4 + scoreSize + blockGap;

    const statsY   = cursor + statH / 2;
    cursor        += statH + blockGap;

    const playBtnY = cursor + btnH / 2;
    cursor        += btnH + btnBtnGap;           // ← dedicated gap between buttons

    const menuBtnY = cursor + menuBtnH / 2;

    // ── TITLE ─────────────────────────────────────────────────────────────

    // Dark glass card that wraps GAME OVER image + SCORE label + number
    // Card spans from top of title block to bottom of score number
    const cardPadX  = Math.min(W * 0.08, 36);
    const cardPadY  = Math.min(H * 0.025, 14);
    const cardTop   = titleY - titleH / 2 - cardPadY;
    const cardBot   = scoreY + scoreSize * 0.6 + cardPadY;
    const cardH     = cardBot - cardTop;
    const cardW     = Math.min(W * 0.78, 380);
    const cardX     = W / 2 - cardW / 2;
    const cardR     = 18;

    // ── CARD: background.png cropped to rounded rect via geometry mask ───
    const cardMaskShape = this.add.graphics();
    cardMaskShape.fillStyle(0xffffff, 1);
    cardMaskShape.fillRoundedRect(cardX, cardTop, cardW, cardH, cardR);
    const cardMask = cardMaskShape.createGeometryMask();
    cardMaskShape.setVisible(false);

    const cardBgItems = [];
    if (this.textures.exists('scorebg')) {
      const bgTex = this.textures.get('scorebg').source[0];
      const bgScale = Math.max(cardW / bgTex.width, cardH / bgTex.height);
      const cardBgImg = this.add.image(cardX + cardW / 2, cardTop + cardH / 2, 'scorebg')
        .setScale(bgScale).setDepth(1).setAlpha(0).setMask(cardMask);
      cardBgItems.push(cardBgImg);
    }

    // Purple tint overlay on top of bg
    const cardTint = this.add.graphics().setDepth(1).setAlpha(0).setMask(cardMask);
    cardTint.fillStyle(0x6b21a8, 0.22);
    cardTint.fillRoundedRect(cardX, cardTop, cardW, cardH, cardR);

    // Border (no mask — always fully visible)
    const cardBorder = this.add.graphics().setDepth(1).setAlpha(0);
    cardBorder.lineStyle(3, 0xa855f7, 0.55);
    cardBorder.strokeRoundedRect(cardX - 1, cardTop - 1, cardW + 2, cardH + 2, cardR + 1);
    cardBorder.lineStyle(1, 0x6b21a8, 0.4);
    cardBorder.strokeRoundedRect(cardX, cardTop, cardW, cardH, cardR);

    this.tweens.add({ targets: [...cardBgItems, cardTint, cardBorder], alpha: 1, duration: 380, ease: 'Cubic.easeOut' });

    if (!isNewBest && this.textures.exists('gameover_img')) {
      const tex   = this.textures.get('gameover_img').source[0];
      const maxW  = Math.min(W * 0.52, 280);
      const maxH  = Math.min(H * 0.22, 120);
      const scale = Math.min(maxW / tex.width, maxH / tex.height);
      const img   = this.add.image(W / 2, titleY, 'gameover_img').setScale(scale).setAlpha(0).setDepth(2);
      this.tweens.add({
        targets: img, alpha: 1, scaleX: scale * 1.08, scaleY: scale * 1.08,
        duration: 300, ease: 'Back.easeOut', delay: 80,
        onComplete: () => {
          this.tweens.add({ targets: img, scaleX: scale, scaleY: scale, duration: 180, ease: 'Cubic.easeOut' });
        }
      });
    } else {
      const titleTxt  = isNewBest ? '🏆  NEW BEST!' : 'GAME OVER';
      const titleCol  = isNewBest ? '#ffd700' : '#ff3355';
      const titleSize = Math.min(S * 0.090, 48);
      const title = this.add.text(W / 2, titleY, titleTxt, {
        fontFamily: '"Bebas Neue", Impact, sans-serif',
        fontSize: `${titleSize}px`, color: titleCol,
        resolution: DPR,
      }).setOrigin(0.5).setAlpha(0).setDepth(2);
      this.tweens.add({ targets: title, alpha: 1, duration: 500, ease: 'Cubic.easeOut', delay: 100 });
    }

    // ── SCORE SECTION ─────────────────────────────────────────────────────

    // "SCORE" label — sits well above the number with clear breathing room
    // scoreY is the CENTER of the number, so label goes scoreSize*0.72 above that
    const labelY = scoreY - scoreSize * 0.72;
    this.add.text(W / 2, labelY, 'SCORE', {
      fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
      fontStyle: 'italic',
      fontSize: `${Math.min(S * 0.040, 22)}px`,
      color: '#3b0764',
      stroke: '#6b21a8',
      strokeThickness: 1,
      shadow: { offsetX: 0, offsetY: 0, color: '#a855f7', blur: 0, fill: false },
      letterSpacing: 2,
      resolution: DPR,
    }).setOrigin(0.5).setDepth(2);

    // Score number — 4-layer glow stack
    const numStr = this.finalScore.toString();
    const numY   = scoreY + scoreSize * 0.08;  // pushed slightly lower from label

    // Layer 1 — widest, softest halo (same fontSize as main so no ghost)
    this.add.text(W / 2, numY, numStr, {
      fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
      fontStyle: 'italic',
      fontSize: `${scoreSize}px`,
      color: '#a855f7',
      stroke: '#6b21a8',
      strokeThickness: 8,
      resolution: DPR,
    }).setOrigin(0.5).setAlpha(0.10).setDepth(2);

    // Layer 2 — medium corona
    this.add.text(W / 2, numY, numStr, {
      fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
      fontStyle: 'italic',
      fontSize: `${scoreSize}px`,
      color: '#a855f7',
      stroke: '#6b21a8',
      strokeThickness: 5,
      resolution: DPR,
    }).setOrigin(0.5).setAlpha(0.20).setDepth(2);

    // Layer 3 — tight inner glow
    this.add.text(W / 2, numY, numStr, {
      fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
      fontStyle: 'italic',
      fontSize: `${scoreSize}px`,
      color: '#a855f7',
      stroke: '#6b21a8',
      strokeThickness: 2,
      resolution: DPR,
    }).setOrigin(0.5).setAlpha(0.35).setDepth(2);

    // Layer 4 — crisp purple foreground number (animates in)
    const scoreNum = this.add.text(W / 2, numY, numStr, {
      fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
      fontStyle: 'italic',
      fontSize: `${scoreSize}px`,
      color: '#a855f7',
      stroke: '#6b21a8',
      strokeThickness: isNewBest ? 2 : 1,
      shadow: { offsetX: 0, offsetY: 0, color: '#6b21a8', blur: 8, fill: false },
      resolution: DPR,
    }).setOrigin(0.5).setAlpha(0).setScale(0.4).setDepth(2);
    this.tweens.add({ targets: scoreNum, alpha: 1, scaleX: 1, scaleY: 1, duration: 560, ease: 'Back.easeOut', delay: 260 });

    // Gold shimmer ring for new best
    if (isNewBest) {
      const ring = this.add.graphics().setDepth(2).setAlpha(0);
      ring.lineStyle(2, 0xffd700, 0.7);
      const ringR = scoreSize * 0.62;
      ring.strokeCircle(W / 2, numY, ringR);
      this.tweens.add({ targets: ring, alpha: 1, scaleX: 1.18, scaleY: 1.18, duration: 320, yoyo: true, repeat: 2, ease: 'Sine.easeInOut', delay: 400 });
    }

    // ── STAT BOXES ────────────────────────────────────────────────────────
    const statW = Math.min(W * 0.42, 170);
    this._statBox(W / 2 - statW * 0.56, statsY, statW, statH, 'BEST',    this.bestScore.toString(), isNewBest ? 0xffd700 : 0x778899, S, DPR);
    this._statBox(W / 2 + statW * 0.56, statsY, statW, statH, 'BASKETS', this.baskets.toString(),   0x00f5d4, S, DPR);

    // ── PLAY AGAIN BUTTON ─────────────────────────────────────────────────
    const playagainTex = this.textures.exists('playagainbtn') ? this.textures.get('playagainbtn').source[0] : null;
    let playBtnImg = null, playFill = null, playBg = null, playTxt = null;
    const btnW = Math.min(W * 0.62, 260);

    if (playagainTex) {
      this.textures.get('playagainbtn').setFilter(Phaser.Textures.FilterMode.LINEAR);
      const targetW = Math.round(Math.min(W * 0.52, 220));
      const targetH = Math.round((playagainTex.height / playagainTex.width) * targetW);
      playBtnImg = this.add.image(W / 2, playBtnY, 'playagainbtn')
        .setDisplaySize(targetW, targetH).setAlpha(0).setDepth(2);
      this.tweens.add({ targets: playBtnImg, alpha: 1, duration: 500, delay: 500, ease: 'Cubic.easeOut' });
      // No continuous blink — it's distracting on mobile.
    } else {
      playFill = this.add.graphics().setAlpha(0).setDepth(2);
      playFill.fillStyle(0xff6b35, 0.10);
      playFill.fillRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, 8);
      playBg = this.add.graphics().setAlpha(0).setDepth(2);
      playBg.lineStyle(2.5, 0xff6b35, 1);
      playBg.strokeRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, 8);
      playTxt = this.add.text(W / 2, playBtnY, 'PLAY AGAIN', {
        fontFamily: '"Bebas Neue", Impact, sans-serif',
        fontSize: `${Math.min(S * 0.052, 24)}px`,
        color: '#ff6b35', letterSpacing: 7, resolution: DPR,
      }).setOrigin(0.5).setAlpha(0).setDepth(2);
      this.tweens.add({ targets: [playFill, playBg, playTxt], alpha: 1, duration: 500, delay: 500, ease: 'Cubic.easeOut' });
    }

    // ── MENU BUTTON ───────────────────────────────────────────────────────
    const menubtnTex = this.textures.exists('menubtn') ? this.textures.get('menubtn').source[0] : null;
    let menuBtnImg = null, menuBg = null, menuTxt = null;
    const menuBtnW = Math.min(W * 0.62, 260);
    const btnR = 8;

    if (menubtnTex) {
      this.textures.get('menubtn').setFilter(Phaser.Textures.FilterMode.LINEAR);
      const targetW = Math.round(Math.min(W * 0.65, 270));
      const targetH = Math.round((menubtnTex.height / menubtnTex.width) * targetW);
      menuBtnImg = this.add.image(W / 2, menuBtnY, 'menubtn')
        .setDisplaySize(targetW, targetH).setAlpha(0).setDepth(2);
      this.tweens.add({ targets: menuBtnImg, alpha: 1, duration: 500, delay: 700, ease: 'Cubic.easeOut' });
    } else {
      menuBg = this.add.graphics().setAlpha(0).setDepth(2);
      menuBg.lineStyle(2, 0xffffff, 0.5);
      menuBg.strokeRoundedRect(W / 2 - menuBtnW / 2, menuBtnY - menuBtnH / 2, menuBtnW, menuBtnH, btnR);
      menuTxt = this.add.text(W / 2, menuBtnY, 'MENU', {
        fontFamily: '"Bebas Neue", Impact, sans-serif',
        fontSize: `${Math.min(S * 0.048, 22)}px`,
        color: '#e0e8f0', letterSpacing: 10, resolution: DPR,
      }).setOrigin(0.5).setAlpha(0).setDepth(2);
      this.tweens.add({ targets: [menuBg, menuTxt], alpha: 1, duration: 500, delay: 700, ease: 'Cubic.easeOut' });
    }

    // ── HIT AREAS ─────────────────────────────────────────────────────────
    const playHitW = playBtnImg
      ? Math.round(Math.min(W * 0.52, 220)) + 24
      : btnW * 1.1;
    const playHitH = playBtnImg
      ? Math.round(playagainTex.height * (Math.round(Math.min(W * 0.52, 220)) / playagainTex.width)) + 24
      : btnH * 1.6;

    const playHit = this.add.rectangle(W / 2, playBtnY, playHitW, playHitH, 0xffffff, 0).setInteractive({ useHandCursor: true }).setDepth(3);
    playHit.on('pointerdown', () => {
      soundManager.playClick();
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.time.delayedCall(250, () => this.scene.start('GameScene'));
    });
    playHit.on('pointerover', () => {
      if (playBtnImg) {
        this.tweens.killTweensOf(playBtnImg);
        const bW = Math.round(Math.min(W * 0.52, 220) * 1.05);
        const bH = Math.round((playagainTex.height / playagainTex.width) * bW);
        playBtnImg.setDisplaySize(bW, bH).setAlpha(1);
      } else {
        this.tweens.killTweensOf(playBg); this.tweens.killTweensOf(playTxt);
        playFill.clear(); playFill.fillStyle(0xff6b35, 0.20);
        playFill.fillRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, btnR);
        playFill.setAlpha(1); playBg.setAlpha(1); playTxt.setAlpha(1);
        playTxt.setStyle({ color: '#ffffff', stroke: '#ff6b35', strokeThickness: 1 });
      }
    });
    playHit.on('pointerout', () => {
      if (playBtnImg) {
        this.tweens.killTweensOf(playBtnImg);
        const bW = Math.round(Math.min(W * 0.52, 220));
        const bH = Math.round((playagainTex.height / playagainTex.width) * bW);
        playBtnImg.setDisplaySize(bW, bH).setAlpha(1);
      } else {
        this.tweens.killTweensOf(playBg); this.tweens.killTweensOf(playTxt);
        playFill.clear(); playFill.fillStyle(0xff6b35, 0.10);
        playFill.fillRoundedRect(W / 2 - btnW / 2, playBtnY - btnH / 2, btnW, btnH, btnR);
        playFill.setAlpha(1); playBg.setAlpha(1); playTxt.setAlpha(1);
        playTxt.setStyle({ color: '#ff6b35', strokeThickness: 0 });
      }
    });

    const menuHitW = menuBtnImg
      ? Math.round(Math.min(W * 0.65, 270)) + 24
      : menuBtnW * 1.1;
    const menuHitH = menuBtnImg
      ? Math.round((menubtnTex.height / menubtnTex.width) * Math.round(Math.min(W * 0.65, 270))) + 24
      : menuBtnH * 1.6;

    const menuHit = this.add.rectangle(W / 2, menuBtnY, menuHitW, menuHitH, 0xffffff, 0).setInteractive({ useHandCursor: true }).setDepth(3);
    menuHit.on('pointerdown', () => {
      soundManager.playClick();
      this.cameras.main.fadeOut(250, 0, 0, 0);
      this.time.delayedCall(250, () => this.scene.start('MenuScene'));
    });
    menuHit.on('pointerover', () => {
      if (menuBtnImg) {
        const bW = Math.round(Math.min(W * 0.65, 270) * 1.04);
        const bH = Math.round((menubtnTex.height / menubtnTex.width) * bW);
        menuBtnImg.setDisplaySize(bW, bH).setAlpha(1);
      } else {
        menuBg.clear(); menuBg.lineStyle(2, 0xffd700, 1);
        menuBg.strokeRoundedRect(W / 2 - menuBtnW / 2, menuBtnY - menuBtnH / 2, menuBtnW, menuBtnH, btnR);
        menuBg.setAlpha(1); menuTxt.setStyle({ color: '#ffd700' });
      }
    });
    menuHit.on('pointerout', () => {
      if (menuBtnImg) {
        const bW = Math.round(Math.min(W * 0.65, 270));
        const bH = Math.round((menubtnTex.height / menubtnTex.width) * bW);
        menuBtnImg.setDisplaySize(bW, bH).setAlpha(1);
      } else {
        menuBg.clear(); menuBg.lineStyle(2, 0xffffff, 0.5);
        menuBg.strokeRoundedRect(W / 2 - menuBtnW / 2, menuBtnY - menuBtnH / 2, menuBtnW, menuBtnH, btnR);
        menuBg.setAlpha(1); menuTxt.setStyle({ color: '#e0e8f0' });
      }
    });

    // ── SAVE ──────────────────────────────────────────────────────────────
    if (this.finalScore > 0) {
      YTPlayables.saveData({ bestScore: this.bestScore, lastScore: this.finalScore }).catch(() => {});
      YTPlayables.sendScore(this.bestScore);
    }
  }

  _statBox(x, y, w, h, label, value, color, S, DPR = 2) {
    const hexColor = '#' + color.toString(16).padStart(6, '0');
    const g = this.add.graphics().setDepth(2);

    // ── background.png cropped to stat box via geometry mask ────────────
    const sMaskShape = this.add.graphics();
    sMaskShape.fillStyle(0xffffff, 1);
    sMaskShape.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);
    const sMask = sMaskShape.createGeometryMask();
    sMaskShape.setVisible(false);

    if (this.textures.exists('scorebg')) {
      const bgTex  = this.textures.get('scorebg').source[0];
      const bgSc   = Math.max(w / bgTex.width, h / bgTex.height);
      this.add.image(x, y, 'scorebg').setScale(bgSc).setDepth(2).setMask(sMask);
    }

    // Purple tint overlay
    const tint = this.add.graphics().setDepth(2).setMask(sMask);
    tint.fillStyle(0x6b21a8, 0.22);
    tint.fillRoundedRect(x - w / 2, y - h / 2, w, h, 12);

    // Border (no mask)
    g.lineStyle(3, 0xa855f7, 0.55);
    g.strokeRoundedRect(x - w / 2 - 1, y - h / 2 - 1, w + 2, h + 2, 13);
    g.lineStyle(1.5, 0x6b21a8, 0.5);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 12);

    this.add.text(x, y - h * 0.18, label, {
      fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
      fontStyle: 'italic',
      fontSize: `${Math.min(S * 0.032, 14)}px`,
      color: '#6b21a8',
      letterSpacing: 4,
      resolution: DPR,
    }).setOrigin(0.5).setDepth(2);

    this.add.text(x, y + h * 0.24, value, {
      fontFamily: '"Palatino Linotype", "Book Antiqua", Palatino, serif',
      fontStyle: 'italic',
      fontSize: `${Math.min(S * 0.082, 36)}px`,
      color: '#3b0764',
      stroke: '#6b21a8',
      strokeThickness: 1,
      resolution: DPR,
    }).setOrigin(0.5).setDepth(2);
  }
}