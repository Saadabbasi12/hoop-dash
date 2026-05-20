# 🏀 Hoop Dash — YouTube Playable

A complete, award-winning basketball throwing game built with **Phaser 3 + Vite**, fully integrated with the **YouTube Playables SDK**.

## Quick Start

```bash
npm install
npm run dev
# Open http://localhost:8080
```

## Build for Production

```bash
npm run build
# Output in /dist — zip and upload to YouTube Playables
```

## Test with YouTube Test Suite

1. Run `npm run dev`
2. Go to https://developers.google.com/youtube/gaming/playables/test_suite
3. Enter `http://localhost:8080` as the Game URL
4. All checks should pass ✅

## YouTube Playables SDK Compliance

✅ SDK loaded **before** any game code (in `index.html`)  
✅ `firstFrameReady()` called during loading screen (BootScene)  
✅ `gameReady()` called when game is interactive (MenuScene)  
✅ `saveData()` / `loadData()` for cloud saves  
✅ `sendScore()` on every new score  
✅ `onPause()` / `onResume()` callbacks implemented  
✅ `onAudioEnabledChange()` respected  
✅ Initial bundle < 30 MiB (all assets procedural - zero external files)  
✅ Only relative paths used  
✅ Handles zero-size viewport (Android WebView)  
✅ Responsive across all screen sizes  

## Gameplay

- **Drag & release** to aim and throw the basketball
- Score points by landing the ball through the hoop
- **Combo multiplier** — consecutive baskets multiply your score
- **Obstacles** spawn as your score increases:
  - 🔪 Spinning blades that drift horizontally
  - 🧱 Moving bumper bars sweeping across
  - 🏗️ Wall segments blocking paths
- **Collectibles**:
  - 💎 Gems — bonus +2 points on contact
  - 🛡️ Shield — absorbs one obstacle hit
  - ⏱️ Slow — slows all physics temporarily
- 3 lives — lose one each miss or obstacle hit
- Endless difficulty scaling

## Tech Stack

- **Phaser 3.87** — game engine
- **Vite 5** — bundler (fast dev + optimized builds)
- **Web Audio API** — all sounds procedurally generated (no audio files)
- **Canvas API** — all graphics procedurally generated (no image files)
- Zero external asset files → tiny initial bundle

## File Structure

```
hoop-dash/
├── index.html              ← YT SDK script tag here (FIRST)
├── vite.config.js
├── package.json
└── src/
    ├── main.js             ← Game config + responsive sizing
    ├── scenes/
    │   ├── BootScene.js    ← Loading + firstFrameReady
    │   ├── MenuScene.js    ← Main menu + gameReady
    │   ├── GameScene.js    ← Full gameplay
    │   └── GameOverScene.js
    └── utils/
        ├── YTPlayables.js  ← SDK wrapper with local fallbacks
        ├── SoundManager.js ← Procedural Web Audio sounds
        └── AssetGenerator.js ← Procedural canvas textures
```
