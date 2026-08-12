<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import * as THREE from 'three';

type Axis = 'x' | 'y' | 'z';
type Face = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
type Coordinate = [number, number, number];

interface Sticker {
  color: Face;
  normal: Coordinate;
  position: Coordinate;
}

interface FaceConfig {
  axis: Axis;
  layer: number;
  angle: number;
}

const faceConfigs: Record<Face, FaceConfig> = {
  U: { axis: 'y', layer: 1, angle: -Math.PI / 2 },
  D: { axis: 'y', layer: -1, angle: Math.PI / 2 },
  L: { axis: 'x', layer: -1, angle: Math.PI / 2 },
  R: { axis: 'x', layer: 1, angle: -Math.PI / 2 },
  F: { axis: 'z', layer: 1, angle: -Math.PI / 2 },
  B: { axis: 'z', layer: -1, angle: Math.PI / 2 },
};

const faceColors: Record<Face, number> = {
  U: 0xf4f1dc,
  D: 0xf5ce38,
  L: 0xf2993a,
  R: 0xdc4b42,
  F: 0x4ba96a,
  B: 0x3977d2,
};

const canvasElement = ref<HTMLCanvasElement>();
const stageElement = ref<HTMLElement>();
const elapsedMilliseconds = ref(0);
const moveCount = ref(0);
const isAnimating = ref(false);
const isRunning = ref(false);
const hasWebglError = ref(false);
const scrambleNotation = ref('');
const stateMessage = ref('正在准备魔方…');
const faces = Object.keys(faceConfigs) as Face[];

const formattedTime = computed(() => {
  const minutes = Math.floor(elapsedMilliseconds.value / 60_000);
  const seconds = Math.floor((elapsedMilliseconds.value % 60_000) / 1_000);
  const centiseconds = Math.floor((elapsedMilliseconds.value % 1_000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(centiseconds).padStart(2, '0')}`;
});

let renderer: THREE.WebGLRenderer | undefined;
let camera: THREE.PerspectiveCamera | undefined;
let scene: THREE.Scene | undefined;
let modelGroup: THREE.Group | undefined;
let edgeMaterial: THREE.LineBasicMaterial | undefined;
let resizeObserver: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined;
let animationFrame = 0;
let timerHandle = 0;
let timerStartedAt = 0;
let stickers: Sticker[] = [];
let reducedMotion = false;
let pointerId = -1;
let pointerX = 0;
let pointerY = 0;
const cubies: THREE.Mesh[] = [];
const geometries: THREE.BufferGeometry[] = [];
const materials: THREE.Material[] = [];

function axisIndex(axis: Axis) {
  return axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
}

function axisVector(axis: Axis) {
  return new THREE.Vector3(axis === 'x' ? 1 : 0, axis === 'y' ? 1 : 0, axis === 'z' ? 1 : 0);
}

function createSolvedStickers() {
  const result: Sticker[] = [];
  for (let first = -1; first <= 1; first += 1) {
    for (let second = -1; second <= 1; second += 1) {
      result.push(
        { color: 'U', normal: [0, 1, 0], position: [first, 1, second] },
        { color: 'D', normal: [0, -1, 0], position: [first, -1, second] },
        { color: 'L', normal: [-1, 0, 0], position: [-1, first, second] },
        { color: 'R', normal: [1, 0, 0], position: [1, first, second] },
        { color: 'F', normal: [0, 0, 1], position: [first, second, 1] },
        { color: 'B', normal: [0, 0, -1], position: [first, second, -1] },
      );
    }
  }
  return result;
}

function snapVector(vector: THREE.Vector3): Coordinate {
  return [Math.round(vector.x), Math.round(vector.y), Math.round(vector.z)];
}

function rotateStickerState(face: Face, inverse: boolean) {
  const config = faceConfigs[face];
  const index = axisIndex(config.axis);
  const rotationAxis = axisVector(config.axis);
  const angle = config.angle * (inverse ? -1 : 1);

  stickers.forEach((sticker) => {
    if (sticker.position[index] !== config.layer) return;
    sticker.position = snapVector(new THREE.Vector3(...sticker.position).applyAxisAngle(rotationAxis, angle));
    sticker.normal = snapVector(new THREE.Vector3(...sticker.normal).applyAxisAngle(rotationAxis, angle));
  });
}

function isCubeSolved() {
  const solvedFaceByNormal: Record<string, Face> = {
    '0,1,0': 'U',
    '0,-1,0': 'D',
    '-1,0,0': 'L',
    '1,0,0': 'R',
    '0,0,1': 'F',
    '0,0,-1': 'B',
  };
  return stickers.every((sticker) => solvedFaceByNormal[sticker.normal.join(',')] === sticker.color);
}

function renderScene() {
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function resizeScene() {
  const canvas = canvasElement.value;
  if (!canvas || !renderer || !camera) return;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderScene();
}

function updateSceneTheme() {
  const stage = stageElement.value;
  if (!stage) return;
  const styles = getComputedStyle(stage);
  edgeMaterial?.color.set(styles.getPropertyValue('--cube-edge').trim() || '#090b10');
  renderScene();
}

function createCubieMaterials(x: number, y: number, z: number) {
  const blank = 0x16191f;
  const colors = [
    x === 1 ? faceColors.R : blank,
    x === -1 ? faceColors.L : blank,
    y === 1 ? faceColors.U : blank,
    y === -1 ? faceColors.D : blank,
    z === 1 ? faceColors.F : blank,
    z === -1 ? faceColors.B : blank,
  ];
  return colors.map((color) => {
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.04 });
    materials.push(material);
    return material;
  });
}

function createCubeModel() {
  if (!modelGroup) return;
  const boxGeometry = new THREE.BoxGeometry(.91, .91, .91);
  const edgeGeometry = new THREE.EdgesGeometry(boxGeometry);
  edgeMaterial = new THREE.LineBasicMaterial({ color: 0x090b10, transparent: true, opacity: .9 });
  geometries.push(boxGeometry, edgeGeometry);
  materials.push(edgeMaterial);

  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        if (x === 0 && y === 0 && z === 0) continue;
        const cubie = new THREE.Mesh(boxGeometry, createCubieMaterials(x, y, z));
        cubie.position.set(x, y, z);
        cubie.userData.home = [x, y, z];
        cubie.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));
        cubies.push(cubie);
        modelGroup.add(cubie);
      }
    }
  }
}

function initializeScene() {
  const canvas = canvasElement.value;
  if (!canvas) return;
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, .1, 100);
  camera.position.set(0, .2, 8.2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x39415c, 2.1));
  const keyLight = new THREE.DirectionalLight(0xffffff, 3.1);
  keyLight.position.set(4, 6, 7);
  scene.add(keyLight);
  modelGroup = new THREE.Group();
  modelGroup.rotation.set(-.42, .62, .05);
  scene.add(modelGroup);
  createCubeModel();

  resizeObserver = new ResizeObserver(resizeScene);
  resizeObserver.observe(canvas);
  themeObserver = new MutationObserver(updateSceneTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  resizeScene();
  updateSceneTheme();
}

function resetCubies() {
  cubies.forEach((cubie) => {
    const [x, y, z] = cubie.userData.home as Coordinate;
    cubie.position.set(x, y, z);
    cubie.quaternion.identity();
  });
  stickers = createSolvedStickers();
}

function selectedCubies(face: Face) {
  const config = faceConfigs[face];
  return cubies.filter((cubie) => Math.round(cubie.position[config.axis]) === config.layer);
}

function rotateCubiesInstant(face: Face, inverse: boolean) {
  const config = faceConfigs[face];
  const rotation = new THREE.Quaternion().setFromAxisAngle(
    axisVector(config.axis),
    config.angle * (inverse ? -1 : 1),
  );
  selectedCubies(face).forEach((cubie) => {
    cubie.position.applyQuaternion(rotation);
    cubie.position.set(Math.round(cubie.position.x), Math.round(cubie.position.y), Math.round(cubie.position.z));
    cubie.quaternion.premultiply(rotation).normalize();
  });
  rotateStickerState(face, inverse);
}

function startTimer() {
  if (isRunning.value) return;
  isRunning.value = true;
  timerStartedAt = Date.now() - elapsedMilliseconds.value;
  timerHandle = window.setInterval(() => {
    elapsedMilliseconds.value = Date.now() - timerStartedAt;
  }, 31);
}

function stopTimer() {
  window.clearInterval(timerHandle);
  timerHandle = 0;
  isRunning.value = false;
}

function finishMove(face: Face, inverse: boolean) {
  rotateStickerState(face, inverse);
  moveCount.value += 1;
  isAnimating.value = false;
  if (isCubeSolved()) {
    stopTimer();
    stateMessage.value = `还原完成，共 ${moveCount.value} 步。`;
  } else {
    stateMessage.value = '计时中，继续还原。';
  }
  renderScene();
}

function playMove(face: Face, inverse = false) {
  if (!modelGroup || isAnimating.value || hasWebglError.value) return;
  if (!isRunning.value) startTimer();
  isAnimating.value = true;
  const config = faceConfigs[face];
  const movingCubies = selectedCubies(face);
  const pivot = new THREE.Group();
  modelGroup.add(pivot);
  movingCubies.forEach((cubie) => pivot.attach(cubie));
  const targetAngle = config.angle * (inverse ? -1 : 1);
  const duration = reducedMotion ? 0 : 220;
  const startedAt = performance.now();

  const animate = (time: number) => {
    const progress = duration === 0 ? 1 : Math.min((time - startedAt) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    pivot.rotation[config.axis] = targetAngle * eased;
    renderScene();
    if (progress < 1) {
      animationFrame = window.requestAnimationFrame(animate);
      return;
    }
    movingCubies.forEach((cubie) => {
      modelGroup?.attach(cubie);
      cubie.position.set(Math.round(cubie.position.x), Math.round(cubie.position.y), Math.round(cubie.position.z));
      cubie.quaternion.normalize();
    });
    modelGroup?.remove(pivot);
    animationFrame = 0;
    finishMove(face, inverse);
  };
  animationFrame = window.requestAnimationFrame(animate);
}

function createScramble() {
  const result: Array<{ face: Face; inverse: boolean }> = [];
  let previousFace: Face | undefined;
  while (result.length < 20) {
    const face = faces[Math.floor(Math.random() * faces.length)];
    if (face === previousFace) continue;
    result.push({ face, inverse: Math.random() > .5 });
    previousFace = face;
  }
  return result;
}

function scrambleCube() {
  if (!modelGroup || isAnimating.value) return;
  stopTimer();
  elapsedMilliseconds.value = 0;
  moveCount.value = 0;
  resetCubies();
  const scramble = createScramble();
  scramble.forEach(({ face, inverse }) => rotateCubiesInstant(face, inverse));
  scrambleNotation.value = scramble.map(({ face, inverse }) => `${face}${inverse ? '′' : ''}`).join(' ');
  stateMessage.value = '已随机打乱，第一次转面时开始计时。';
  renderScene();
}

function resetCube() {
  if (!modelGroup || isAnimating.value) return;
  stopTimer();
  elapsedMilliseconds.value = 0;
  moveCount.value = 0;
  scrambleNotation.value = 'SOLVED';
  resetCubies();
  stateMessage.value = '魔方已复原，可重新随机打乱。';
  renderScene();
}

function beginStageRotation(event: PointerEvent) {
  pointerId = event.pointerId;
  pointerX = event.clientX;
  pointerY = event.clientY;
  canvasElement.value?.setPointerCapture(event.pointerId);
}

function rotateStage(event: PointerEvent) {
  if (pointerId !== event.pointerId || !modelGroup) return;
  const deltaX = event.clientX - pointerX;
  const deltaY = event.clientY - pointerY;
  pointerX = event.clientX;
  pointerY = event.clientY;
  modelGroup.rotation.y += deltaX * .008;
  modelGroup.rotation.x += deltaY * .008;
  renderScene();
}

function endStageRotation(event: PointerEvent) {
  if (pointerId !== event.pointerId) return;
  pointerId = -1;
  canvasElement.value?.releasePointerCapture(event.pointerId);
}

function disposeScene() {
  window.cancelAnimationFrame(animationFrame);
  stopTimer();
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  renderer?.dispose();
  renderer?.forceContextLoss();
  cubies.length = 0;
  geometries.length = 0;
  materials.length = 0;
}

onMounted(async () => {
  await nextTick();
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    initializeScene();
    scrambleCube();
  } catch (error) {
    // WebGL 不可用时给出明确反馈，不让计时和控制按钮停留在不可操作状态。
    console.warn('魔方场景初始化失败。', error);
    hasWebglError.value = true;
    stateMessage.value = '当前浏览器无法创建 3D 魔方场景。';
  }
});

onBeforeUnmount(disposeScene);
</script>

<template>
  <section ref="stageElement" class="cube-game" aria-labelledby="cube-title">
    <header class="game-heading">
      <div>
        <p>THREE-DIMENSIONAL PUZZLE</p>
        <h2 id="cube-title">还原魔方</h2>
      </div>
      <dl class="game-stats">
        <div>
          <dt>TIME</dt>
          <dd>{{ formattedTime }}</dd>
        </div>
        <div>
          <dt>MOVES</dt>
          <dd>{{ String(moveCount).padStart(3, '0') }}</dd>
        </div>
      </dl>
    </header>

    <div class="cube-layout">
      <div class="cube-stage" :class="{ 'cube-stage--error': hasWebglError }">
        <canvas
          ref="canvasElement"
          aria-label="可拖动视角的三维魔方"
          @pointerdown="beginStageRotation"
          @pointermove="rotateStage"
          @pointerup="endStageRotation"
          @pointercancel="endStageRotation"
        ></canvas>
        <p v-if="hasWebglError">3D 场景加载失败，请确认浏览器已开启 WebGL。</p>
        <span v-else class="drag-tip">拖动魔方可查看不同角度</span>
      </div>

      <aside class="cube-console">
        <div class="scramble-card">
          <span>SCRAMBLE / 打乱步骤</span>
          <strong>{{ scrambleNotation }}</strong>
        </div>

        <p class="state-message" aria-live="polite">{{ stateMessage }}</p>

        <div class="face-controls" aria-label="魔方转面控制">
          <div v-for="face in faces" :key="face" class="face-control">
            <button
              type="button"
              :disabled="isAnimating || hasWebglError"
              :aria-label="`${face} 面顺时针旋转`"
              @click="playMove(face)"
            >
              {{ face }}
            </button>
            <button
              type="button"
              :disabled="isAnimating || hasWebglError"
              :aria-label="`${face} 面逆时针旋转`"
              @click="playMove(face, true)"
            >
              {{ face }}′
            </button>
          </div>
        </div>

        <div class="game-actions">
          <button type="button" :disabled="isAnimating || hasWebglError" @click="scrambleCube">随机打乱</button>
          <button type="button" :disabled="isAnimating || hasWebglError" @click="resetCube">复原魔方</button>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.cube-game {
  min-height: 100%;
  padding: clamp(1.25rem, 3vw, 3rem);
  color: var(--game-foreground);
}

.game-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-bottom: clamp(1.25rem, 2.4vw, 2rem);
  border-bottom: 1px solid var(--game-border);
}

.game-heading p,
.game-heading h2,
.game-stats,
.game-stats dd {
  margin: 0;
}

.game-heading p,
.game-stats dt,
.scramble-card span {
  color: var(--game-accent-secondary);
  font-size: .62rem;
  font-weight: 750;
  letter-spacing: .17em;
}

.game-heading h2 {
  margin-top: .55rem;
  font-size: clamp(2rem, 5vw, 4.25rem);
  font-weight: 580;
  letter-spacing: -.065em;
  line-height: .95;
}

.game-stats {
  display: flex;
}

.game-stats > div {
  min-width: 7.5rem;
  margin-left: 1rem;
  padding-left: 1rem;
  border-left: 1px solid var(--game-border);
}

.game-stats dd {
  margin-top: .35rem;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: clamp(1rem, 2vw, 1.5rem);
  font-variant-numeric: tabular-nums;
}

.cube-layout {
  display: grid;
  min-height: min(68dvh, 720px);
  grid-template-columns: minmax(0, 1.35fr) minmax(19rem, .65fr);
  border-bottom: 1px solid var(--game-border);
}

.cube-stage {
  position: relative;
  min-height: 430px;
  overflow: hidden;
  border-right: 1px solid var(--game-border);
  background:
    radial-gradient(circle at 50% 48%, var(--game-stage-glow), transparent 45%),
    linear-gradient(var(--game-grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--game-grid) 1px, transparent 1px);
  background-size: auto, 32px 32px, 32px 32px;
}

.cube-stage canvas {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 430px;
  cursor: grab;
  touch-action: none;
}

.cube-stage canvas:active {
  cursor: grabbing;
}

.cube-stage--error {
  display: grid;
  place-items: center;
}

.cube-stage--error canvas {
  display: none;
}

.cube-stage--error p,
.drag-tip {
  color: var(--game-muted);
  font-size: .72rem;
  letter-spacing: .08em;
}

.drag-tip {
  position: absolute;
  bottom: 1rem;
  left: 50%;
  padding: .55rem .75rem;
  border: 1px solid var(--game-border);
  background: var(--game-surface);
  transform: translateX(-50%);
  white-space: nowrap;
  pointer-events: none;
}

.cube-console {
  display: flex;
  flex-direction: column;
  padding: clamp(1.25rem, 3vw, 2.5rem);
}

.scramble-card {
  padding: 1rem;
  border: 1px solid var(--game-border);
  background: var(--game-surface);
}

.scramble-card span,
.scramble-card strong {
  display: block;
}

.scramble-card strong {
  margin-top: .7rem;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: .82rem;
  font-weight: 520;
  line-height: 1.65;
  word-spacing: .35em;
}

.state-message {
  min-height: 2.5rem;
  margin: 1.25rem 0;
  color: var(--game-muted);
  font-size: .78rem;
  line-height: 1.6;
}

.face-controls {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: -.3rem;
}

.face-control {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: .3rem;
}

.face-control button,
.game-actions button {
  min-height: 48px;
  border: 1px solid var(--game-border-strong);
  background: var(--game-control);
  color: var(--game-foreground);
  cursor: pointer;
  font: inherit;
  font-weight: 720;
  touch-action: manipulation;
  transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease;
}

.face-control button + button {
  border-left: 0;
}

.face-control button:hover:not(:disabled),
.game-actions button:hover:not(:disabled) {
  border-color: var(--game-accent);
  background: var(--game-control-hover);
}

.face-control button:focus-visible,
.game-actions button:focus-visible,
.cube-stage canvas:focus-visible {
  outline: 2px solid var(--game-focus);
  outline-offset: 2px;
}

.face-control button:disabled,
.game-actions button:disabled {
  cursor: not-allowed;
  opacity: .42;
}

.game-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin-top: auto;
  padding-top: 1.5rem;
}

.game-actions button:first-child {
  border-color: var(--game-accent);
  background: var(--game-accent);
  color: var(--game-on-accent);
}

.game-actions button + button {
  border-left: 0;
}

@media (max-width: 900px) {
  .cube-layout {
    grid-template-columns: 1fr;
  }

  .cube-stage {
    border-right: 0;
    border-bottom: 1px solid var(--game-border);
  }

  .game-actions {
    margin-top: 1rem;
  }
}

@media (max-width: 580px) {
  .game-heading {
    align-items: flex-start;
  }

  .game-stats {
    flex-direction: column;
  }

  .game-stats > div {
    min-width: 5.5rem;
    margin: 0 0 .75rem 1rem;
  }

  .cube-stage,
  .cube-stage canvas {
    min-height: 340px;
  }

  .face-controls {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
