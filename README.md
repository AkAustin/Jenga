# 🪵 JENGA 360° Online — No Sign-In 3D Physics Edition

An interactive 3D web-based **Jenga** game built with **Three.js** and **Cannon-es** rigid-body physics. Playable immediately in any desktop or mobile browser with **zero sign-in required**.

## ✨ Features (Phase 1)

- **Authentic 54-Block Geometry & Proportions:**
  - 18 alternating 3-block stories built to official Jenga mathematical ratios ($\text{Length} = 3 \times \text{Width}$, $7.5 \times 2.5 \times 1.5$).
- **Realistic Loose, Snug & Tight Block Tension:**
  - Simulates real-world manufacturing micro-variations where each row contains loose (easy pull), snug, and tight (load-bearing) blocks. Hover or tap any block to inspect its tension.
- **Full $360^\circ$ All-Around Camera & Turntable:**
  - Spin continuously around all 4 sides of the tower (`FRONT`, `RIGHT`, `BACK`, `LEFT`) using background drag, two-finger touch, the **`↺ 45°` / `↻ 45°`** quick-turn buttons, or the **`0°–360°` Turntable Slider & Compass**.
- **Mobile & Touch Adaptability:**
  - Dedicated **`🖐️ Pull` vs `🔄 360° View`** toggle for effortless one-handed mobile play, multi-touch gesture handoff, responsive portrait/landscape camera scaling, and floating mobile block inspector pills.
- **Official Jenga Rules Enforcement:**
  - Blocks can only be pulled from *below* the highest completed 3-block layer.
  - One-hand commitment rule once a block is pulled past 25%.
  - Interactive 3-slot top placement guide + 1.1-second stability verification before advancing turns.
- **Zero-Sign-In Multiplayer & Game Modes:**
  - **Pass & Play (2–3 Players)**
  - **Solo Tower Height Challenge**
  - **Instant Room Code Multiplayer** (syncs across browser tabs via `BroadcastChannel` and across devices via `PeerJS` WebRTC using a 6-character room code).
- **Procedural Wood Textures & Web Audio Synthesizer:**
  - Zero external asset dependencies—wood grain textures and realistic wood knocks, sliding friction, placement thuds, and collapse clatter are synthesized procedurally in real time.

## 🚀 How to Play

1. Open [`index.html`](./index.html) directly in any modern browser (or double-click `play.bat` on Windows).
2. **Orbit $360^\circ$:** Drag the background, use the bottom $360^\circ$ slider, or tap `↺ 45°` / `↻ 45°` to inspect all sides of the tower.
3. **Step 1 (Extract):** Click/touch and drag any valid block below the top completed row along its length until it clears the tower.
4. **Step 2 (Stack):** Click/tap one of the 3 glowing perpendicular slots on top of the tower to stack your block and survive the stability check!
