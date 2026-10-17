/**
 * Online Jenga — Realistic PBR 3-Wood Parlor Edition (360° Camera, Dynamic Chairs & Mobile Adaptive)
 * Uses Three.js + Cannon-es with authentic 7.5 x 2.5 x 1.5 block geometry,
 * 3 distinct timber species (Maple, Cherry Oak, Walnut), parlor room background,
 * dynamic player chairs around the circular table, and no-sign-in multiplayer.
 */

window.initJengaGame = function () {
  const THREE = window.THREE;
  const OrbitControls = window.OrbitControls;
  const CANNON = window.CANNON;

  // Official Jenga Dimensions (scaled 1 unit = 1 cm)
  const BLOCK_LENGTH = 7.5;
  const BLOCK_WIDTH = 2.5;
  const BLOCK_HEIGHT = 1.5;
  const INITIAL_LAYERS = 18;
  const BLOCKS_PER_LAYER = 3;
  const GAP = 0.03;
  const FLOOR_Y = -26;

  // Game State
  const state = {
    mode: 'pass',
    interactionMode: 'pull', // 'pull' | 'orbit'
    players: [
      { name: 'Player 1', color: '#e59838', moves: 0 },
      { name: 'Player 2', color: '#4cd97b', moves: 0 }
    ],
    currentPlayerIdx: 0,
    turnPhase: 'SELECT', // 'SELECT' | 'PULLING' | 'STACKING' | 'SETTLING' | 'GAMEOVER'
    turnNumber: 1,
    blocksMovedTotal: 0,
    activeBlock: null,
    hoveredBlock: null,
    committedBlock: null,
    towerPeakLayer: INITIAL_LAYERS - 1,
    isTopView: false,
    roomCode: null,
    isHost: true,
    channel: null,
    peer: null,
    connections: []
  };

  // DOM Elements
  const container = document.getElementById('canvas-container');
  const elTurnPlayerName = document.getElementById('turn-player-name');
  const elTurnPhaseText = document.getElementById('turn-phase-text');
  const elPlayerDot = document.getElementById('player-dot');
  const elStatHeight = document.getElementById('stat-height');
  const elStatMoves = document.getElementById('stat-moves');
  const elPlayerList = document.getElementById('player-list');
  const elSeatCountBadge = document.getElementById('seat-count-badge');
  const elStabilityBar = document.getElementById('stability-bar');
  const elStabilityText = document.getElementById('stability-text');
  const elBlockInspector = document.getElementById('block-inspector');
  const elMobileBlockPill = document.getElementById('mobile-block-pill');
  const elCoachBadge = document.getElementById('coach-badge');
  const elCoachText = document.getElementById('coach-text');
  const elSlotPicker = document.getElementById('slot-picker');
  const elToastContainer = document.getElementById('toast-container');
  const elOrbitSlider = document.getElementById('orbit-slider');
  const elCompassReadout = document.getElementById('compass-readout');

  // Three.js Scene Setup (Photorealistic Parlor Atmosphere)
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x140e0a, 0.0045);

  const camera = new THREE.PerspectiveCamera(
    44,
    window.innerWidth / Math.max(1, window.innerHeight),
    0.5,
    350
  );

  function getIdealCameraDistance() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    if (aspect < 0.65) return 54; // Phone portrait
    if (aspect < 1.0) return 45;  // Tablet portrait
    return 38;                    // Desktop / landscape
  }

  const initDist = getIdealCameraDistance();
  camera.position.set(
    initDist * Math.sin(Math.PI / 4),
    22,
    initDist * Math.cos(Math.PI / 4)
  );

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  container.appendChild(renderer.domElement);

  // Full 360° OrbitControls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 13.0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 16;
  controls.maxDistance = 92;
  controls.rotateSpeed = 0.85;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_ROTATE
  };
  controls.update();

  // Realistic Parlor Room Lighting
  const ambientLight = new THREE.AmbientLight(0xffe9d2, 0.58);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xffecd2, 0x261810, 0.62);
  hemiLight.position.set(0, 65, 0);
  scene.add(hemiLight);

  // Warm overhead pendant lamp light casting crisp soft shadows
  const mainLight = new THREE.DirectionalLight(0xfff1de, 1.45);
  mainLight.position.set(16, 48, 20);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  mainLight.shadow.camera.near = 5;
  mainLight.shadow.camera.far = 120;
  const shadowBounds = 34;
  mainLight.shadow.camera.left = -shadowBounds;
  mainLight.shadow.camera.right = shadowBounds;
  mainLight.shadow.camera.top = shadowBounds * 1.4;
  mainLight.shadow.camera.bottom = -shadowBounds;
  mainLight.shadow.bias = -0.0004;
  scene.add(mainLight);

  // Warm fill light from opposite angle so all 360° sides show rich wood grain
  const fillLight = new THREE.DirectionalLight(0xf3c892, 0.58);
  fillLight.position.set(-24, 28, -22);
  scene.add(fillLight);

  // Warm parlor lamp glow directly above the tower
  const lampPointLight = new THREE.PointLight(0xffb969, 0.9, 110, 1.4);
  lampPointLight.position.set(0, 44, 0);
  scene.add(lampPointLight);

  // Cannon-es Physics World
  const world = new CANNON.World();
  world.gravity.set(0, -32, 0);
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 35;
  world.solver.tolerance = 0.0005;

  const woodMaterial = new CANNON.Material('wood');
  const tableMaterial = new CANNON.Material('table');

  const woodOnWood = new CANNON.ContactMaterial(woodMaterial, woodMaterial, {
    friction: 0.42,
    restitution: 0.01,
    contactEquationStiffness: 1e7,
    contactEquationRelaxation: 4
  });
  const woodOnTable = new CANNON.ContactMaterial(woodMaterial, tableMaterial, {
    friction: 0.65,
    restitution: 0.01,
    contactEquationStiffness: 1e7,
    contactEquationRelaxation: 4
  });
  world.addContactMaterial(woodOnWood);
  world.addContactMaterial(woodOnTable);

  // ============================================================================
  // 3D PARLOR BACKGROUND ENVIRONMENT, PEDESTAL TABLE & DYNAMIC PLAYER CHAIRS
  // ============================================================================
  const environmentGroup = new THREE.Group();
  scene.add(environmentGroup);

  function buildParlorEnvironment() {
    // 1. Hardwood Parlor Floor
    const floorCanvas = window.JengaTextures.createFloorCanvas();
    const floorTex = new THREE.CanvasTexture(floorCanvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(8, 8);
    floorTex.anisotropy = 4;

    const floorGeo = new THREE.CircleGeometry(140, 64);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.68,
      metalness: 0.04
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = FLOOR_Y;
    floorMesh.receiveShadow = true;
    environmentGroup.add(floorMesh);

    // 2. Woven Circular Parlor Rug under Table & Chairs
    const rugGeo = new THREE.CylinderGeometry(58, 58, 0.25, 64);
    const rugMat = new THREE.MeshStandardMaterial({
      color: 0x3b231a,
      roughness: 0.92,
      metalness: 0.0
    });
    const rugMesh = new THREE.Mesh(rugGeo, rugMat);
    rugMesh.position.set(0, FLOOR_Y + 0.13, 0);
    rugMesh.receiveShadow = true;
    environmentGroup.add(rugMesh);

    const rugBorderGeo = new THREE.RingGeometry(54.5, 57.2, 64);
    rugBorderGeo.rotateX(-Math.PI / 2);
    const rugBorderMat = new THREE.MeshStandardMaterial({
      color: 0xc29256,
      roughness: 0.85,
      side: THREE.DoubleSide
    });
    const rugBorder = new THREE.Mesh(rugBorderGeo, rugBorderMat);
    rugBorder.position.set(0, FLOOR_Y + 0.27, 0);
    environmentGroup.add(rugBorder);

    // 3. 360° Parlor Wainscoting Wall Surround (Background Layer)
    const lowerWallGeo = new THREE.CylinderGeometry(125, 125, 36, 64, 1, true);
    const lowerWallMat = new THREE.MeshStandardMaterial({
      color: 0x261810,
      roughness: 0.78,
      metalness: 0.05,
      side: THREE.BackSide
    });
    const lowerWall = new THREE.Mesh(lowerWallGeo, lowerWallMat);
    lowerWall.position.set(0, FLOOR_Y + 18, 0);
    environmentGroup.add(lowerWall);

    const chairRailGeo = new THREE.TorusGeometry(124.2, 0.6, 12, 64);
    chairRailGeo.rotateX(Math.PI / 2);
    const chairRailMat = new THREE.MeshStandardMaterial({
      color: 0x4d311e,
      roughness: 0.55,
      metalness: 0.1
    });
    const chairRail = new THREE.Mesh(chairRailGeo, chairRailMat);
    chairRail.position.set(0, FLOOR_Y + 36, 0);
    environmentGroup.add(chairRail);

    // 4. Overhead Parlor Pendant Lamp Shade
    const cordGeo = new THREE.CylinderGeometry(0.18, 0.18, 30, 12);
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xc88a4b,
      roughness: 0.28,
      metalness: 0.75
    });
    const cordMesh = new THREE.Mesh(cordGeo, brassMat);
    cordMesh.position.set(0, 62, 0);
    environmentGroup.add(cordMesh);

    const shadeGeo = new THREE.ConeGeometry(9.5, 4.5, 32, 1, true);
    const shadeMat = new THREE.MeshStandardMaterial({
      color: 0x1d3b2a, // Classic vintage billiard/parlor green-and-brass shade
      roughness: 0.35,
      metalness: 0.15,
      side: THREE.DoubleSide
    });
    const shadeMesh = new THREE.Mesh(shadeGeo, shadeMat);
    shadeMesh.position.set(0, 46.5, 0);
    environmentGroup.add(shadeMesh);

    const bulbGeo = new THREE.SphereGeometry(1.4, 16, 16);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xfff3d6 });
    const bulbMesh = new THREE.Mesh(bulbGeo, bulbMat);
    bulbMesh.position.set(0, 45.2, 0);
    environmentGroup.add(bulbMesh);

    // 5. Circular Pedestal Game Table (Top + Turned Column + 4 Splayed Feet)
    const tableCanvas = window.JengaTextures.createTableCanvas();
    const tableTex = new THREE.CanvasTexture(tableCanvas);
    tableTex.anisotropy = 4;

    const tableTopGeo = new THREE.CylinderGeometry(28, 29.2, 2.2, 64);
    const tableTopMat = new THREE.MeshStandardMaterial({
      map: tableTex,
      roughness: 0.42,
      metalness: 0.04
    });
    const tableMesh = new THREE.Mesh(tableTopGeo, tableTopMat);
    tableMesh.position.set(0, -1.1, 0);
    tableMesh.receiveShadow = true;
    tableMesh.castShadow = true;
    environmentGroup.add(tableMesh);

    // Subtle inlaid brass rim
    const rimGeo = new THREE.TorusGeometry(28.05, 0.22, 16, 64);
    rimGeo.rotateX(Math.PI / 2);
    const rimMesh = new THREE.Mesh(rimGeo, brassMat);
    rimMesh.position.set(0, -0.05, 0);
    environmentGroup.add(rimMesh);

    // Table apron & central pedestal column
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x362214,
      roughness: 0.55,
      metalness: 0.05
    });
    const apronGeo = new THREE.CylinderGeometry(23, 21, 2.2, 48);
    const apronMesh = new THREE.Mesh(apronGeo, pedestalMat);
    apronMesh.position.set(0, -3.1, 0);
    environmentGroup.add(apronMesh);

    const columnHeight = Math.abs(FLOOR_Y) - 3.5;
    const columnGeo = new THREE.CylinderGeometry(3.8, 5.2, columnHeight, 32);
    const columnMesh = new THREE.Mesh(columnGeo, pedestalMat);
    columnMesh.position.set(0, FLOOR_Y + columnHeight / 2 + 1.5, 0);
    columnMesh.castShadow = true;
    columnMesh.receiveShadow = true;
    environmentGroup.add(columnMesh);

    // Base plinth & 4 splayed table legs resting on floor
    const plinthGeo = new THREE.CylinderGeometry(7.2, 8.5, 2.2, 32);
    const plinthMesh = new THREE.Mesh(plinthGeo, pedestalMat);
    plinthMesh.position.set(0, FLOOR_Y + 1.1, 0);
    environmentGroup.add(plinthMesh);

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + Math.PI / 4;
      const legGeo = new THREE.BoxGeometry(2.4, 2.2, 16);
      const legMesh = new THREE.Mesh(legGeo, pedestalMat);
      legMesh.position.set(
        Math.sin(angle) * 9.5,
        FLOOR_Y + 1.1,
        Math.cos(angle) * 9.5
      );
      legMesh.rotation.y = angle;
      legMesh.castShadow = true;
      legMesh.receiveShadow = true;
      environmentGroup.add(legMesh);
    }
  }

  buildParlorEnvironment();

  // Physics Ground Body for Tabletop
  const groundBody = new CANNON.Body({
    mass: 0,
    material: tableMaterial,
    shape: new CANNON.Box(new CANNON.Vec3(45, 2, 45)),
    position: new CANNON.Vec3(0, -2, 0)
  });
  world.addBody(groundBody);

  // ============================================================================
  // DYNAMIC 3D CHAIRS AROUND THE CIRCULAR TABLE (MATCHING PLAYER COUNT)
  // ============================================================================
  const chairsGroup = new THREE.Group();
  scene.add(chairsGroup);
  let chairObjects = [];

  /**
   * Builds a realistic 3D wooden parlor chair with upholstered cushion & curved backrest.
   */
  function createSingleChairMesh(playerColorHex) {
    const chair = new THREE.Group();

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x422918,
      roughness: 0.5,
      metalness: 0.05
    });

    const cushionMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(playerColorHex),
      roughness: 0.65,
      metalness: 0.02
    });

    const brassAccentMat = new THREE.MeshStandardMaterial({
      color: 0xd49b57,
      roughness: 0.3,
      metalness: 0.75
    });

    const seatY = FLOOR_Y + 14.5;
    const seatW = 12.5;
    const seatD = 12.0;

    // 1. Wooden Seat Frame
    const seatFrameGeo = new THREE.BoxGeometry(seatW, 1.4, seatD);
    const seatFrame = new THREE.Mesh(seatFrameGeo, frameMat);
    seatFrame.position.set(0, seatY, 0);
    seatFrame.castShadow = true;
    seatFrame.receiveShadow = true;
    chair.add(seatFrame);

    // 2. Upholstered Cushion (colored per player)
    const cushionGeo = new THREE.BoxGeometry(seatW - 1.0, 1.3, seatD - 1.0);
    const cushion = new THREE.Mesh(cushionGeo, cushionMat);
    cushion.position.set(0, seatY + 1.1, 0);
    cushion.castShadow = true;
    cushion.receiveShadow = true;
    chair.add(cushion);

    // 3. Four Tapered Wooden Legs
    const legH = seatY - FLOOR_Y;
    const legGeo = new THREE.CylinderGeometry(0.65, 0.45, legH, 12);
    const legOffsets = [
      [-seatW / 2 + 1.1, -seatD / 2 + 1.1],
      [seatW / 2 - 1.1, -seatD / 2 + 1.1],
      [-seatW / 2 + 1.1, seatD / 2 - 1.1],
      [seatW / 2 - 1.1, seatD / 2 - 1.1]
    ];

    legOffsets.forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, frameMat);
      leg.position.set(lx, FLOOR_Y + legH / 2, lz);
      leg.castShadow = true;
      leg.receiveShadow = true;
      chair.add(leg);
    });

    // Side stretchers between legs for realism
    const stretcherGeo = new THREE.CylinderGeometry(0.32, 0.32, seatD - 2.2, 8);
    stretcherGeo.rotateX(Math.PI / 2);
    [-seatW / 2 + 1.1, seatW / 2 - 1.1].forEach((lx) => {
      const st = new THREE.Mesh(stretcherGeo, frameMat);
      st.position.set(lx, FLOOR_Y + 5.2, 0);
      chair.add(st);
    });

    // 4. Backrest Uprights & Slats (at +Z side of chair local space, facing -Z toward table center)
    const backH = 15.5;
    const postGeo = new THREE.CylinderGeometry(0.62, 0.58, backH, 12);
    [-seatW / 2 + 1.2, seatW / 2 - 1.2].forEach((px) => {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(px, seatY + backH / 2, seatD / 2 - 0.9);
      post.rotation.x = 0.08; // Slight ergonomic recline
      post.castShadow = true;
      chair.add(post);
    });

    // Vertical spindles in backrest
    const spindleGeo = new THREE.CylinderGeometry(0.28, 0.28, backH - 3.2, 8);
    [-3.2, -1.1, 1.1, 3.2].forEach((sx) => {
      const spindle = new THREE.Mesh(spindleGeo, frameMat);
      spindle.position.set(sx, seatY + backH / 2 - 0.5, seatD / 2 - 0.5);
      spindle.rotation.x = 0.08;
      spindle.castShadow = true;
      chair.add(spindle);
    });

    // Top Crest Rail
    const crestGeo = new THREE.BoxGeometry(seatW + 0.6, 2.6, 1.3);
    const crest = new THREE.Mesh(crestGeo, frameMat);
    crest.position.set(0, seatY + backH - 0.8, seatD / 2 - 0.2);
    crest.rotation.x = 0.08;
    crest.castShadow = true;
    chair.add(crest);

    // Active-turn brass crest badge on top rail
    const badgeGeo = new THREE.BoxGeometry(4.2, 0.9, 1.45);
    const badge = new THREE.Mesh(badgeGeo, brassAccentMat);
    badge.position.set(0, seatY + backH - 0.8, seatD / 2 - 0.2);
    badge.rotation.x = 0.08;
    chair.add(badge);

    return { group: chair, cushion, badge };
  }

  // Soft procedural skin texture with warm golden-peach tone and subtle rosy knuckle warmth
  let cachedSkinTexture = null;
  function getWarmSkinTexture() {
    if (cachedSkinTexture) return cachedSkinTexture;
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');

    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 160);
    grad.addColorStop(0, '#ecc09b');
    grad.addColorStop(0.55, '#e2ae86');
    grad.addColorStop(1, '#d4996f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    cachedSkinTexture = new THREE.CanvasTexture(c);
    cachedSkinTexture.encoding = THREE.sRGBEncoding;
    return cachedSkinTexture;
  }

  /**
   * Builds BOTH Hands (Left Hand & Right Hand, palms resting down on the table) as true,
   * full-bodied, heavy-weight 3D anatomical sculptures modeled after the user's reference image:
   * - Symmetrical Left Hand (-X) and Right Hand (+X), thumbs pointing inward toward each other
   * - Thick, plump 3D palm & dorsal metacarpal cushion with tendon ridges and fleshy heel pads
   * - 5 thick, rounded 3D articulated fingers per hand (thumb + index, middle, ring, pinky)
   *   with knuckle domes, PIP joint creases, and glossy contoured pink fingernails
   * - Tailored jacket sleeves + French cuffs, Gold Chronograph Watch on the Left wrist,
   *   and Gold Cuban Link Bracelet + Gold Signet Ring on the Right hand.
   */
  function createOpenPalmHandMesh(playerColorHex) {
    const bothHandsGroup = new THREE.Group();

    const skinTex = getWarmSkinTexture();
    const skinMat = new THREE.MeshStandardMaterial({
      map: skinTex,
      color: 0xf7d7be,
      emissive: 0x221108,
      emissiveIntensity: 0.18,
      roughness: 0.44,
      metalness: 0.03
    });

    const knuckleMat = new THREE.MeshStandardMaterial({
      color: 0xdf9f79,
      emissive: 0x1e0e06,
      emissiveIntensity: 0.15,
      roughness: 0.48,
      metalness: 0.02
    });

    const nailMat = new THREE.MeshStandardMaterial({
      color: 0xfbe3da,
      emissive: 0x241410,
      emissiveIntensity: 0.14,
      roughness: 0.2,
      metalness: 0.08
    });

    const sleeveMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(playerColorHex),
      roughness: 0.5,
      metalness: 0.08
    });

    const cuffMat = new THREE.MeshStandardMaterial({
      color: 0xfcfaf7,
      roughness: 0.36
    });

    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffc857,
      roughness: 0.2,
      metalness: 0.88
    });

    const obsidianMat = new THREE.MeshStandardMaterial({
      color: 0x12141a,
      roughness: 0.15,
      metalness: 0.65
    });

    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x080401,
      transparent: true,
      opacity: 0.36,
      depthWrite: false
    });

    /**
     * Builds one complete, thick, heavy-weight 3D hand:
     * sideSign = -1 -> Left Hand (placed on left side of player's table zone, thumb on inner +X side)
     * sideSign = +1 -> Right Hand (placed on right side of player's table zone, thumb on inner -X side)
     */
    function buildSingleSculpted3DHand(sideSign) {
      const handUnit = new THREE.Group();
      // Symmetrical placement framing the player's turn plaque on their highlighted side of the table
      handUnit.position.set(sideSign * 7.2, 0.05, 20.3);
      // Angle both hands naturally inward toward the Jenga tower
      handUnit.rotation.y = sideSign * 0.22;

      // Soft grounded tabletop shadow oval under the palm
      const shadowGeo = new THREE.CircleGeometry(3.2, 28);
      shadowGeo.rotateX(-Math.PI / 2);
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.scale.set(1.05, 1.0, 1.38);
      shadowMesh.position.set(0, 0.02, -0.2);
      handUnit.add(shadowMesh);

      // 1. Thick 3D Forearm / Wrist & Tailored Sleeve coming from the player's seat
      const wristMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.38, 1.54, 2.6, 24).rotateX(Math.PI / 2),
        skinMat
      );
      wristMesh.scale.set(1.18, 0.78, 1.0);
      wristMesh.position.set(0, 0.78, 2.25);
      wristMesh.castShadow = true;
      wristMesh.receiveShadow = true;
      handUnit.add(wristMesh);

      // Crisp white French shirt cuff
      const cuffMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.52, 1.62, 1.05, 24).rotateX(Math.PI / 2),
        cuffMat
      );
      cuffMesh.scale.set(1.18, 0.8, 1.0);
      cuffMesh.position.set(0, 0.86, 3.35);
      cuffMesh.castShadow = true;
      handUnit.add(cuffMesh);

      // Tailored player-colored jacket sleeve
      const sleeveMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(1.68, 1.98, 4.2, 24).rotateX(Math.PI / 2),
        sleeveMat
      );
      sleeveMesh.scale.set(1.2, 0.82, 1.0);
      sleeveMesh.position.set(0, 0.96, 5.4);
      sleeveMesh.castShadow = true;
      sleeveMesh.receiveShadow = true;
      handUnit.add(sleeveMesh);

      // Gold cufflink buttons on outer sleeve edge
      [-0.35, 0.35].forEach((bz) => {
        const btn = new THREE.Mesh(
          new THREE.CylinderGeometry(0.19, 0.19, 0.14, 14),
          goldMat
        );
        btn.rotation.z = Math.PI / 2;
        btn.position.set(sideSign * 1.96, 0.95, 4.6 + bz * 1.8);
        handUnit.add(btn);
      });

      // Left Hand (-1) wears a luxury Gold & Obsidian Chronograph Watch;
      // Right Hand (+1) wears a thick Cuban-Link Gold Wrist Chain
      if (sideSign < 0) {
        const watchGroup = new THREE.Group();
        watchGroup.position.set(0, 0.82, 2.15);
        handUnit.add(watchGroup);

        const strap = new THREE.Mesh(
          new THREE.CylinderGeometry(1.44, 1.48, 0.65, 24).rotateX(Math.PI / 2),
          goldMat
        );
        strap.scale.set(1.18, 0.8, 1.0);
        watchGroup.add(strap);

        const bezel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.82, 0.86, 0.28, 24),
          goldMat
        );
        bezel.position.set(0, 1.05, 0);
        watchGroup.add(bezel);

        const dial = new THREE.Mesh(
          new THREE.CylinderGeometry(0.66, 0.66, 0.3, 24),
          obsidianMat
        );
        dial.position.set(0, 1.05, 0);
        watchGroup.add(dial);
      } else {
        const bracelet = new THREE.Mesh(
          new THREE.TorusGeometry(1.42, 0.14, 12, 28),
          goldMat
        );
        bracelet.scale.set(1.18, 0.8, 1.0);
        bracelet.position.set(0, 0.8, 2.05);
        bracelet.castShadow = true;
        handUnit.add(bracelet);
      }

      // 2. Heavy-Weight, Plump 3D Palm & Dorsal Hand Body Pivot
      const palmPivot = new THREE.Group();
      palmPivot.position.set(0, 0.72, 0);
      handUnit.add(palmPivot);

      // Main thick dorsal metacarpal cushion (gives substantial 3D thickness & weight!)
      const palmMain = new THREE.Mesh(
        new THREE.SphereGeometry(2.05, 32, 24),
        skinMat
      );
      palmMain.scale.set(1.06, 0.56, 1.16);
      palmMain.position.set(0, 0.08, 0.12);
      palmMain.castShadow = true;
      palmMain.receiveShadow = true;
      palmPivot.add(palmMain);

      // Lower fleshy palm cushion resting solidly against the tabletop so the hand never looks thin or floating
      const palmUnderCushion = new THREE.Mesh(
        new THREE.CylinderGeometry(1.85, 1.95, 0.78, 28),
        knuckleMat
      );
      palmUnderCushion.scale.set(1.06, 1.0, 1.12);
      palmUnderCushion.position.set(0, -0.26, 0.15);
      palmUnderCushion.castShadow = true;
      palmUnderCushion.receiveShadow = true;
      palmPivot.add(palmUnderCushion);

      // Muscular thumb base pad (thenar eminence) on the inner side (-sideSign)
      const thenarPad = new THREE.Mesh(
        new THREE.SphereGeometry(1.12, 20, 16),
        knuckleMat
      );
      thenarPad.scale.set(0.95, 0.58, 1.28);
      thenarPad.position.set(-sideSign * 1.18, -0.08, 0.48);
      palmPivot.add(thenarPad);

      // Outer heel pad (hypothenar eminence) on the outer side (+sideSign)
      const heelPad = new THREE.Mesh(
        new THREE.SphereGeometry(1.02, 20, 16),
        knuckleMat
      );
      heelPad.scale.set(0.9, 0.56, 1.24);
      heelPad.position.set(sideSign * 1.1, -0.08, 0.56);
      palmPivot.add(heelPad);

      // 3. Sculpted 3D Articulated Thumb on the inner side (-sideSign), splayed outward like the photo
      const thumbSign = -sideSign; // Left hand (-1) has thumb on +X (+1); Right hand (+1) has thumb on -X (-1)
      const thumbGroup = new THREE.Group();
      thumbGroup.position.set(thumbSign * 1.68, -0.04, 0.35);
      thumbGroup.rotation.y = -thumbSign * 0.58;
      palmPivot.add(thumbGroup);

      const thumbProx = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.56, 1.52, 20).rotateX(Math.PI / 2),
        skinMat
      );
      thumbProx.scale.set(1.0, 0.88, 1.0);
      thumbProx.position.set(0, 0, -0.68);
      thumbProx.castShadow = true;
      thumbGroup.add(thumbProx);

      const thumbKnuckle = new THREE.Mesh(
        new THREE.SphereGeometry(0.46, 16, 14),
        knuckleMat
      );
      thumbKnuckle.scale.set(1.0, 0.86, 1.0);
      thumbKnuckle.position.set(0, 0.02, -1.42);
      thumbGroup.add(thumbKnuckle);

      const thumbDistGroup = new THREE.Group();
      thumbDistGroup.position.set(0, 0, -1.42);
      thumbDistGroup.rotation.y = thumbSign * 0.14;
      thumbGroup.add(thumbDistGroup);

      const thumbDist = new THREE.Mesh(
        new THREE.CylinderGeometry(0.38, 0.45, 1.25, 20).rotateX(Math.PI / 2),
        skinMat
      );
      thumbDist.scale.set(1.0, 0.86, 1.0);
      thumbDist.position.set(0, 0, -0.58);
      thumbDist.castShadow = true;
      thumbDistGroup.add(thumbDist);

      const thumbTip = new THREE.Mesh(
        new THREE.SphereGeometry(0.38, 18, 14),
        skinMat
      );
      thumbTip.scale.set(1.0, 0.86, 1.18);
      thumbTip.position.set(0, 0, -1.2);
      thumbDistGroup.add(thumbTip);

      const thumbNail = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 14, 12),
        nailMat
      );
      thumbNail.scale.set(0.96, 0.28, 1.24);
      thumbNail.position.set(0, 0.26, -1.06);
      thumbDistGroup.add(thumbNail);

      // 4. Four Full-Bodied, Thick 3D Articulated Fingers (Index, Middle, Ring, Pinky)
      // Ordered from Index (0, inner side) to Pinky (3, outer side)
      const fingerSpecs = [
        { lateral: -1.22, z: -1.68, l1: 1.56, l2: 1.38, r1: 0.44, rMid: 0.39, r2: 0.33, splay: 0.16, ring: false },  // Index
        { lateral: -0.40, z: -1.88, l1: 1.76, l2: 1.52, r1: 0.47, rMid: 0.41, r2: 0.35, splay: 0.04, ring: false },  // Middle
        { lateral:  0.44, z: -1.76, l1: 1.64, l2: 1.42, r1: 0.44, rMid: 0.39, r2: 0.33, splay: -0.07, ring: sideSign > 0 }, // Ring
        { lateral:  1.24, z: -1.46, l1: 1.32, l2: 1.16, r1: 0.38, rMid: 0.33, r2: 0.28, splay: -0.21, ring: false }   // Pinky
      ];

      const fingerGroups = [];

      fingerSpecs.forEach((f) => {
        const fx = f.lateral * sideSign;
        const fSplay = f.splay * sideSign;

        // Subtle dorsal tendon ridge leading from wrist to each knuckle on the back of the hand
        const tendonGeo = new THREE.CylinderGeometry(0.18, 0.24, 1.85, 12).rotateX(Math.PI / 2);
        const tendon = new THREE.Mesh(tendonGeo, knuckleMat);
        tendon.scale.set(1.1, 0.45, 1.0);
        tendon.position.set(fx * 0.72, 0.48, f.z * 0.48 + 0.25);
        tendon.rotation.y = fSplay * 0.5;
        palmPivot.add(tendon);

        // Base Knuckle Pivot (MCP Joint)
        const fGroup = new THREE.Group();
        fGroup.position.set(fx, -0.02, f.z);
        fGroup.rotation.y = fSplay;

        const mcpDome = new THREE.Mesh(
          new THREE.SphereGeometry(f.r1 * 1.08, 18, 14),
          knuckleMat
        );
        mcpDome.scale.set(1.04, 0.88, 1.08);
        mcpDome.position.set(0, 0.04, 0);
        fGroup.add(mcpDome);

        // Proximal phalanx (thick, rounded 3D cylinder)
        const proxMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(f.rMid, f.r1, f.l1, 20).rotateX(Math.PI / 2),
          skinMat
        );
        proxMesh.scale.set(1.02, 0.9, 1.0);
        proxMesh.position.set(0, 0, -f.l1 / 2);
        proxMesh.castShadow = true;
        proxMesh.receiveShadow = true;
        fGroup.add(proxMesh);

        // Gold Signet Ring on the Right Ring Finger
        if (f.ring) {
          const ringBand = new THREE.Mesh(
            new THREE.CylinderGeometry(f.r1 * 1.06, f.r1 * 1.08, 0.36, 22).rotateX(Math.PI / 2),
            goldMat
          );
          ringBand.scale.set(1.04, 0.92, 1.0);
          ringBand.position.set(0, 0, -f.l1 * 0.44);
          fGroup.add(ringBand);

          const signetGem = new THREE.Mesh(
            new THREE.BoxGeometry(0.42, 0.14, 0.36),
            obsidianMat
          );
          signetGem.position.set(0, f.r1 * 0.88, -f.l1 * 0.44);
          fGroup.add(signetGem);
        }

        // Middle Knuckle Pivot (PIP Joint)
        const distGroup = new THREE.Group();
        distGroup.position.set(0, 0, -f.l1);
        fGroup.add(distGroup);

        const pipDome = new THREE.Mesh(
          new THREE.SphereGeometry(f.rMid * 1.05, 18, 14),
          knuckleMat
        );
        pipDome.scale.set(1.02, 0.88, 1.05);
        pipDome.position.set(0, 0.02, 0);
        distGroup.add(pipDome);

        // Distal/Middle phalanx segment
        const distMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(f.r2, f.rMid, f.l2, 20).rotateX(Math.PI / 2),
          skinMat
        );
        distMesh.scale.set(1.02, 0.88, 1.0);
        distMesh.position.set(0, 0, -f.l2 / 2);
        distMesh.castShadow = true;
        distMesh.receiveShadow = true;
        distGroup.add(distMesh);

        // Plump, rounded 3D fingertip pad
        const tipMesh = new THREE.Mesh(
          new THREE.SphereGeometry(f.r2, 18, 14),
          skinMat
        );
        tipMesh.scale.set(1.02, 0.86, 1.2);
        tipMesh.position.set(0, 0, -f.l2);
        tipMesh.castShadow = true;
        distGroup.add(tipMesh);

        // Contoured glossy fingernail on top of the fingertip
        const nailMesh = new THREE.Mesh(
          new THREE.SphereGeometry(f.r2 * 0.84, 14, 12),
          nailMat
        );
        nailMesh.scale.set(0.96, 0.26, 1.28);
        nailMesh.position.set(0, f.r2 * 0.68, -f.l2 + 0.16);
        distGroup.add(nailMesh);

        fGroup.userData.distGroup = distGroup;
        palmPivot.add(fGroup);
        fingerGroups.push(fGroup);
      });

      return {
        handUnit,
        palmPivot,
        thumbGroup,
        fingerGroups
      };
    }

    // Build BOTH Left Hand (-1) and Right Hand (+1)
    const leftHand = buildSingleSculpted3DHand(-1);
    const rightHand = buildSingleSculpted3DHand(1);

    bothHandsGroup.add(leftHand.handUnit);
    bothHandsGroup.add(rightHand.handUnit);

    return {
      group: bothHandsGroup,
      leftHand,
      rightHand
    };
  }

  /**
   * Creates a soft radial glow texture for highlighting the active player's side of the circular table.
   */
  function createTableZoneHighlightTexture(colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(256, 250, 10, 256, 240, 240);
    grad.addColorStop(0, colorHex);
    grad.addColorStop(0.55, colorHex);
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    return new THREE.CanvasTexture(canvas);
  }

  /**
   * Creates a crisp tabletop nameplate banner showing the player's name & active turn status.
   */
  function createTurnPlaqueTexture(playerName, colorHex, isActive) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = isActive ? 'rgba(26, 17, 10, 0.94)' : 'rgba(20, 14, 9, 0.72)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 496, 96, 28);
    ctx.fill();

    ctx.lineWidth = isActive ? 5 : 2;
    ctx.strokeStyle = isActive ? colorHex : 'rgba(218, 176, 118, 0.28)';
    ctx.stroke();

    ctx.fillStyle = isActive ? '#ffffff' : '#bfb09e';
    ctx.font = isActive
      ? '800 32px "Inter", "Segoe UI", sans-serif'
      : '600 26px "Inter", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = isActive
      ? `👐 ${playerName.toUpperCase()} • YOUR TURN`
      : `🪑 ${playerName}`;
    ctx.fillText(label, 256, 56);

    const tex = new THREE.CanvasTexture(canvas);
    tex.anisotropy = 4;
    return tex;
  }

  // Warm point light that illuminates the active player's side of the table
  const activeSeatLight = new THREE.PointLight(0xffb84d, 1.3, 45, 1.5);
  activeSeatLight.position.set(0, 12, 24);
  scene.add(activeSeatLight);

  /**
   * Spawns and arranges chairs, table-side highlight zones, nameplates, and BOTH open palms
   * around the circular table matching `state.players.length`.
   */
  function updatePlayerChairs() {
    while (chairsGroup.children.length > 0) {
      chairsGroup.remove(chairsGroup.children[0]);
    }
    chairObjects = [];

    const count = state.players.length;
    const chairRadius = 40.5;
    // Arc span for each player's highlighted side of the circular table
    const arcSpan = Math.min(Math.PI * 0.72, (Math.PI * 1.65) / count);

    for (let i = 0; i < count; i++) {
      const angle = (i * 2 * Math.PI) / count;
      const player = state.players[i];
      const chairObj = createSingleChairMesh(player.color);

      const cx = Math.sin(angle) * chairRadius;
      const cz = Math.cos(angle) * chairRadius;
      chairObj.group.position.set(cx, 0, cz);
      chairObj.group.rotation.y = angle;
      chairsGroup.add(chairObj.group);

      // 1. Table-Side Sector Highlight Mesh on the circular tabletop
      const seatTableGroup = new THREE.Group();
      seatTableGroup.rotation.y = angle;
      chairsGroup.add(seatTableGroup);

      // RingGeometry lies in XY plane; rotateX(-PI/2) puts it flat on XZ tabletop.
      // Angle Math.PI/2 in RingGeometry corresponds to +Z (the player's side of the table).
      const sectorGeo = new THREE.RingGeometry(
        10.5,
        27.75,
        48,
        1,
        Math.PI / 2 - arcSpan / 2,
        arcSpan
      );
      sectorGeo.rotateX(-Math.PI / 2);
      const sectorMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(player.color),
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const sectorMesh = new THREE.Mesh(sectorGeo, sectorMat);
      sectorMesh.position.y = 0.03;
      seatTableGroup.add(sectorMesh);

      // Glowing outer rim arc along the player's table edge
      const rimArcGeo = new THREE.RingGeometry(
        26.8,
        27.85,
        48,
        1,
        Math.PI / 2 - arcSpan / 2,
        arcSpan
      );
      rimArcGeo.rotateX(-Math.PI / 2);
      const rimArcMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(player.color),
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const rimArcMesh = new THREE.Mesh(rimArcGeo, rimArcMat);
      rimArcMesh.position.y = 0.06;
      seatTableGroup.add(rimArcMesh);

      // 2. Tabletop Turn Nameplate Plaque on the player's side of the table
      const plaqueGeo = new THREE.PlaneGeometry(11.5, 2.5);
      plaqueGeo.rotateX(-Math.PI / 2.25); // Tilted slightly up for easy reading
      const plaqueMat = new THREE.MeshBasicMaterial({
        map: createTurnPlaqueTexture(player.name, player.color, i === state.currentPlayerIdx),
        transparent: true,
        depthWrite: false
      });
      const plaqueMesh = new THREE.Mesh(plaqueGeo, plaqueMat);
      plaqueMesh.position.set(0, 0.35, 24.4);
      seatTableGroup.add(plaqueMesh);

      // 3. BOTH Open Palms (Left & Right) from the custom image resting on the player's side of the table
      const handObj = createOpenPalmHandMesh(player.color);
      seatTableGroup.add(handObj.group);

      chairObjects.push({
        ...chairObj,
        seatTableGroup,
        sectorMesh,
        sectorMat,
        rimArcMesh,
        rimArcMat,
        plaqueMesh,
        plaqueMat,
        handObj,
        player,
        angle
      });
    }

    if (elSeatCountBadge) {
      elSeatCountBadge.textContent = `${count} ${count === 1 ? 'Chair' : 'Chairs'}`;
    }
    highlightActivePlayerChair();
  }

  function highlightActivePlayerChair() {
    const count = state.players.length;
    chairObjects.forEach((c, idx) => {
      const isTurn = idx === state.currentPlayerIdx;
      const angle = (idx * 2 * Math.PI) / count;
      const radius = isTurn ? 37.8 : 41.8;
      c.group.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius);
      c.cushion.material.emissive.setHex(isTurn ? 0x261505 : 0x000000);

      // Highlight the active player's side of the circular table
      c.sectorMat.opacity = isTurn ? 0.24 : 0.0;
      c.rimArcMat.opacity = isTurn ? 0.88 : 0.14;

      // Update nameplate texture for active vs waiting player
      if (c.plaqueMat.map) c.plaqueMat.map.dispose();
      c.plaqueMat.map = createTurnPlaqueTexture(c.player.name, c.player.color, isTurn);
      c.plaqueMat.needsUpdate = true;

      // Show the open palm hand resting on the table for the player whose turn it is!
      c.handObj.group.visible = isTurn;

      if (isTurn) {
        activeSeatLight.color.set(c.player.color);
        activeSeatLight.position.set(
          Math.sin(angle) * 23,
          11,
          Math.cos(angle) * 23
        );
      }
    });
  }

  // ============================================================================
  // 3 REALISTIC WOOD SPECIES MATERIALS (MAPLE, CHERRY OAK, WALNUT)
  // ============================================================================
  const woodSpeciesData = window.JengaTextures.createThreeWoodSpecies();
  const sharedBumpTex = new THREE.CanvasTexture(woodSpeciesData[0].bumpCanvas);
  sharedBumpTex.anisotropy = 4;

  // Create a 6-face material array for each of the 3 wood species
  const woodSpeciesMaterials = woodSpeciesData.map((sp) => {
    const sideTex = new THREE.CanvasTexture(sp.sideCanvas);
    sideTex.anisotropy = 4;

    const endTex = new THREE.CanvasTexture(sp.endCanvas);
    endTex.anisotropy = 4;

    const sideMat = new THREE.MeshStandardMaterial({
      map: sideTex,
      bumpMap: sharedBumpTex,
      bumpScale: 0.032,
      roughness: 0.54,
      metalness: 0.02
    });

    const endMat = new THREE.MeshStandardMaterial({
      map: endTex,
      bumpMap: sharedBumpTex,
      bumpScale: 0.04,
      roughness: 0.68,
      metalness: 0.01
    });

    // BoxGeometry face order: +X (long side), -X (long side), +Y (top), -Y (bottom), +Z (short end), -Z (short end)
    return {
      name: sp.name,
      materials: [sideMat, sideMat, sideMat, sideMat, endMat, endMat]
    };
  });

  // Top Placement Ghost Slots (3 interactive slots on the topmost layer)
  const ghostSlotsGroup = new THREE.Group();
  scene.add(ghostSlotsGroup);
  const ghostSlotMeshes = [];

  const ghostMatBase = new THREE.MeshBasicMaterial({
    color: 0xe59838,
    transparent: true,
    opacity: 0.28
  });
  const ghostMatHover = new THREE.MeshBasicMaterial({
    color: 0x4cd97b,
    transparent: true,
    opacity: 0.52
  });

  for (let i = 0; i < 3; i++) {
    const slotGeo = new THREE.BoxGeometry(BLOCK_WIDTH, BLOCK_HEIGHT, BLOCK_LENGTH);
    const slotMesh = new THREE.Mesh(slotGeo, ghostMatBase.clone());
    slotMesh.userData = { isGhostSlot: true, slotIndex: i };
    slotMesh.visible = false;

    const edges = new THREE.EdgesGeometry(slotGeo);
    const line = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0xffd596 })
    );
    slotMesh.add(line);

    ghostSlotsGroup.add(slotMesh);
    ghostSlotMeshes.push(slotMesh);
  }

  // Subtle selection outline highlight mesh
  const highlightGeo = new THREE.BoxGeometry(
    BLOCK_WIDTH + 0.08,
    BLOCK_HEIGHT + 0.08,
    BLOCK_LENGTH + 0.08
  );
  const highlightEdges = new THREE.EdgesGeometry(highlightGeo);
  const highlightLine = new THREE.LineSegments(
    highlightEdges,
    new THREE.LineBasicMaterial({ color: 0x4cd97b, transparent: true, opacity: 0.85 })
  );
  highlightLine.visible = false;
  scene.add(highlightLine);

  // Blocks Registry
  let blocks = [];
  const sharedBoxGeo = new THREE.BoxGeometry(BLOCK_WIDTH, BLOCK_HEIGHT, BLOCK_LENGTH);
  const sharedShape = new CANNON.Box(
    new CANNON.Vec3(BLOCK_WIDTH / 2, BLOCK_HEIGHT / 2, BLOCK_LENGTH / 2)
  );

  function syncMeshToBody(mesh, body) {
    mesh.position.set(body.position.x, body.position.y, body.position.z);
    mesh.quaternion.set(
      body.quaternion.x,
      body.quaternion.y,
      body.quaternion.z,
      body.quaternion.w
    );
  }

  /**
   * Build the 54-block 18-story Jenga tower using the 3 distinct wood colors/species.
   */
  function buildTower(seed = Date.now()) {
    blocks.forEach((b) => {
      scene.remove(b.mesh);
      world.removeBody(b.body);
    });
    blocks = [];
    highlightLine.visible = false;
    hideGhostSlots();

    let rngState = Math.abs(Math.floor(seed)) % 2147483647;
    if (rngState <= 0) rngState += 2147483646;
    const nextRand = () => {
      rngState = (rngState * 16807) % 2147483647;
      return (rngState - 1) / 2147483646;
    };

    const halfH = BLOCK_HEIGHT / 2;
    let idCounter = 0;

    for (let layer = 0; layer < INITIAL_LAYERS; layer++) {
      const isEven = layer % 2 === 0;
      const y = layer * BLOCK_HEIGHT + halfH;

      // Shuffle tensions (loose, medium, tight) per 3-block layer
      const tensions = ['loose', 'medium', 'tight'];
      for (let k = tensions.length - 1; k > 0; k--) {
        const r = Math.floor(nextRand() * (k + 1));
        const tmp = tensions[k];
        tensions[k] = tensions[r];
        tensions[r] = tmp;
      }

      // Shuffle the 3 wood colors/species (Maple, Cherry Oak, Walnut) so each row showcases all 3 woods
      const woodOrder = [0, 1, 2];
      for (let k = woodOrder.length - 1; k > 0; k--) {
        const r = Math.floor(nextRand() * (k + 1));
        const tmp = woodOrder[k];
        woodOrder[k] = woodOrder[r];
        woodOrder[r] = tmp;
      }

      for (let slot = 0; slot < BLOCKS_PER_LAYER; slot++) {
        const offset = (slot - 1) * (BLOCK_WIDTH + GAP);
        const x = isEven ? offset : 0;
        const z = isEven ? 0 : offset;

        const woodIdx = woodOrder[slot];
        const woodSpec = woodSpeciesMaterials[woodIdx];
        const mesh = new THREE.Mesh(sharedBoxGeo, woodSpec.materials);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        const body = new CANNON.Body({
          mass: 1.0,
          material: woodMaterial,
          shape: sharedShape,
          linearDamping: 0.18,
          angularDamping: 0.28
        });
        body.position.set(x, y, z);
        body.sleepSpeedLimit = 0.18;
        body.sleepTimeLimit = 0.35;

        if (!isEven) {
          const q = new CANNON.Quaternion();
          q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
          body.quaternion.copy(q);
        }

        syncMeshToBody(mesh, body);
        body.sleep();

        scene.add(mesh);
        world.addBody(body);

        const tension = tensions[slot];
        const resistanceMap = { loose: 0.12, medium: 0.45, tight: 0.85 };

        const blockObj = {
          id: idCounter++,
          layer,
          slot,
          isEven,
          woodName: woodSpec.name,
          tension,
          resistance: resistanceMap[tension],
          mesh,
          body,
          initialPos: new THREE.Vector3(x, y, z),
          pullDistance: 0,
          extracted: false
        };

        mesh.userData.block = blockObj;
        blocks.push(blockObj);
      }
    }

    state.turnPhase = 'SELECT';
    state.activeBlock = null;
    state.committedBlock = null;
    state.towerPeakLayer = INITIAL_LAYERS - 1;
    elStabilityBar.style.width = '10%';
    elStabilityText.textContent = 'Solid & Balanced';
    updateBlockInspector(null, false);
    updatePlayerChairs();
    updateHUD();
  }

  function getLayerStatus() {
    const layerCounts = new Map();
    let maxLayer = 0;

    for (const b of blocks) {
      if (state.activeBlock && b.id === state.activeBlock.id) continue;
      if (b.body.position.y < 0.5) continue;
      const approxLayer = Math.max(
        0,
        Math.round((b.body.position.y - BLOCK_HEIGHT / 2) / BLOCK_HEIGHT)
      );
      b.layer = approxLayer;
      layerCounts.set(approxLayer, (layerCounts.get(approxLayer) || 0) + 1);
      if (approxLayer > maxLayer) maxLayer = approxLayer;
    }

    const topLayerCount = layerCounts.get(maxLayer) || 0;
    const highestCompletedLayer = topLayerCount >= 3 ? maxLayer : maxLayer - 1;
    const targetPlacementLayer = topLayerCount < 3 ? maxLayer : maxLayer + 1;

    return {
      maxLayer,
      topLayerCount,
      highestCompletedLayer,
      targetPlacementLayer,
      layerCounts
    };
  }

  function isBlockAllowedToPull(block) {
    if (state.turnPhase !== 'SELECT' && state.turnPhase !== 'PULLING') return false;
    if (state.committedBlock && state.committedBlock.id !== block.id) return false;
    const status = getLayerStatus();
    return block.layer < status.highestCompletedLayer;
  }

  // ============================================================================
  // FLAWLESS 360° 3D RAY-TO-AXIS CLOSEST POINT BLOCK EXTRACTION
  // ============================================================================
  const activePointers = new Set();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointerStart = new THREE.Vector2();
  const blockDragStartPos = new THREE.Vector3();
  const blockGrabWorldPoint = new THREE.Vector3();
  let grabAxisT0 = 0;
  let isDraggingBlock = false;

  /**
   * Computes the parameter `t` along the 3D line `L(t) = lineOrigin + t * lineAxis`
   * that is closest to the current camera ray `R(s) = ray.origin + s * ray.direction`.
   * Works reliably from all 360° angles without plane-grazing issues.
   */
  function getClosestAxisParamToRay(lineOrigin, lineAxis, ray) {
    const w0 = lineOrigin.clone().sub(ray.origin);
    const b = lineAxis.dot(ray.direction);
    const denom = 1.0 - b * b;

    if (denom < 0.06) {
      // Looking nearly straight down the barrel of the block:
      // Use vertical/horizontal screen pointer delta to pull toward camera
      const camToBlock = lineOrigin.clone().sub(camera.position).normalize();
      const signTowardCam = Math.sign( lineAxis.dot(camToBlock) ) || 1;
      const screenPull = (pointerStart.y - pointer.y) * 14.0;
      return grabAxisT0 - signTowardCam * screenPull;
    }

    const dDotW0 = ray.direction.dot(w0);
    const uDotW0 = lineAxis.dot(w0);
    return (uDotW0 * b - dDotW0) / denom;
  }

  function updatePointer(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    const clientX =
      e.clientX !== undefined
        ? e.clientX
        : e.touches && e.touches[0]
        ? e.touches[0].clientX
        : 0;
    const clientY =
      e.clientY !== undefined
        ? e.clientY
        : e.touches && e.touches[0]
        ? e.touches[0].clientY
        : 0;
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  function cancelActiveBlockDragToOrbit() {
    if (!isDraggingBlock) return;
    isDraggingBlock = false;
    controls.enabled = true;
    container.className = '';
    if (state.turnPhase === 'PULLING' && state.activeBlock) {
      if (state.activeBlock.pullDistance < 1.8 && !state.committedBlock) {
        state.activeBlock = null;
        state.turnPhase = 'SELECT';
        updateHUD();
      }
    }
  }

  function onPointerDown(e) {
    if (e.pointerId !== undefined) {
      activePointers.add(e.pointerId);
    }

    if (activePointers.size > 1) {
      cancelActiveBlockDragToOrbit();
      return;
    }

    if (e.button !== undefined && e.button !== 0) return;
    if (state.turnPhase === 'GAMEOVER' || state.turnPhase === 'SETTLING') return;

    updatePointer(e);
    pointerStart.copy(pointer);
    raycaster.setFromCamera(pointer, camera);

    if (state.turnPhase === 'STACKING') {
      const slotHits = raycaster.intersectObjects(ghostSlotMeshes, false);
      if (slotHits.length > 0) {
        const slotIndex = slotHits[0].object.userData.slotIndex;
        placeActiveBlockOnTop(slotIndex);
      }
      return;
    }

    const meshes = blocks.map((b) => b.mesh);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hitBlock = intersects[0].object.userData.block;
      const allowed = isBlockAllowedToPull(hitBlock);

      highlightLine.position.copy(hitBlock.mesh.position);
      highlightLine.quaternion.copy(hitBlock.mesh.quaternion);
      highlightLine.material.color.setHex(allowed ? 0x4cd97b : 0xff5c5c);
      highlightLine.visible = true;
      updateBlockInspector(hitBlock, allowed);

      if (state.interactionMode === 'orbit') {
        window.JengaAudio.playWoodTap(1.1, 0.15);
        return;
      }

      if (!allowed) {
        window.JengaAudio.playWoodTap(0.6, 0.2);
        if (state.committedBlock && state.committedBlock.id !== hitBlock.id) {
          showToast('One-hand rule: Finish pulling the block you already started moving!');
        } else {
          showToast('Rule: Pull from below the highest completed 3-block layer!');
        }
        return;
      }

      isDraggingBlock = true;
      state.activeBlock = hitBlock;
      state.turnPhase = 'PULLING';
      controls.enabled = false;
      container.className = 'dragging-block';

      blocks.forEach((b) => {
        if (Math.abs(b.layer - hitBlock.layer) <= 2) {
          b.body.wakeUp();
        }
      });

      window.JengaAudio.playWoodTap(
        hitBlock.tension === 'loose' ? 1.25 : hitBlock.tension === 'medium' ? 1.0 : 0.78,
        0.3
      );

      blockDragStartPos.set(
        hitBlock.body.position.x,
        hitBlock.body.position.y,
        hitBlock.body.position.z
      );
      blockGrabWorldPoint.copy(intersects[0].point);

      const axis = hitBlock.isEven
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(1, 0, 0);
      grabAxisT0 = 0;
      grabAxisT0 = getClosestAxisParamToRay(blockGrabWorldPoint, axis, raycaster.ray);

      updateHUD();
    }
  }

  function onPointerMove(e) {
    if (state.turnPhase === 'GAMEOVER' || state.turnPhase === 'SETTLING') return;
    if (activePointers.size > 1) return;

    updatePointer(e);
    raycaster.setFromCamera(pointer, camera);

    if (isDraggingBlock && state.activeBlock) {
      const b = state.activeBlock;
      const axis = b.isEven
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(1, 0, 0);

      const currentT = getClosestAxisParamToRay(blockGrabWorldPoint, axis, raycaster.ray);
      const alongDist = currentT - grabAxisT0;

      const damping = 1.0 - b.resistance * 0.42;
      const effectiveAlong = THREE.MathUtils.clamp(
        alongDist * damping,
        -BLOCK_LENGTH * 1.15,
        BLOCK_LENGTH * 1.15
      );

      const targetPos = blockDragStartPos
        .clone()
        .addScaledVector(axis, effectiveAlong);

      b.body.wakeUp();
      b.body.position.x = targetPos.x;
      b.body.position.z = targetPos.z;
      b.body.velocity.set(0, 0, 0);
      b.body.angularVelocity.set(0, 0, 0);

      if (b.resistance > 0.4 && Math.abs(effectiveAlong) > 0.15) {
        applyNeighborFrictionTug(b, axis, effectiveAlong);
      }

      b.pullDistance = Math.hypot(
        b.body.position.x - b.initialPos.x,
        b.body.position.z - b.initialPos.z
      );

      window.JengaAudio.playWoodSlide(b.resistance);

      if (b.pullDistance > 1.8 && !state.committedBlock) {
        state.committedBlock = b;
        showToast('Committed to this block! Slide it all the way out.');
      }

      if (b.pullDistance >= BLOCK_LENGTH * 0.88) {
        completeBlockExtraction(b);
      }
      return;
    }

    if (state.turnPhase === 'STACKING') {
      const hits = raycaster.intersectObjects(ghostSlotMeshes, false);
      ghostSlotMeshes.forEach((m) => (m.material = ghostMatBase));
      if (hits.length > 0) {
        hits[0].object.material = ghostMatHover;
        container.className = 'hover-block';
      } else {
        container.className = '';
      }
      return;
    }

    if (e.pointerType === 'touch') return;

    const meshes = blocks.map((b) => b.mesh);
    const intersects = raycaster.intersectObjects(meshes, false);

    if (intersects.length > 0) {
      const hitBlock = intersects[0].object.userData.block;
      state.hoveredBlock = hitBlock;
      const allowed = isBlockAllowedToPull(hitBlock);

      highlightLine.position.copy(hitBlock.mesh.position);
      highlightLine.quaternion.copy(hitBlock.mesh.quaternion);
      highlightLine.material.color.setHex(allowed ? 0x4cd97b : 0xff5c5c);
      highlightLine.visible = true;

      container.className = allowed ? 'hover-block' : 'forbidden-block';
      updateBlockInspector(hitBlock, allowed);
    } else {
      state.hoveredBlock = null;
      highlightLine.visible = false;
      container.className = '';
      updateBlockInspector(null, false);
    }
  }

  function onPointerUp(e) {
    if (e && e.pointerId !== undefined) {
      activePointers.delete(e.pointerId);
    }
    if (!isDraggingBlock) return;
    isDraggingBlock = false;
    controls.enabled = true;
    container.className = '';

    if (state.turnPhase === 'PULLING' && state.activeBlock) {
      const b = state.activeBlock;
      if (b.pullDistance < 1.8 && !state.committedBlock) {
        state.activeBlock = null;
        state.turnPhase = 'SELECT';
      }
      updateHUD();
    }
  }

  function applyNeighborFrictionTug(pulledBlock, axis, alongDist) {
    const sign = Math.sign(alongDist) || 1;
    const forceMag = (pulledBlock.resistance - 0.3) * 0.026;

    for (const other of blocks) {
      if (other.id === pulledBlock.id) continue;
      const dy = other.body.position.y - pulledBlock.body.position.y;
      if (dy >= -0.3 && dy <= BLOCK_HEIGHT * 1.35) {
        other.body.wakeUp();
        other.body.position.x += axis.x * sign * forceMag;
        other.body.position.z += axis.z * sign * forceMag;
      }
    }
  }

  function completeBlockExtraction(block) {
    isDraggingBlock = false;
    controls.enabled = true;
    block.extracted = true;
    state.turnPhase = 'STACKING';
    highlightLine.visible = false;

    window.JengaAudio.playWoodTap(1.35, 0.35);

    const status = getLayerStatus();
    const targetLayer = status.targetPlacementLayer;
    const isEven = targetLayer % 2 === 0;
    const targetY = targetLayer * BLOCK_HEIGHT + BLOCK_HEIGHT / 2;

    block.body.sleep();
    block.body.velocity.set(0, 0, 0);
    block.body.angularVelocity.set(0, 0, 0);
    block.body.position.set(0, targetY + 3.2, 0);

    const q = new CANNON.Quaternion();
    if (!isEven) {
      q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
    }
    block.body.quaternion.copy(q);
    syncMeshToBody(block.mesh, block.body);

    showGhostSlots(targetLayer);
    updateHUD();
  }

  function showGhostSlots(targetLayer) {
    const isEven = targetLayer % 2 === 0;
    const y = targetLayer * BLOCK_HEIGHT + BLOCK_HEIGHT / 2;

    const occupiedSlots = new Set();
    for (const b of blocks) {
      if (state.activeBlock && b.id === state.activeBlock.id) continue;
      if (b.layer === targetLayer) {
        const coord = isEven ? b.body.position.x : b.body.position.z;
        const approxSlot = Math.round(coord / BLOCK_WIDTH) + 1;
        occupiedSlots.add(THREE.MathUtils.clamp(approxSlot, 0, 2));
      }
    }

    for (let i = 0; i < 3; i++) {
      const slotMesh = ghostSlotMeshes[i];
      const offset = (i - 1) * (BLOCK_WIDTH + GAP);
      slotMesh.position.set(isEven ? offset : 0, y, isEven ? 0 : offset);
      slotMesh.rotation.set(0, isEven ? 0 : Math.PI / 2, 0);
      slotMesh.visible = !occupiedSlots.has(i);
      slotMesh.material = ghostMatBase;

      const btn = document.querySelector(`[data-slot="${i}"]`);
      if (btn) {
        btn.disabled = occupiedSlots.has(i);
        btn.style.opacity = occupiedSlots.has(i) ? '0.35' : '1';
      }
    }

    elSlotPicker.classList.add('visible');
  }

  function hideGhostSlots() {
    ghostSlotMeshes.forEach((m) => (m.visible = false));
    elSlotPicker.classList.remove('visible');
  }

  function placeActiveBlockOnTop(slotIndex, fromNetwork = false) {
    if (state.turnPhase !== 'STACKING' || !state.activeBlock) return;
    const block = state.activeBlock;
    const status = getLayerStatus();
    const targetLayer = status.targetPlacementLayer;
    const isEven = targetLayer % 2 === 0;
    const offset = (slotIndex - 1) * (BLOCK_WIDTH + GAP);
    const y = targetLayer * BLOCK_HEIGHT + BLOCK_HEIGHT / 2 + 0.16;

    hideGhostSlots();

    block.layer = targetLayer;
    block.slot = slotIndex;
    block.isEven = isEven;
    block.extracted = false;
    block.pullDistance = 0;
    block.tension = 'medium';
    block.resistance = 0.45;

    const x = isEven ? offset : 0;
    const z = isEven ? 0 : offset;

    block.body.position.set(x, y, z);
    block.body.velocity.set(0, -1.2, 0);
    block.body.angularVelocity.set(0, 0, 0);

    const q = new CANNON.Quaternion();
    if (!isEven) {
      q.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), Math.PI / 2);
    }
    block.body.quaternion.copy(q);
    syncMeshToBody(block.mesh, block.body);
    block.body.wakeUp();
    block.initialPos.set(x, targetLayer * BLOCK_HEIGHT + BLOCK_HEIGHT / 2, z);

    window.JengaAudio.playBlockPlace();

    if (!fromNetwork) {
      broadcastMove({
        type: 'MOVE_COMPLETE',
        blockId: block.id,
        slotIndex,
        targetLayer
      });
    }

    state.turnPhase = 'SETTLING';
    if (targetLayer > state.towerPeakLayer) {
      state.towerPeakLayer = targetLayer;
    }
    updateHUD();

    setTimeout(() => {
      if (state.turnPhase === 'GAMEOVER') return;
      checkTowerCollapse();
      if (state.turnPhase !== 'GAMEOVER') {
        completeTurnSuccess();
      }
    }, 1100);
  }

  function completeTurnSuccess() {
    window.JengaAudio.playTurnSuccess();
    state.players[state.currentPlayerIdx].moves += 1;
    state.blocksMovedTotal += 1;
    state.turnNumber += 1;
    state.currentPlayerIdx = (state.currentPlayerIdx + 1) % state.players.length;
    state.activeBlock = null;
    state.committedBlock = null;
    state.turnPhase = 'SELECT';
    highlightActivePlayerChair();
    updateHUD();
  }

  function checkTowerCollapse() {
    if (state.turnPhase === 'GAMEOVER') return;

    let fallenCount = 0;
    let totalDisplacement = 0;

    for (const b of blocks) {
      if (
        state.activeBlock &&
        b.id === state.activeBlock.id &&
        (state.turnPhase === 'PULLING' || state.turnPhase === 'STACKING')
      ) {
        continue;
      }

      if (b.layer >= 1 && b.body.position.y < 1.15) {
        fallenCount++;
      }

      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(b.mesh.quaternion);
      if (up.y < 0.45) {
        fallenCount++;
      }

      const speed = b.body.velocity.length();
      totalDisplacement += speed;
    }

    const instabilityPct = Math.min(
      100,
      Math.round(totalDisplacement * 3.5 + fallenCount * 35)
    );
    elStabilityBar.style.width = `${Math.max(8, instabilityPct)}%`;
    if (instabilityPct < 30) {
      elStabilityText.textContent = 'Solid & Balanced';
    } else if (instabilityPct < 65) {
      elStabilityText.textContent = 'Shifting Weight...';
    } else {
      elStabilityText.textContent = 'CRITICAL TILT!';
    }

    if (fallenCount >= 2) {
      triggerGameOver();
    }
  }

  function triggerGameOver() {
    if (state.turnPhase === 'GAMEOVER') return;
    state.turnPhase = 'GAMEOVER';
    isDraggingBlock = false;
    controls.enabled = true;
    hideGhostSlots();

    // Plays "Oh!" vocal reaction + collapsing wood blocks clatter
    window.JengaAudio.playTowerCollapse();

    const loser = state.players[state.currentPlayerIdx];
    const winnerIdx =
      (state.currentPlayerIdx - 1 + state.players.length) % state.players.length;
    const winner = state.players[winnerIdx];

    showToast(`😱 Oh! ${loser.name} broke the tower!`);
    updateHUD();

    setTimeout(() => {
      const modal = document.getElementById('gameover-modal');
      const title = document.getElementById('gameover-title');
      const desc = document.getElementById('gameover-desc');

      if (state.players.length === 1) {
        title.textContent = 'Oh! Tower Collapsed!';
        desc.textContent = `You stacked the tower to ${
          state.towerPeakLayer + 1
        } stories (${state.blocksMovedTotal} blocks moved) before it tumbled!`;
      } else {
        // Play "Yey!" victory celebration sound + fanfare + applause for the winner!
        window.JengaAudio.playWinYey();
        title.textContent = `🎉 Yey! ${winner.name} Wins!`;
        desc.textContent = `Oh! The tower collapsed on ${loser.name}'s turn at ${
          state.towerPeakLayer + 1
        } stories high (${state.blocksMovedTotal} successful moves).`;
      }
      modal.classList.add('open');
    }, 1150);
  }

  // UI & HUD Updates
  function updateBlockInspector(block, allowed) {
    if (!block) {
      elBlockInspector.innerHTML =
        'Hover or tap any block below the top completed layer to inspect its wood species and tension.';
      elMobileBlockPill.classList.remove('active');
      return;
    }

    if (!allowed) {
      const msg = `<span class="badge-pill badge-tight">Locked Layer ${
        block.layer + 1
      }</span> Top completed layer cannot be pulled`;
      elBlockInspector.innerHTML = msg;
      elMobileBlockPill.innerHTML = msg;
      elMobileBlockPill.classList.add('active');
      return;
    }

    const badgeClass =
      block.tension === 'loose'
        ? 'badge-loose'
        : block.tension === 'medium'
        ? 'badge-medium'
        : 'badge-tight';
    const label =
      block.tension === 'loose'
        ? 'Loose (Easy Pull)'
        : block.tension === 'medium'
        ? 'Snug (Moderate Friction)'
        : 'Tight (Load-Bearing!)';

    const slotName =
      block.slot === 1 ? 'Center' : block.slot === 0 ? 'Left' : 'Right';
    elBlockInspector.innerHTML = `<strong>Layer ${
      block.layer + 1
    } • ${block.woodName} (${slotName})</strong><br/><span class="badge-pill ${badgeClass}">${label}</span>`;

    elMobileBlockPill.innerHTML = `<strong>L${block.layer + 1} ${
      block.woodName
    }</strong> • <span class="badge-pill ${badgeClass}">${label}</span>`;
    elMobileBlockPill.classList.add('active');
  }

  function updateHUD() {
    const activePlayer = state.players[state.currentPlayerIdx];
    elTurnPlayerName.textContent = `${activePlayer.name}'s Turn`;
    elPlayerDot.style.background = activePlayer.color;
    elPlayerDot.style.boxShadow = `0 0 12px ${activePlayer.color}`;

    elStatHeight.textContent = `${state.towerPeakLayer + 1}`;
    elStatMoves.textContent = `${state.blocksMovedTotal}`;

    if (state.turnPhase === 'SELECT') {
      elTurnPhaseText.textContent = 'Step 1: Pull a loose block';
      elCoachBadge.textContent = 'STEP 1 • EXTRACT';
      elCoachText.textContent =
        state.interactionMode === 'orbit'
          ? '360° View Mode active: Drag anywhere to spin around the table & chairs. Tap "🖐️ Pull" to slide a block!'
          : 'Drag any block below the top completed row along its length. Orbit 360° to see all sides & player chairs!';
    } else if (state.turnPhase === 'PULLING') {
      elTurnPhaseText.textContent = 'Sliding block out...';
      elCoachBadge.textContent = 'PULLING BLOCK';
      elCoachText.textContent =
        'Slide the block steadily along its length until it clears the tower.';
    } else if (state.turnPhase === 'STACKING') {
      elTurnPhaseText.textContent = 'Step 2: Stack on top layer';
      elCoachBadge.textContent = 'STEP 2 • STACK ON TOP';
      elCoachText.textContent =
        'Tap one of the 3 glowing slots on top of the tower (or use the slot buttons) to place your block.';
    } else if (state.turnPhase === 'SETTLING') {
      elTurnPhaseText.textContent = 'Checking tower stability...';
      elCoachBadge.textContent = 'HOLD BREATH...';
      elCoachText.textContent =
        'Verifying the tower holds steady before advancing to the next chair...';
    } else if (state.turnPhase === 'GAMEOVER') {
      elTurnPhaseText.textContent = 'Tower Collapsed!';
      elCoachBadge.textContent = 'GAME OVER';
      elCoachText.textContent = 'Tap "Reset" to stack a fresh 54-block tower!';
    }

    elPlayerList.innerHTML = '';
    state.players.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = `player-row ${
        idx === state.currentPlayerIdx ? 'active' : ''
      }`;
      row.innerHTML = `
        <div class="player-row-left">
          <span class="player-Color-pip" style="background:${p.color}"></span>
          <span>🪑 ${p.name}</span>
        </div>
        <span class="player-moves">${p.moves} moves</span>
      `;
      elPlayerList.appendChild(row);
    });
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    elToastContainer.appendChild(t);
    setTimeout(() => {
      t.remove();
    }, 3000);
  }

  // 360° Camera Orbit Controls & Compass Synchronization
  function getCameraAzimuthDeg() {
    const offset = camera.position.clone().sub(controls.target);
    let rad = Math.atan2(offset.x, offset.z);
    let deg = Math.round(THREE.MathUtils.radToDeg(rad));
    if (deg < 0) deg += 360;
    return deg % 360;
  }

  function setCameraAzimuthDeg(deg, smooth = false) {
    const targetRad = THREE.MathUtils.degToRad(deg);
    const offset = camera.position.clone().sub(controls.target);
    const radiusXZ = Math.max(8, Math.hypot(offset.x, offset.z));
    const targetPos = new THREE.Vector3(
      controls.target.x + radiusXZ * Math.sin(targetRad),
      camera.position.y,
      controls.target.z + radiusXZ * Math.cos(targetRad)
    );

    if (smooth) {
      animateCameraTo(targetPos, controls.target.clone());
    } else {
      camera.position.copy(targetPos);
      controls.update();
    }
  }

  function updateCompassHUD() {
    const deg = getCameraAzimuthDeg();
    if (document.activeElement !== elOrbitSlider) {
      elOrbitSlider.value = String(deg);
    }
    const dirs = ['FRONT', 'NE', 'RIGHT', 'SE', 'BACK', 'SW', 'LEFT', 'NW'];
    const dirIdx = Math.round(deg / 45) % 8;
    elCompassReadout.textContent = `${deg}° ${dirs[dirIdx]}`;
  }

  function animateCameraTo(pos, targetPos) {
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();
    const duration = 340;
    const startTime = performance.now();

    function step(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 3);
      camera.position.lerpVectors(startPos, pos, ease);
      controls.target.lerpVectors(startTarget, targetPos, ease);
      controls.update();
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  document.getElementById('cam-rot-left').addEventListener('click', () => {
    const nextDeg = (getCameraAzimuthDeg() - 45 + 360) % 360;
    setCameraAzimuthDeg(nextDeg, true);
  });

  document.getElementById('cam-rot-right').addEventListener('click', () => {
    const nextDeg = (getCameraAzimuthDeg() + 45) % 360;
    setCameraAzimuthDeg(nextDeg, true);
  });

  elOrbitSlider.addEventListener('input', (e) => {
    const deg = parseInt(e.target.value, 10) || 0;
    setCameraAzimuthDeg(deg, false);
  });

  document.getElementById('cam-top').addEventListener('click', (e) => {
    state.isTopView = !state.isTopView;
    const deg = getCameraAzimuthDeg();
    const rad = THREE.MathUtils.degToRad(deg);
    const topY = (state.towerPeakLayer + 1) * BLOCK_HEIGHT;

    if (state.isTopView) {
      e.currentTarget.classList.add('btn-primary');
      animateCameraTo(
        new THREE.Vector3(16 * Math.sin(rad), topY + 18, 16 * Math.cos(rad)),
        new THREE.Vector3(0, Math.max(12, topY - 2), 0)
      );
    } else {
      e.currentTarget.classList.remove('btn-primary');
      const dist = getIdealCameraDistance();
      animateCameraTo(
        new THREE.Vector3(dist * Math.sin(rad), 20, dist * Math.cos(rad)),
        new THREE.Vector3(0, 13.0, 0)
      );
    }
  });

  // Touch Mode Toggle (🖐️ Pull vs 🔄 360° View)
  const btnModePull = document.getElementById('mode-btn-pull');
  const btnModeOrbit = document.getElementById('mode-btn-orbit');

  btnModePull.addEventListener('click', () => {
    state.interactionMode = 'pull';
    btnModePull.classList.add('active');
    btnModeOrbit.classList.remove('active');
    updateHUD();
  });

  btnModeOrbit.addEventListener('click', () => {
    state.interactionMode = 'orbit';
    btnModeOrbit.classList.add('active');
    btnModePull.classList.remove('active');
    updateHUD();
  });

  document.querySelectorAll('[data-slot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slotIndex = parseInt(btn.getAttribute('data-slot'), 10);
      placeActiveBlockOnTop(slotIndex);
    });
  });

  document.getElementById('btn-sound').addEventListener('click', () => {
    const on = window.JengaAudio.toggle();
    document.getElementById('sound-icon').textContent = on ? '🔊' : '🔇';
    document.getElementById('sound-label').textContent = on
      ? 'Sound: ON'
      : 'Sound: OFF';
  });

  document.getElementById('btn-rules').addEventListener('click', () => {
    document.getElementById('rules-modal').classList.add('open');
  });

  document.getElementById('btn-close-rules').addEventListener('click', () => {
    document.getElementById('rules-modal').classList.remove('open');
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    state.players.forEach((p) => (p.moves = 0));
    state.currentPlayerIdx = 0;
    state.turnNumber = 1;
    state.blocksMovedTotal = 0;
    const seed = Math.floor(Math.random() * 1000000);
    buildTower(seed);
    broadcastMove({ type: 'RESET_TOWER', seed });
    showToast('New 54-block tower stacked!');
  });

  document.getElementById('btn-play-again').addEventListener('click', () => {
    document.getElementById('gameover-modal').classList.remove('open');
    document.getElementById('btn-reset').click();
  });

  // Players & Chairs Modal Setup (1 to 4 Players)
  const lobbyModal = document.getElementById('lobby-modal');
  document.getElementById('btn-mode').addEventListener('click', () => {
    lobbyModal.classList.add('open');
  });
  document.getElementById('btn-close-lobby').addEventListener('click', () => {
    lobbyModal.classList.remove('open');
  });

  const tabBtns = document.querySelectorAll('.mode-tab');
  const sectionPass = document.getElementById('mode-section-pass');
  const sectionOnline = document.getElementById('mode-section-online');

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const m = btn.getAttribute('data-mode');
      if (m === 'online') {
        sectionPass.style.display = 'none';
        sectionOnline.style.display = 'block';
      } else {
        sectionPass.style.display = 'block';
        sectionOnline.style.display = 'none';
      }
    });
  });

  document.getElementById('btn-start-local').addEventListener('click', () => {
    const p1 = document.getElementById('input-p1').value.trim() || 'Player 1';
    const p2 = document.getElementById('input-p2').value.trim();
    const p3 = document.getElementById('input-p3').value.trim();
    const p4Input = document.getElementById('input-p4');
    const p4 = p4Input ? p4Input.value.trim() : '';

    const colors = ['#e59838', '#4cd97b', '#5ca8ff', '#e066ff'];
    const names = [p1];
    if (p2) names.push(p2);
    if (p3) names.push(p3);
    if (p4) names.push(p4);

    state.players = names.map((name, i) => ({
      name,
      color: colors[i % colors.length],
      moves: 0
    }));
    state.currentPlayerIdx = 0;
    state.blocksMovedTotal = 0;
    buildTower();
    lobbyModal.classList.remove('open');
    showToast(
      `Seated ${state.players.length} ${
        state.players.length === 1 ? 'player' : 'players'
      } around the table!`
    );
  });

  // Instant Room Code Multiplayer (BroadcastChannel + PeerJS WebRTC)
  function setupRoomChannel(code, guestName, isHost) {
    state.roomCode = code;
    state.isHost = isHost;

    if (state.channel) state.channel.close();
    if ('BroadcastChannel' in window) {
      state.channel = new BroadcastChannel(`jenga_room_${code}`);
      state.channel.onmessage = (ev) => handleNetworkMessage(ev.data);
    }

    if (window.Peer) {
      if (state.peer) state.peer.destroy();
      state.connections = [];
      const peerId = isHost
        ? `jenga-online-room-${code}`
        : `jenga-online-guest-${code}-${Math.floor(Math.random() * 9999)}`;
      try {
        const peer = new window.Peer(peerId);
        state.peer = peer;

        peer.on('open', () => {
          if (!isHost) {
            const conn = peer.connect(`jenga-online-room-${code}`);
            conn.on('open', () => {
              state.connections.push(conn);
              conn.send({ type: 'PLAYER_JOINED', name: guestName || 'Challenger' });
            });
            conn.on('data', (data) => handleNetworkMessage(data));
          }
        });

        peer.on('connection', (conn) => {
          state.connections.push(conn);
          conn.on('data', (data) => handleNetworkMessage(data));
        });
      } catch (err) {
        console.warn('PeerJS fallback to local BroadcastChannel:', err);
      }
    }

    document.getElementById('active-room-display').style.display = 'flex';
    document.getElementById('room-code-value').textContent = code;

    if (isHost) {
      state.players = [
        { name: guestName || 'Host Player', color: '#e59838', moves: 0 },
        { name: 'Waiting for Opponent...', color: '#4cd97b', moves: 0 }
      ];
      buildTower(12345);
      showToast(`Room ${code} created! Open another tab or share code.`);
    } else {
      state.players = [
        { name: 'Host Player', color: '#e59838', moves: 0 },
        { name: guestName || 'Challenger', color: '#4cd97b', moves: 0 }
      ];
      buildTower(12345);
      broadcastMove({ type: 'PLAYER_JOINED', name: guestName || 'Challenger' });
      lobbyModal.classList.remove('open');
      showToast(`Joined Room ${code}!`);
    }
    updateHUD();
  }

  function broadcastMove(payload) {
    if (state.channel) {
      state.channel.postMessage(payload);
    }
    if (state.connections && state.connections.length > 0) {
      state.connections.forEach((conn) => {
        if (conn.open) conn.send(payload);
      });
    }
  }

  function handleNetworkMessage(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'PLAYER_JOINED' && state.isHost) {
      state.players[1].name = msg.name;
      updateHUD();
      showToast(`${msg.name} took a seat at the table!`);
      lobbyModal.classList.remove('open');
    } else if (msg.type === 'MOVE_COMPLETE') {
      const block = blocks.find((b) => b.id === msg.blockId);
      if (block) {
        state.activeBlock = block;
        state.turnPhase = 'STACKING';
        placeActiveBlockOnTop(msg.slotIndex, true);
      }
    } else if (msg.type === 'RESET_TOWER') {
      state.players.forEach((p) => (p.moves = 0));
      state.currentPlayerIdx = 0;
      state.blocksMovedTotal = 0;
      buildTower(msg.seed);
      showToast('Opponent reset the tower!');
    }
  }

  document.getElementById('btn-create-room').addEventListener('click', () => {
    const nickname =
      document.getElementById('input-online-name').value.trim() ||
      `Guest_${Math.floor(100 + Math.random() * 900)}`;
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    setupRoomChannel(code, nickname, true);
  });

  document.getElementById('btn-join-room').addEventListener('click', () => {
    const nickname =
      document.getElementById('input-online-name').value.trim() ||
      `Guest_${Math.floor(100 + Math.random() * 900)}`;
    const code = document
      .getElementById('input-room-code')
      .value.trim()
      .toUpperCase();
    if (code.length < 4) {
      showToast('Enter a valid room code first!');
      return;
    }
    setupRoomChannel(code, nickname, false);
  });

  // Pointer & Resize Event Listeners
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Build Initial Tower & Chairs
  buildTower();

  // Main Physics & Render Loop
  let lastTime = performance.now();
  let checkCounter = 0;

  function animate(now) {
    requestAnimationFrame(animate);

    const dt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    world.step(1 / 60, dt, 3);

    for (const b of blocks) {
      syncMeshToBody(b.mesh, b.body);
    }

    if (state.turnPhase === 'PULLING' && state.activeBlock) {
      highlightLine.position.copy(state.activeBlock.mesh.position);
      highlightLine.quaternion.copy(state.activeBlock.mesh.quaternion);
      highlightLine.visible = true;
    }

    checkCounter++;
    if (checkCounter % 12 === 0 && state.turnPhase !== 'SELECT') {
      checkTowerCollapse();
    }

    // Gentle friendly pulse on the active player's table side & "Swag" finger-drumming on BOTH Open Palms
    const activeChair = chairObjects[state.currentPlayerIdx];
    if (activeChair) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 0.004);
      activeChair.sectorMat.opacity = 0.16 + pulse * 0.14;
      activeChair.rimArcMat.opacity = 0.65 + pulse * 0.32;

      if (activeChair.handObj && activeChair.handObj.group.visible) {
        const beatTime = now * 0.0075;

        const animateSingle3DHandSwag = (handData, sideSign, phaseOffset) => {
          if (!handData || !handData.palmPivot) return;
          const t = beatTime + phaseOffset;

          // Confident wrist groove bounce & subtle swagger tilt
          handData.palmPivot.position.y =
            0.72 + Math.abs(Math.sin(t * 0.5)) * 0.055;
          handData.palmPivot.rotation.z =
            Math.sin(t * 0.25) * 0.042 * sideSign;

          // Syncopated Pinky (3) -> Ring (2) -> Middle (1) -> Index (0) finger-drumming wave
          handData.fingerGroups.forEach((fg, fIdx) => {
            const reverseIdx = 3 - fIdx;
            const phase = t - reverseIdx * 0.52;
            const rawWave = Math.sin(phase);
            const lift = rawWave > 0 ? Math.pow(rawWave, 2.2) : 0;

            fg.rotation.x = lift * 0.26;
            if (fg.userData.distGroup) {
              // Curl the fingertip downward as the knuckle lifts for natural table-drumming swag
              fg.userData.distGroup.rotation.x = -lift * 0.34 - 0.05;
            }
          });

          // Rhythmic thumb groove tap on the off-beat
          if (handData.thumbGroup) {
            const thumbBeat = Math.max(0, Math.sin(t * 0.5 + 1.4));
            handData.thumbGroup.rotation.x = Math.pow(thumbBeat, 3) * 0.22;
          }
        };

        // Animate BOTH Left Hand and Right Hand in an alternating swagger groove!
        animateSingle3DHandSwag(activeChair.handObj.leftHand, -1, 0);
        animateSingle3DHandSwag(activeChair.handObj.rightHand, 1, 1.55);
      }
    }

    controls.update();
    updateCompassHUD();
    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
};
