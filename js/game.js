/**
 * Online Jenga — Phase 1 Core 3D Physics, 360° Camera & Mobile-Adaptive Engine
 * Uses Three.js + Cannon-es with authentic 7.5 x 2.5 x 1.5 block geometry,
 * micro-variation loose/tight block mechanics, and no-sign-in multiplayer.
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
  const GAP = 0.03; // Microscopic spacing for clean initial contact normals

  // Game State
  const state = {
    mode: 'pass',
    interactionMode: 'pull', // 'pull' (1-finger pulls blocks, background orbits) | 'orbit' (1-finger always orbits 360°)
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

  // Three.js Scene Setup
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x16110d, 0.0075);

  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.5,
    300
  );

  // Adapt camera distance for mobile portrait screens so full 18-story tower fits
  function getIdealCameraDistance() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    if (aspect < 0.65) return 52; // Phone portrait
    if (aspect < 1.0) return 44;  // Tablet portrait
    return 37;                    // Desktop / landscape
  }

  const initDist = getIdealCameraDistance();
  camera.position.set(
    initDist * Math.sin(Math.PI / 4),
    22,
    initDist * Math.cos(Math.PI / 4)
  );

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  container.appendChild(renderer.domElement);

  // Full 360° OrbitControls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 13.5, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  // Unrestricted 360-degree horizontal rotation around all sides of the tower
  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.minPolarAngle = 0.12;
  controls.maxPolarAngle = Math.PI * 0.485; // Keep camera above table
  controls.minDistance = 16;
  controls.maxDistance = 85;
  controls.rotateSpeed = 0.85;
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_ROTATE
  };
  controls.update();

  // Lighting (Balanced around all 360° sides so no side of the tower is dark)
  const ambientLight = new THREE.AmbientLight(0xffeedd, 0.72);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xfff5e4, 0x2e2118, 0.6);
  hemiLight.position.set(0, 55, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xfff0dd, 1.25);
  dirLight.position.set(20, 44, 24);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 5;
  dirLight.shadow.camera.far = 100;
  const d = 24;
  dirLight.shadow.camera.left = -d;
  dirLight.shadow.camera.right = d;
  dirLight.shadow.camera.top = d * 1.6;
  dirLight.shadow.camera.bottom = -5;
  dirLight.shadow.bias = -0.0005;
  scene.add(dirLight);

  const backFillLight = new THREE.DirectionalLight(0xf3cfa4, 0.55);
  backFillLight.position.set(-22, 26, -22);
  scene.add(backFillLight);

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

  // Tabletop Mesh & 360° Cardinal Side Markers (N / E / S / W)
  const tableCanvas = window.JengaTextures.createTableCanvas();
  const tableTex = new THREE.CanvasTexture(tableCanvas);
  tableTex.anisotropy = 4;

  const tableGeo = new THREE.CylinderGeometry(28, 30, 2.4, 64);
  const tableMat = new THREE.MeshStandardMaterial({
    map: tableTex,
    roughness: 0.55,
    metalness: 0.05
  });
  const tableMesh = new THREE.Mesh(tableGeo, tableMat);
  tableMesh.position.set(0, -1.2, 0);
  tableMesh.receiveShadow = true;
  scene.add(tableMesh);

  // Brass rim around table
  const rimGeo = new THREE.TorusGeometry(28.05, 0.25, 16, 64);
  rimGeo.rotateX(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xc88a4b,
    roughness: 0.3,
    metalness: 0.7
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.set(0, -0.05, 0);
  scene.add(rimMesh);

  const groundBody = new CANNON.Body({
    mass: 0,
    material: tableMaterial,
    shape: new CANNON.Box(new CANNON.Vec3(45, 2, 45)),
    position: new CANNON.Vec3(0, -2, 0)
  });
  world.addBody(groundBody);

  // Block Materials (4 natural wood variations)
  const blockCanvases = window.JengaTextures.createBlockCanvases();
  const blockMaterials = blockCanvases.map((cnv) => {
    const tex = new THREE.CanvasTexture(cnv);
    tex.anisotropy = 4;
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.62,
      metalness: 0.02
    });
  });

  // Top Placement Ghost Slots (3 interactive slots on the topmost layer)
  const ghostSlotsGroup = new THREE.Group();
  scene.add(ghostSlotsGroup);
  const ghostSlotMeshes = [];

  const ghostMatBase = new THREE.MeshBasicMaterial({
    color: 0xe59838,
    transparent: true,
    opacity: 0.34,
    wireframe: false
  });
  const ghostMatHover = new THREE.MeshBasicMaterial({
    color: 0x4cd97b,
    transparent: true,
    opacity: 0.62
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

  // Selection outline highlight mesh
  const highlightGeo = new THREE.BoxGeometry(
    BLOCK_WIDTH + 0.1,
    BLOCK_HEIGHT + 0.1,
    BLOCK_LENGTH + 0.1
  );
  const highlightEdges = new THREE.EdgesGeometry(highlightGeo);
  const highlightLine = new THREE.LineSegments(
    highlightEdges,
    new THREE.LineBasicMaterial({ color: 0x4cd97b, linewidth: 2 })
  );
  highlightLine.visible = false;
  scene.add(highlightLine);

  // Blocks Registry
  let blocks = [];
  const sharedBoxGeo = new THREE.BoxGeometry(BLOCK_WIDTH, BLOCK_HEIGHT, BLOCK_LENGTH);
  const sharedShape = new CANNON.Box(
    new CANNON.Vec3(BLOCK_WIDTH / 2, BLOCK_HEIGHT / 2, BLOCK_LENGTH / 2)
  );

  /**
   * Sync a Cannon.js body's position and quaternion safely to a Three.js mesh.
   */
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
   * Build the 54-block 18-story Jenga tower with realistic Loose/Snug/Tight distribution.
   */
  function buildTower(seed = Date.now()) {
    blocks.forEach((b) => {
      scene.remove(b.mesh);
      world.removeBody(b.body);
    });
    blocks = [];
    highlightLine.visible = false;
    hideGhostSlots();

    // Seeded RNG so online rooms share identical loose/tight layout
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

      const tensions = ['loose', 'medium', 'tight'];
      for (let k = tensions.length - 1; k > 0; k--) {
        const r = Math.floor(nextRand() * (k + 1));
        const tmp = tensions[k];
        tensions[k] = tensions[r];
        tensions[r] = tmp;
      }

      for (let slot = 0; slot < BLOCKS_PER_LAYER; slot++) {
        const offset = (slot - 1) * (BLOCK_WIDTH + GAP);
        const x = isEven ? offset : 0;
        const z = isEven ? 0 : offset;

        const matIndex = Math.floor(nextRand() * blockMaterials.length);
        const mesh = new THREE.Mesh(sharedBoxGeo, blockMaterials[matIndex]);
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
    updateHUD();
  }

  /**
   * Determine the current top layer and which layers are forbidden by official Jenga rules.
   */
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

  // Multi-touch & Pointer Tracking for Mobile + Desktop
  const activePointers = new Set();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const dragPlane = new THREE.Plane();
  const dragIntersect = new THREE.Vector3();
  const dragStartPoint = new THREE.Vector3();
  const blockDragStartPos = new THREE.Vector3();
  let isDraggingBlock = false;

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

    // If user puts a 2nd finger down on mobile (pinch zoom / 2-finger rotate), immediately hand control to OrbitControls
    if (activePointers.size > 1) {
      cancelActiveBlockDragToOrbit();
      return;
    }

    if (e.button !== undefined && e.button !== 0) return; // Only primary click/touch pulls blocks
    if (state.turnPhase === 'GAMEOVER' || state.turnPhase === 'SETTLING') return;

    updatePointer(e);
    raycaster.setFromCamera(pointer, camera);

    // If in STACKING phase, tapping/clicking a ghost slot places the block on top
    if (state.turnPhase === 'STACKING') {
      const slotHits = raycaster.intersectObjects(ghostSlotMeshes, false);
      if (slotHits.length > 0) {
        const slotIndex = slotHits[0].object.userData.slotIndex;
        placeActiveBlockOnTop(slotIndex);
      }
      return;
    }

    // If the user toggled "🔄 360° View" mode on mobile/desktop, 1-finger drag always orbits the camera
    // while tapping still inspects the block's tension!
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
        // Let OrbitControls rotate 360° freely while still showing the block inspector
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

      // Begin pulling/nudging this block
      isDraggingBlock = true;
      state.activeBlock = hitBlock;
      state.turnPhase = 'PULLING';
      controls.enabled = false;
      container.className = 'dragging-block';

      // Wake up nearby layers
      blocks.forEach((b) => {
        if (Math.abs(b.layer - hitBlock.layer) <= 2) {
          b.body.wakeUp();
        }
      });

      window.JengaAudio.playWoodTap(
        hitBlock.tension === 'loose' ? 1.25 : hitBlock.tension === 'medium' ? 1.0 : 0.78,
        0.3
      );

      // Camera-facing drag plane so dragging works reliably from any 360° camera angle & elevation
      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      dragPlane.setFromNormalAndCoplanarPoint(camDir.negate(), intersects[0].point);
      raycaster.ray.intersectPlane(dragPlane, dragStartPoint);
      blockDragStartPos.set(
        hitBlock.body.position.x,
        hitBlock.body.position.y,
        hitBlock.body.position.z
      );

      updateHUD();
    }
  }

  function onPointerMove(e) {
    if (state.turnPhase === 'GAMEOVER' || state.turnPhase === 'SETTLING') return;
    if (activePointers.size > 1) return;

    updatePointer(e);
    raycaster.setFromCamera(pointer, camera);

    // Dragging an active block along its 3D channel
    if (isDraggingBlock && state.activeBlock) {
      if (raycaster.ray.intersectPlane(dragPlane, dragIntersect)) {
        const b = state.activeBlock;
        const delta = dragIntersect.clone().sub(dragStartPoint);

        // Compute block's horizontal lengthwise axis & cross axis
        const axis = b.isEven
          ? new THREE.Vector3(0, 0, 1)
          : new THREE.Vector3(1, 0, 0);
        const crossAxis = b.isEven
          ? new THREE.Vector3(1, 0, 0)
          : new THREE.Vector3(0, 0, 1);

        const alongDist = delta.dot(axis);
        const sideDist = THREE.MathUtils.clamp(delta.dot(crossAxis), -0.22, 0.22);

        const damping = 1.0 - b.resistance * 0.42;
        const effectiveAlong = alongDist * damping;

        const targetPos = blockDragStartPos
          .clone()
          .addScaledVector(axis, effectiveAlong)
          .addScaledVector(crossAxis, sideDist);

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
      }
      return;
    }

    // Hovering over top ghost slots during STACKING phase
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

    // Hovering over tower blocks on desktop
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

  /**
   * Simulates wood-on-wood friction when pulling a snug or tight block.
   */
  function applyNeighborFrictionTug(pulledBlock, axis, alongDist) {
    const sign = Math.sign(alongDist) || 1;
    const forceMag = (pulledBlock.resistance - 0.3) * 0.028;

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

  /**
   * Called once a block is pulled completely free of the tower.
   */
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
    window.JengaAudio.playTowerCollapse();

    const loser = state.players[state.currentPlayerIdx];
    const winnerIdx =
      (state.currentPlayerIdx - 1 + state.players.length) % state.players.length;
    const winner = state.players[winnerIdx];

    updateHUD();

    setTimeout(() => {
      const modal = document.getElementById('gameover-modal');
      const title = document.getElementById('gameover-title');
      const desc = document.getElementById('gameover-desc');

      if (state.players.length === 1) {
        title.textContent = 'Tower Collapsed!';
        desc.textContent = `You stacked the tower to ${
          state.towerPeakLayer + 1
        } stories (${state.blocksMovedTotal} blocks moved) before it tumbled!`;
      } else {
        title.textContent = `${winner.name} Wins!`;
        desc.textContent = `The tower collapsed on ${loser.name}'s turn at ${
          state.towerPeakLayer + 1
        } stories high (${state.blocksMovedTotal} successful moves).`;
      }
      modal.classList.add('open');
    }, 1200);
  }

  // UI & HUD Updates
  function updateBlockInspector(block, allowed) {
    if (!block) {
      elBlockInspector.innerHTML =
        'Hover or tap any block below the top completed layer to test how loose or tight it sits.';
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
    } • ${slotName} Block</strong><br/><span class="badge-pill ${badgeClass}">${label}</span>`;

    elMobileBlockPill.innerHTML = `<strong>Layer ${
      block.layer + 1
    } (${slotName})</strong> • <span class="badge-pill ${badgeClass}">${label}</span>`;
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
          ? '360° View Mode active: Drag anywhere to spin around the tower. Tap "🖐️ Pull" when ready to slide a block!'
          : 'Drag any block below the top completed row to slide it out. Drag background or use 360° controls to see all sides!';
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
        'Verifying the tower holds steady before ending turn...';
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
          <span>${p.name}</span>
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
    let rad = Math.atan2(offset.x, offset.z); // -PI to PI
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
        new THREE.Vector3(0, 13.5, 0)
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

  // Slot picker buttons in bottom bar
  document.querySelectorAll('[data-slot]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slotIndex = parseInt(btn.getAttribute('data-slot'), 10);
      placeActiveBlockOnTop(slotIndex);
    });
  });

  // Top Bar Controls
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

  // No-Sign-In Mode & Room Modal Setup
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

    const colors = ['#e59838', '#4cd97b', '#5ca8ff', '#ff6b9d'];
    const names = [p1];
    if (p2) names.push(p2);
    if (p3) names.push(p3);

    state.players = names.map((name, i) => ({
      name,
      color: colors[i % colors.length],
      moves: 0
    }));
    state.currentPlayerIdx = 0;
    state.blocksMovedTotal = 0;
    buildTower();
    lobbyModal.classList.remove('open');
    showToast(`Started match: ${state.players.map((p) => p.name).join(' vs ')}!`);
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
      showToast(`${msg.name} joined the room!`);
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

  // Build Initial Tower
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

    controls.update();
    updateCompassHUD();
    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
};
