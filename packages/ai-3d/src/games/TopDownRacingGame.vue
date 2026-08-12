<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import AsyncGameLoading from '../components/AsyncGameLoading.vue';
import {
  racingLevelById,
  racingLevels,
  type RacingAssetKey,
  type RacingLevelDefinition,
  type RacingLevelId,
} from './top-down-racing/levels';
import {
  createLevelTrack,
  disposeLevelTrack,
  type LevelTrackRuntime,
  type TrackGate,
  type TrackPose,
} from './top-down-racing/track';

type ControlKey = 'w' | 'a' | 's' | 'd';
type LoadState = 'loading' | 'ready' | 'error';
type RacePhase = 'selecting' | 'ready' | 'countdown' | 'running' | 'paused' | 'finished';

interface LevelRecord {
  bestLapMs?: number;
  bestRaceMs?: number;
}

interface PersistedRacingState {
  unlockedLevel: number;
  records: Partial<Record<RacingLevelId, LevelRecord>>;
}

const STORAGE_KEY = 'think-chain.ai3d.racing.v2';
const COUNTDOWN_DURATION_MS = 4000;
const FIXED_TIME_STEP = 1 / 60;
const MAX_PHYSICS_STEPS = 4;
const CAMERA_VIEW_SIZE = 48;
const COMMON_ASSETS: readonly RacingAssetKey[] = [
  'race',
  'barrierRed',
  'barrierWhite',
];

const assetUrls = {
  race: new URL('../assets/top-down-racing/car/race.glb', import.meta.url).href,
  barrierRed: new URL('../assets/top-down-racing/racing/barrierRed.fbx', import.meta.url).href,
  barrierWhite: new URL('../assets/top-down-racing/racing/barrierWhite.fbx', import.meta.url).href,
  barrierWall: new URL('../assets/top-down-racing/racing/barrierWall.fbx', import.meta.url).href,
  flagCheckers: new URL('../assets/top-down-racing/racing/flagCheckers.fbx', import.meta.url).href,
  grandStand: new URL('../assets/top-down-racing/racing/grandStand.fbx', import.meta.url).href,
  treeLarge: new URL('../assets/top-down-racing/racing/treeLarge.fbx', import.meta.url).href,
  treeSmall: new URL('../assets/top-down-racing/racing/treeSmall.fbx', import.meta.url).href,
} satisfies Record<RacingAssetKey, string>;

const gameElement = ref<HTMLElement>();
const stageElement = ref<HTMLElement>();
const canvasElement = ref<HTMLCanvasElement>();
const loadState = ref<LoadState>('loading');
const loadProgress = ref(0);
const loadError = ref('');
const racePhase = ref<RacePhase>('selecting');
const pauseMessage = ref('');
const selectedLevelId = ref<RacingLevelId>();
const unlockedLevel = ref(1);
const records = ref<Partial<Record<RacingLevelId, LevelRecord>>>({});
const countdownRemainingMs = ref(COUNTDOWN_DURATION_MS);
const raceElapsedMs = ref(0);
const completedLaps = ref(0);
const speed = ref(0);
const lapTimes = ref<number[]>([]);

const activeLevel = computed(() => (
  selectedLevelId.value ? racingLevelById[selectedLevelId.value] : undefined
));
const currentLap = computed(() => {
  const level = activeLevel.value;
  if (!level) return 1;
  return Math.min(level.laps, completedLaps.value + 1);
});
const speedKph = computed(() => Math.round(speed.value * 7.2));
const countdownLabel = computed(() => {
  if (countdownRemainingMs.value > 3000) return '3';
  if (countdownRemainingMs.value > 2000) return '2';
  if (countdownRemainingMs.value > 1000) return '1';
  return 'GO';
});
const sessionBestLapMs = computed(() => (
  lapTimes.value.length > 0 ? Math.min(...lapTimes.value) : undefined
));
const activeRecord = computed(() => (
  selectedLevelId.value ? records.value[selectedLevelId.value] : undefined
));
const pauseButtonLabel = computed(() => racePhase.value === 'paused' ? '继续比赛' : '暂停比赛');
const nextLevel = computed(() => {
  if (!activeLevel.value) return undefined;
  return racingLevels.find((level) => level.index === activeLevel.value!.index + 1);
});

let renderer: THREE.WebGLRenderer | undefined;
let scene: THREE.Scene | undefined;
let camera: THREE.OrthographicCamera | undefined;
let hemisphereLight: THREE.HemisphereLight | undefined;
let keyLight: THREE.DirectionalLight | undefined;
let worldGroup: THREE.Group | undefined;
let trackRuntime: LevelTrackRuntime | undefined;
let vehicleObject: THREE.Group | undefined;
let groundMesh: THREE.Mesh | undefined;
let physicsWorld: RAPIER.World | undefined;
let vehicleBody: RAPIER.RigidBody | undefined;
let vehicleCollider: RAPIER.Collider | undefined;
let vehicleController: RAPIER.DynamicRayCastVehicleController | undefined;
let resizeObserver: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined;
let motionQuery: MediaQueryList | undefined;
let animationFrame = 0;
let lastFrameTime = 0;
let physicsAccumulator = 0;
let loadAttempt = 0;
let reducedMotion = false;
let phaseBeforePause: Extract<RacePhase, 'countdown' | 'running'> = 'running';
let lapStartedAtMs = 0;
let nextCheckpointIndex = 0;
let steeringAngle = 0;
let driveSpeed = 0;
let lastSafePose: TrackPose | undefined;
const cameraTarget = new THREE.Vector3();
const assetTemplates = new Map<RacingAssetKey, THREE.Group>();
const keyboardInputs = new Set<ControlKey>();
const touchInputs = new Map<number, ControlKey>();
const roadColliderHandles = new Set<number>();
const drivableColliderHandles = new Set<number>();
const barrierColliderHandles = new Set<number>();
const levelGeometries = new Set<THREE.BufferGeometry>();
const levelMaterials = new Set<THREE.Material>();

function formatTime(milliseconds?: number) {
  if (milliseconds === undefined || !Number.isFinite(milliseconds)) return '--:--.---';
  const safeMilliseconds = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(safeMilliseconds / 60000);
  const seconds = Math.floor((safeMilliseconds % 60000) / 1000);
  const remainder = safeMilliseconds % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(remainder).padStart(3, '0')}`;
}

function isValidRecordValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function loadRecords() {
  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) return;
    const stored = JSON.parse(rawValue) as Partial<PersistedRacingState>;
    if (typeof stored.unlockedLevel === 'number' && Number.isFinite(stored.unlockedLevel)) {
      unlockedLevel.value = Math.min(4, Math.max(1, Math.floor(stored.unlockedLevel)));
    }
    const nextRecords: Partial<Record<RacingLevelId, LevelRecord>> = {};
    racingLevels.forEach((level) => {
      const record = stored.records?.[level.id];
      if (!record || typeof record !== 'object') return;
      const validRecord: LevelRecord = {};
      if (isValidRecordValue(record.bestLapMs)) validRecord.bestLapMs = record.bestLapMs;
      if (isValidRecordValue(record.bestRaceMs)) validRecord.bestRaceMs = record.bestRaceMs;
      if (validRecord.bestLapMs !== undefined || validRecord.bestRaceMs !== undefined) {
        nextRecords[level.id] = validRecord;
      }
    });
    records.value = nextRecords;
  } catch {
    // 损坏或旧版存档不影响游戏启动，直接回退为第一关空纪录。
    unlockedLevel.value = 1;
    records.value = {};
  }
}

function saveRecords() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
      unlockedLevel: unlockedLevel.value,
      records: records.value,
    } satisfies PersistedRacingState));
  } catch {
    // 无痕模式和存储配额异常不应中断比赛结算。
  }
}

function getLevelRecord(levelId: RacingLevelId) {
  return records.value[levelId];
}

function isLevelUnlocked(level: RacingLevelDefinition) {
  return level.index <= unlockedLevel.value;
}

function isInputPressed(key: ControlKey) {
  return keyboardInputs.has(key) || [...touchInputs.values()].includes(key);
}

function clearInputs() {
  keyboardInputs.clear();
  touchInputs.clear();
}

function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
  if (event.code === 'KeyR') {
    event.preventDefault();
    if (!event.repeat && activeLevel.value && racePhase.value !== 'selecting') restartRace();
    return;
  }
  const keyMap: Partial<Record<string, ControlKey>> = {
    KeyW: 'w',
    KeyA: 'a',
    KeyS: 's',
    KeyD: 'd',
  };
  const control = keyMap[event.code];
  if (!control) return;
  event.preventDefault();
  keyboardInputs.add(control);
}

function handleKeyup(event: KeyboardEvent) {
  const keyMap: Partial<Record<string, ControlKey>> = {
    KeyW: 'w',
    KeyA: 'a',
    KeyS: 's',
    KeyD: 'd',
  };
  const control = keyMap[event.code];
  if (!control) return;
  event.preventDefault();
  keyboardInputs.delete(control);
}

function pressTouchControl(control: ControlKey, event: PointerEvent) {
  const button = event.currentTarget as HTMLButtonElement;
  button.setPointerCapture?.(event.pointerId);
  touchInputs.set(event.pointerId, control);
}

function releaseTouchControl(event: PointerEvent) {
  touchInputs.delete(event.pointerId);
}

function handleWindowBlur() {
  pauseRace('页面失去焦点，比赛已自动暂停。点击继续后恢复计时。');
  clearInputs();
}

function handleVisibilityChange() {
  if (document.hidden) {
    pauseRace('页面进入后台，比赛已自动暂停。点击继续后恢复计时。');
    clearInputs();
    window.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastFrameTime = 0;
  } else {
    startRenderLoop();
  }
}

function handleReducedMotionChange(event: MediaQueryListEvent) {
  reducedMotion = event.matches;
  updateCamera();
}

function normalizeAsset(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const center = bounds.getCenter(new THREE.Vector3());
  const wrapper = new THREE.Group();
  root.position.x -= center.x;
  root.position.y -= bounds.min.y;
  root.position.z -= center.z;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = false;
    object.receiveShadow = true;
  });
  wrapper.add(root);
  return wrapper;
}

function cloneAsset(asset: RacingAssetKey) {
  const template = assetTemplates.get(asset);
  if (!template) throw new Error(`缺少赛车资源：${asset}`);
  return template.clone(true);
}

function loadFbx(loader: FBXLoader, url: string) {
  return new Promise<THREE.Group>((resolve, reject) => {
    loader.load(url, (object) => resolve(normalizeAsset(object)), undefined, reject);
  });
}

function loadGlb(loader: GLTFLoader, url: string) {
  return new Promise<THREE.Group>((resolve, reject) => {
    loader.load(url, (gltf) => resolve(normalizeAsset(gltf.scene)), undefined, reject);
  });
}

async function ensureAssets(assetKeys: readonly RacingAssetKey[], currentAttempt: number) {
  const missingKeys = [...new Set(assetKeys)].filter((asset) => !assetTemplates.has(asset));
  if (missingKeys.length === 0) {
    loadProgress.value = 100;
    return;
  }
  const manager = new THREE.LoadingManager();
  manager.onProgress = (_url, loaded, total) => {
    if (currentAttempt === loadAttempt) loadProgress.value = total > 0 ? loaded / total * 100 : 0;
  };
  const fbxLoader = new FBXLoader(manager);
  const gltfLoader = new GLTFLoader(manager);
  const results = await Promise.allSettled(missingKeys.map((asset) => (
    asset === 'race'
      ? loadGlb(gltfLoader, assetUrls[asset])
      : loadFbx(fbxLoader, assetUrls[asset])
  )));
  if (currentAttempt !== loadAttempt) return;
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') assetTemplates.set(missingKeys[index], result.value);
  });
  loadProgress.value = 100;
}

function addAssetToWorld(
  asset: RacingAssetKey,
  position: THREE.Vector3,
  rotation: THREE.Quaternion,
  scale = 1,
) {
  if (!worldGroup) return undefined;
  const model = cloneAsset(asset);
  model.position.copy(position);
  model.quaternion.copy(rotation);
  model.scale.setScalar(scale);
  worldGroup.add(model);
  return model;
}

function addLevelMaterial(material: THREE.Material) {
  levelMaterials.add(material);
  return material;
}

function addLevelGeometry<T extends THREE.BufferGeometry>(geometry: T) {
  levelGeometries.add(geometry);
  return geometry;
}

function createGround(level: RacingLevelDefinition) {
  if (!worldGroup || level.ground === 'void') return;
  const width = level.worldBounds.maxX - level.worldBounds.minX;
  const depth = level.worldBounds.maxZ - level.worldBounds.minZ;
  const geometry = addLevelGeometry(new THREE.BoxGeometry(width, 0.18, depth));
  const material = addLevelMaterial(new THREE.MeshStandardMaterial({
    color: level.groundColor,
    roughness: 1,
    metalness: 0,
  }));
  groundMesh = new THREE.Mesh(geometry, material);
  groundMesh.position.set(
    (level.worldBounds.minX + level.worldBounds.maxX) / 2,
    -0.13,
    (level.worldBounds.minZ + level.worldBounds.maxZ) / 2,
  );
  groundMesh.receiveShadow = true;
  worldGroup.add(groundMesh);
}

function createThemeScenery(level: RacingLevelDefinition) {
  if (!worldGroup || !trackRuntime) return;
  if (level.theme === 'sky') {
    const geometry = addLevelGeometry(new THREE.CylinderGeometry(0.7, 1.15, 1, 8));
    const material = addLevelMaterial(new THREE.MeshStandardMaterial({
      color: 0x73889a,
      roughness: 0.86,
    }));
    const mainRoute = trackRuntime.routes.get('main');
    mainRoute?.samples.forEach((sample, index) => {
      if (index % 24 !== 0 || sample.position.y < 7) return;
      const height = sample.position.y + 12;
      const pillar = new THREE.Mesh(geometry, material);
      pillar.position.set(sample.position.x, sample.position.y - height / 2 - 0.1, sample.position.z);
      pillar.scale.set(1, height, 1);
      pillar.receiveShadow = true;
      worldGroup?.add(pillar);
    });
  }
  if (level.theme === 'mountain') {
    const geometry = addLevelGeometry(new THREE.DodecahedronGeometry(4, 0));
    const material = addLevelMaterial(new THREE.MeshStandardMaterial({
      color: 0x5c6154,
      roughness: 1,
    }));
    const mainRoute = trackRuntime.routes.get('main');
    mainRoute?.samples.forEach((sample, index) => {
      if (index % 45 !== 0) return;
      const rock = new THREE.Mesh(geometry, material);
      const direction = index % 90 === 0 ? 1 : -1;
      rock.position.copy(sample.position).addScaledVector(sample.side, direction * 10);
      rock.position.y -= 2.5;
      rock.scale.set(1.25, 1.8, 1.05);
      rock.rotation.y = index * 0.17;
      rock.receiveShadow = true;
      worldGroup?.add(rock);
    });
  }
}

function createFinishLine(gate: TrackGate) {
  if (!worldGroup) return;
  const columns = 10;
  const rows = 2;
  const cellWidth = gate.width / columns;
  const cellDepth = 0.52;
  const geometry = addLevelGeometry(new THREE.BoxGeometry(cellWidth * 1.015, 0.035, cellDepth * 1.015));
  const darkMaterial = addLevelMaterial(new THREE.MeshStandardMaterial({
    color: 0x242525,
    roughness: 0.82,
  }));
  const lightMaterial = addLevelMaterial(new THREE.MeshStandardMaterial({
    color: 0xf4ede1,
    roughness: 0.86,
  }));
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cell = new THREE.Mesh(
        geometry,
        (row + column) % 2 === 0 ? lightMaterial : darkMaterial,
      );
      cell.position.copy(gate.position)
        .addScaledVector(gate.side, (column + 0.5 - columns / 2) * cellWidth)
        .addScaledVector(gate.tangent, (row + 0.5 - rows / 2) * cellDepth)
        .addScaledVector(gate.up, 0.035);
      cell.quaternion.copy(gate.rotation);
      cell.receiveShadow = true;
      worldGroup.add(cell);
    }
  }
}

function createPhysics(level: RacingLevelDefinition) {
  if (!trackRuntime) return;
  physicsWorld = new RAPIER.World({ x: 0, y: -18, z: 0 });
  physicsWorld.timestep = FIXED_TIME_STEP;
  roadColliderHandles.clear();
  drivableColliderHandles.clear();
  barrierColliderHandles.clear();

  trackRuntime.routes.forEach((route) => {
    const descriptor = RAPIER.ColliderDesc.trimesh(route.colliderVertices, route.colliderIndices)
      .setFriction(1.35)
      .setRestitution(0.02);
    const collider = physicsWorld!.createCollider(descriptor);
    roadColliderHandles.add(collider.handle);
    drivableColliderHandles.add(collider.handle);
    route.barrierColliders.forEach((barrier) => {
      const barrierCollider = physicsWorld!.createCollider(
        RAPIER.ColliderDesc.cuboid(
          barrier.halfExtents.x,
          barrier.halfExtents.y,
          barrier.halfExtents.z,
        )
          .setTranslation(barrier.position.x, barrier.position.y, barrier.position.z)
          .setRotation({
            x: barrier.rotation.x,
            y: barrier.rotation.y,
            z: barrier.rotation.z,
            w: barrier.rotation.w,
          })
          // 护栏只负责阻挡，低切向摩擦避免车身碰撞后被持续吸附在墙面。
          .setFriction(0.08)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
          .setRestitution(0.12),
      );
      barrierColliderHandles.add(barrierCollider.handle);
    });
  });

  if (level.ground !== 'void') {
    const width = level.worldBounds.maxX - level.worldBounds.minX;
    const depth = level.worldBounds.maxZ - level.worldBounds.minZ;
    const groundCollider = physicsWorld.createCollider(
      RAPIER.ColliderDesc.cuboid(width / 2, 0.1, depth / 2)
        .setTranslation(
          (level.worldBounds.minX + level.worldBounds.maxX) / 2,
          -0.14,
          (level.worldBounds.minZ + level.worldBounds.maxZ) / 2,
        )
        .setFriction(level.ground === 'sand' ? 0.72 : 0.88)
        .setRestitution(0),
    );
    drivableColliderHandles.add(groundCollider.handle);
  }

  const spawn = trackRuntime.startPose;
  const spawnPosition = spawn.position.clone().addScaledVector(spawn.up, 0.86);
  vehicleBody = physicsWorld.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnPosition.x, spawnPosition.y, spawnPosition.z)
      .setRotation({ x: spawn.rotation.x, y: spawn.rotation.y, z: spawn.rotation.z, w: spawn.rotation.w })
      .setLinearDamping(0.18)
      .setAngularDamping(1.15)
      .setCcdEnabled(true)
      .setAdditionalMass(85),
  );
  vehicleCollider = physicsWorld.createCollider(
    RAPIER.ColliderDesc.cuboid(0.88, 0.32, 1.72)
      .setTranslation(0, 0.24, 0)
      .setFriction(0.82)
      .setRestitution(0.08),
    vehicleBody,
  );
  vehicleController = physicsWorld.createVehicleController(vehicleBody);
  vehicleController.indexUpAxis = 1;
  vehicleController.setIndexForwardAxis = 2;

  const wheelPoints = [
    { x: 0.76, y: 0, z: 1.12 },
    { x: -0.76, y: 0, z: 1.12 },
    { x: 0.76, y: 0, z: -1.05 },
    { x: -0.76, y: 0, z: -1.05 },
  ];
  wheelPoints.forEach((point) => {
    vehicleController!.addWheel(
      point,
      { x: 0, y: -1, z: 0 },
      { x: 1, y: 0, z: 0 },
      0.34,
      0.34,
    );
  });
  for (let index = 0; index < vehicleController.numWheels(); index += 1) {
    vehicleController.setWheelSuspensionStiffness(index, 34);
    vehicleController.setWheelSuspensionCompression(index, 4.6);
    vehicleController.setWheelSuspensionRelaxation(index, 5.4);
    vehicleController.setWheelMaxSuspensionTravel(index, 0.3);
    vehicleController.setWheelMaxSuspensionForce(index, 6200);
    vehicleController.setWheelFrictionSlip(index, 2.8);
    vehicleController.setWheelSideFrictionStiffness(index, 1.75);
  }
  lastSafePose = cloneTrackPose(spawn);
}

function cloneTrackPose(pose: TrackPose) {
  return {
    position: pose.position.clone(),
    tangent: pose.tangent.clone(),
    side: pose.side.clone(),
    up: pose.up.clone(),
    rotation: pose.rotation.clone(),
    width: pose.width,
  } satisfies TrackPose;
}

function setVehiclePose(pose: TrackPose) {
  if (!vehicleBody) return;
  const position = pose.position.clone().addScaledVector(pose.up, 0.86);
  vehicleBody.setTranslation({ x: position.x, y: position.y, z: position.z }, true);
  vehicleBody.setRotation({
    x: pose.rotation.x,
    y: pose.rotation.y,
    z: pose.rotation.z,
    w: pose.rotation.w,
  }, true);
  vehicleBody.setLinvel({ x: 0, y: 0, z: 0 }, true);
  vehicleBody.setAngvel({ x: 0, y: 0, z: 0 }, true);
  vehicleBody.resetForces(true);
  vehicleBody.resetTorques(true);
  steeringAngle = 0;
  driveSpeed = 0;
  speed.value = 0;
  updateVehicleObject();
}

function disposePhysics() {
  if (physicsWorld && vehicleController) physicsWorld.removeVehicleController(vehicleController);
  physicsWorld?.free();
  physicsWorld = undefined;
  vehicleBody = undefined;
  vehicleCollider = undefined;
  vehicleController = undefined;
  roadColliderHandles.clear();
  drivableColliderHandles.clear();
  barrierColliderHandles.clear();
  physicsAccumulator = 0;
}

function disposeCurrentLevel() {
  disposePhysics();
  if (scene && worldGroup) scene.remove(worldGroup);
  disposeLevelTrack(trackRuntime);
  trackRuntime = undefined;
  worldGroup?.clear();
  worldGroup = undefined;
  vehicleObject = undefined;
  groundMesh = undefined;
  levelGeometries.forEach((geometry) => geometry.dispose());
  levelMaterials.forEach((material) => material.dispose());
  levelGeometries.clear();
  levelMaterials.clear();
}

function buildLevel(level: RacingLevelDefinition) {
  if (!scene) return;
  disposeCurrentLevel();
  worldGroup = new THREE.Group();
  worldGroup.name = `racing-world-${level.id}`;
  const roadMaterial = addLevelMaterial(new THREE.MeshStandardMaterial({
    color: level.roadColor,
    roughness: 0.86,
    metalness: 0.02,
    side: THREE.DoubleSide,
  }));
  const curbRed = addLevelMaterial(new THREE.MeshStandardMaterial({
    color: 0xe4473f,
    roughness: 0.82,
    side: THREE.DoubleSide,
  }));
  const curbWhite = addLevelMaterial(new THREE.MeshStandardMaterial({
    color: 0xf4ede1,
    roughness: 0.88,
    side: THREE.DoubleSide,
  }));
  trackRuntime = createLevelTrack(level, { road: roadMaterial, curbRed, curbWhite });
  worldGroup.add(trackRuntime.group);
  createGround(level);

  const finish = trackRuntime.finishGate;
  createFinishLine(finish);
  trackRuntime.routes.forEach((route) => {
    route.barrierPlacements.forEach((placement) => {
      addAssetToWorld(
        placement.color === 'red' ? 'barrierRed' : 'barrierWhite',
        placement.position,
        placement.rotation,
      );
    });
  });
  level.decorations.forEach((decoration) => {
    addAssetToWorld(
      decoration.asset,
      new THREE.Vector3(...decoration.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, decoration.rotationY, 0)),
      decoration.scale,
    );
  });
  createThemeScenery(level);

  vehicleObject = cloneAsset('race');
  vehicleObject.traverse((object) => {
    if (object instanceof THREE.Mesh) object.castShadow = true;
  });
  worldGroup.add(vehicleObject);
  scene.add(worldGroup);
  createPhysics(level);
  resetRaceState();
  updateSceneTheme();
  updateCamera(true);
}

function crossedGate(previous: THREE.Vector3, current: THREE.Vector3, gate: TrackGate) {
  const previousOffset = previous.clone().sub(gate.position);
  const currentOffset = current.clone().sub(gate.position);
  const previousForward = previousOffset.dot(gate.tangent);
  const currentForward = currentOffset.dot(gate.tangent);
  if (previousForward >= 0 || currentForward < 0) return false;
  const lateral = Math.abs(currentOffset.dot(gate.side));
  const vertical = Math.abs(currentOffset.dot(gate.up));
  return lateral <= gate.width / 2 + 1.2 && vertical <= 2.8;
}

function saveSafePose(gate: TrackGate) {
  lastSafePose = cloneTrackPose(gate);
}

function completeLap() {
  const level = activeLevel.value;
  if (!level) return;
  const lapTime = Math.max(0, raceElapsedMs.value - lapStartedAtMs);
  lapTimes.value = [...lapTimes.value, lapTime];
  completedLaps.value = lapTimes.value.length;
  lapStartedAtMs = raceElapsedMs.value;
  nextCheckpointIndex = 0;
  if (completedLaps.value < level.laps) return;

  racePhase.value = 'finished';
  clearInputs();
  vehicleBody?.setLinvel({ x: 0, y: 0, z: 0 }, true);
  vehicleBody?.setAngvel({ x: 0, y: 0, z: 0 }, true);
  const bestLap = Math.min(...lapTimes.value);
  const previousRecord = records.value[level.id] ?? {};
  records.value = {
    ...records.value,
    [level.id]: {
      bestLapMs: previousRecord.bestLapMs === undefined
        ? bestLap
        : Math.min(previousRecord.bestLapMs, bestLap),
      bestRaceMs: previousRecord.bestRaceMs === undefined
        ? raceElapsedMs.value
        : Math.min(previousRecord.bestRaceMs, raceElapsedMs.value),
    },
  };
  unlockedLevel.value = Math.min(4, Math.max(unlockedLevel.value, level.index + 1));
  saveRecords();
}

function updateRaceProgress(previous: THREE.Vector3, current: THREE.Vector3) {
  if (!trackRuntime) return;
  const expectedOptions = trackRuntime.checkpointGroups[nextCheckpointIndex];
  const crossedCheckpoint = expectedOptions?.find((gate) => crossedGate(previous, current, gate));
  if (crossedCheckpoint) {
    nextCheckpointIndex += 1;
    saveSafePose(crossedCheckpoint);
    return;
  }
  if (
    nextCheckpointIndex === trackRuntime.checkpointGroups.length
    && crossedGate(previous, current, trackRuntime.finishGate)
  ) {
    saveSafePose(trackRuntime.finishGate);
    completeLap();
  }
}

function isVehicleOutOfBounds(level: RacingLevelDefinition, position: RAPIER.Vector) {
  const padding = 24;
  return position.y < level.killY
    || position.x < level.worldBounds.minX - padding
    || position.x > level.worldBounds.maxX + padding
    || position.z < level.worldBounds.minZ - padding
    || position.z > level.worldBounds.maxZ + padding;
}

function getVehicleForward() {
  if (!vehicleBody) return new THREE.Vector3(0, 0, 1);
  const bodyRotation = vehicleBody.rotation();
  const bodyForward = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(
    bodyRotation.x,
    bodyRotation.y,
    bodyRotation.z,
    bodyRotation.w,
  ));
  // 纵向驾驶只取水平投影，斜坡高度仍由刚体碰撞和悬挂负责。
  bodyForward.y = 0;
  return bodyForward.lengthSq() > 0.0001 ? bodyForward.normalize() : new THREE.Vector3(0, 0, 1);
}

function updateVehicleControls(allowControls: boolean) {
  if (!vehicleController || !vehicleBody) return;
  // 统一反转转向输入符号，确保 A 左转、D 右转。
  const steeringInput = allowControls
    ? Number(isInputPressed('a')) - Number(isInputPressed('d'))
    : 0;
  const forwardPressed = allowControls && isInputPressed('w');
  const reversePressed = allowControls && isInputPressed('s');
  const inputDirection = forwardPressed === reversePressed ? 0 : (forwardPressed ? 1 : -1);
  const bodyForward = getVehicleForward();
  const bodyVelocity = vehicleBody.linvel();
  const forwardSpeed = bodyForward.x * bodyVelocity.x + bodyForward.z * bodyVelocity.z;
  const speedMagnitude = Math.hypot(bodyVelocity.x, bodyVelocity.z);
  const speedRatio = Math.min(1, speedMagnitude / 28);
  const steeringLimit = THREE.MathUtils.lerp(0.5, 0.28, speedRatio);
  steeringAngle = THREE.MathUtils.lerp(steeringAngle, steeringInput * steeringLimit, 0.2);

  let groundedWheels = 0;
  let roadWheels = 0;
  for (let index = 0; index < vehicleController.numWheels(); index += 1) {
    if (!vehicleController.wheelIsInContact(index)) continue;
    groundedWheels += 1;
    const collider = vehicleController.wheelGroundObject(index);
    if (collider && roadColliderHandles.has(collider.handle)) roadWheels += 1;
  }
  const grounded = groundedWheels > 0;
  const onRoad = roadWheels > 0;
  const driftSpeedFactor = THREE.MathUtils.clamp((speedMagnitude - 5.5) / 8, 0, 1);
  const driftSteeringFactor = THREE.MathUtils.clamp(
    Math.abs(steeringAngle) / Math.max(steeringLimit * 0.55, 0.01),
    0,
    1,
  );
  const driftIntensity = driftSpeedFactor * driftSteeringFactor;
  const drifting = grounded && driftIntensity > 0.08;
  const speedLimit = onRoad ? 30 : (activeLevel.value?.offRoadSpeedLimit ?? 14);

  vehicleController.setWheelSteering(0, steeringAngle);
  vehicleController.setWheelSteering(1, steeringAngle);
  vehicleController.setWheelSteering(2, 0);
  vehicleController.setWheelSteering(3, 0);
  for (let index = 0; index < 4; index += 1) {
    // 轮上发动机力会与轻量车身悬挂形成俯仰反馈，因此只让轮胎负责转向与侧向抓地。
    vehicleController.setWheelEngineForce(index, 0);
    vehicleController.setWheelBrake(index, 0);
    const rearWheel = index >= 2;
    // 后轮抓地随速度和转向连续释放，使收油状态也能轻松进入、退出漂移。
    const baseSideFriction = onRoad ? 1.75 : 0.92;
    const sideFriction = rearWheel
      ? THREE.MathUtils.lerp(baseSideFriction, 0.68, driftIntensity)
      : baseSideFriction;
    const frictionSlip = rearWheel
      ? THREE.MathUtils.lerp(onRoad ? 2.8 : 1.2, 1.25, driftIntensity)
      : (onRoad ? 2.8 : 1.2);
    vehicleController.setWheelSideFrictionStiffness(index, sideFriction);
    vehicleController.setWheelFrictionSlip(index, frictionSlip);
  }

  if (!grounded) return;

  const targetSpeed = inputDirection > 0
    ? speedLimit
    : inputDirection < 0
      ? -speedLimit * 0.35
      : 0;
  const changingDirection = inputDirection !== 0
    && driveSpeed !== 0
    && Math.sign(targetSpeed) !== Math.sign(driveSpeed);
  const speedChangeRate = inputDirection === 0
    ? (onRoad ? 3 : 12)
    : changingDirection
      ? (onRoad ? 22 : 14)
      : inputDirection > 0
        ? (onRoad ? 9 : 5.5)
        : (onRoad ? 6 : 4);
  const speedDeltaLimit = speedChangeRate * FIXED_TIME_STEP;
  driveSpeed += THREE.MathUtils.clamp(targetSpeed - driveSpeed, -speedDeltaLimit, speedDeltaLimit);
  if (inputDirection === 0 && Math.abs(driveSpeed) < 0.02) driveSpeed = 0;

  // 单一目标速度模型只校正纵向分量，保留侧滑、碰撞和斜坡产生的其余速度。
  const longitudinalDelta = driveSpeed - forwardSpeed;
  vehicleBody.setLinvel({
    x: bodyVelocity.x + bodyForward.x * longitudinalDelta,
    y: bodyVelocity.y,
    z: bodyVelocity.z + bodyForward.z * longitudinalDelta,
  }, true);

  if (inputDirection !== 0 && Math.abs(steeringInput) > 0 && Math.abs(driveSpeed) < 5) {
    // 低速顶墙时保留有限转向能力，使赛车能主动改变朝向并脱离接触面。
    const angularVelocity = vehicleBody.angvel();
    const targetYawRate = -steeringInput * inputDirection * 0.8;
    vehicleBody.setAngvel({
      x: angularVelocity.x,
      y: THREE.MathUtils.lerp(angularVelocity.y, targetYawRate, 0.24),
      z: angularVelocity.z,
    }, true);
  } else if (drifting) {
    // 漂移偏航辅助只依赖当前速度与转向，降低对持续油门和精确反打的要求。
    const travelDirection = forwardSpeed < -0.1 ? -1 : 1;
    const yawAssist = THREE.MathUtils.lerp(9, 24, driftIntensity);
    vehicleBody.addTorque({
      x: 0,
      y: -steeringInput * travelDirection * yawAssist,
      z: 0,
    }, true);
  }
}

function resolveBarrierCollisions() {
  if (!physicsWorld || !vehicleBody || !vehicleCollider) return;
  const velocity = vehicleBody.linvel();
  let velocityX = velocity.x;
  let velocityZ = velocity.z;
  let touchingBarrier = false;

  physicsWorld.contactPairsWith(vehicleCollider, (collider) => {
    if (!barrierColliderHandles.has(collider.handle)) return;
    physicsWorld!.contactPair(vehicleCollider!, collider, (manifold, flipped) => {
      if (manifold.numSolverContacts() === 0) return;
      touchingBarrier = true;
      const contactNormal = manifold.normal();
      let normalX = flipped ? -contactNormal.x : contactNormal.x;
      let normalZ = flipped ? -contactNormal.z : contactNormal.z;
      const normalLength = Math.hypot(normalX, normalZ);
      if (normalLength < 0.0001) return;
      normalX /= normalLength;
      normalZ /= normalLength;
      const speedIntoBarrier = velocityX * normalX + velocityZ * normalZ;
      if (speedIntoBarrier <= 0) return;
      // 删除朝墙速度但保留沿墙速度，碰撞后不会继续积累把车压在墙上的分量。
      velocityX -= normalX * speedIntoBarrier;
      velocityZ -= normalZ * speedIntoBarrier;
    });
  });

  if (!touchingBarrier) return;
  vehicleBody.setLinvel({ x: velocityX, y: velocity.y, z: velocityZ }, true);
  const bodyForward = getVehicleForward();
  driveSpeed = bodyForward.x * velocityX + bodyForward.z * velocityZ;
}

function stepPhysics(allowControls: boolean) {
  const level = activeLevel.value;
  if (!physicsWorld || !vehicleBody || !vehicleController || !level) return;
  const before = vehicleBody.translation();
  const previous = new THREE.Vector3(before.x, before.y, before.z);
  updateVehicleControls(allowControls);
  // 车轮射线只允许命中路面和地面，避免把竖直护栏当成承载面后贴墙。
  vehicleController.updateVehicle(
    FIXED_TIME_STEP,
    undefined,
    undefined,
    (collider) => drivableColliderHandles.has(collider.handle),
  );
  physicsWorld.step();
  resolveBarrierCollisions();
  const after = vehicleBody.translation();
  const current = new THREE.Vector3(after.x, after.y, after.z);
  const velocity = vehicleBody.linvel();
  speed.value = Math.hypot(velocity.x, velocity.z);
  if (allowControls) updateRaceProgress(previous, current);
  if (isVehicleOutOfBounds(level, after) && lastSafePose) setVehiclePose(lastSafePose);
}

function updateVehicleObject() {
  if (!vehicleObject || !vehicleBody) return;
  const position = vehicleBody.translation();
  const rotation = vehicleBody.rotation();
  vehicleObject.position.set(position.x, position.y, position.z);
  vehicleObject.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
}

function updateCamera(force = false) {
  if (!camera) return;
  let targetX = 0;
  let targetY = 0;
  let targetZ = 0;
  if (vehicleBody) {
    const translation = vehicleBody.translation();
    targetX = translation.x;
    targetY = translation.y;
    targetZ = translation.z;
  }
  if (force || reducedMotion) {
    cameraTarget.set(targetX, targetY, targetZ);
  } else {
    cameraTarget.x = THREE.MathUtils.lerp(cameraTarget.x, targetX, 0.085);
    cameraTarget.y = THREE.MathUtils.lerp(cameraTarget.y, targetY, 0.07);
    cameraTarget.z = THREE.MathUtils.lerp(cameraTarget.z, targetZ, 0.085);
  }
  camera.position.set(cameraTarget.x, cameraTarget.y + 42, cameraTarget.z + 22);
  camera.lookAt(cameraTarget);
  camera.updateMatrixWorld();
}

function renderFrame(time: number) {
  animationFrame = 0;
  const deltaSeconds = lastFrameTime === 0 ? 0 : Math.min((time - lastFrameTime) / 1000, 0.05);
  lastFrameTime = time;

  if (racePhase.value === 'countdown') {
    countdownRemainingMs.value = Math.max(0, countdownRemainingMs.value - deltaSeconds * 1000);
    if (countdownRemainingMs.value === 0) {
      racePhase.value = 'running';
      lapStartedAtMs = raceElapsedMs.value;
      physicsAccumulator = 0;
    }
  } else if (racePhase.value === 'running') {
    raceElapsedMs.value += deltaSeconds * 1000;
    physicsAccumulator = Math.min(physicsAccumulator + deltaSeconds, FIXED_TIME_STEP * MAX_PHYSICS_STEPS);
    let steps = 0;
    while (physicsAccumulator >= FIXED_TIME_STEP && steps < MAX_PHYSICS_STEPS) {
      stepPhysics(true);
      physicsAccumulator -= FIXED_TIME_STEP;
      steps += 1;
    }
  }

  updateVehicleObject();
  updateCamera();
  if (renderer && scene && camera) renderer.render(scene, camera);
  if (!document.hidden) animationFrame = window.requestAnimationFrame(renderFrame);
}

function startRenderLoop() {
  if (animationFrame !== 0 || document.hidden) return;
  lastFrameTime = 0;
  animationFrame = window.requestAnimationFrame(renderFrame);
}

function resetRaceState() {
  if (!trackRuntime) return;
  clearInputs();
  lastSafePose = cloneTrackPose(trackRuntime.startPose);
  setVehiclePose(trackRuntime.startPose);
  raceElapsedMs.value = 0;
  lapStartedAtMs = 0;
  lapTimes.value = [];
  completedLaps.value = 0;
  nextCheckpointIndex = 0;
  countdownRemainingMs.value = COUNTDOWN_DURATION_MS;
  pauseMessage.value = '';
  physicsAccumulator = 0;
  updateVehicleObject();
  updateCamera(true);
}

function startRace() {
  if (loadState.value !== 'ready' || !activeLevel.value) return;
  resetRaceState();
  racePhase.value = 'countdown';
  gameElement.value?.focus();
  startRenderLoop();
}

function restartRace() {
  startRace();
}

function pauseRace(message = '比赛已暂停。') {
  if (racePhase.value !== 'countdown' && racePhase.value !== 'running') return;
  phaseBeforePause = racePhase.value;
  racePhase.value = 'paused';
  pauseMessage.value = message;
  physicsAccumulator = 0;
  clearInputs();
}

function continueRace() {
  if (racePhase.value !== 'paused') return;
  racePhase.value = phaseBeforePause;
  pauseMessage.value = '';
  lastFrameTime = 0;
  physicsAccumulator = 0;
  gameElement.value?.focus();
  startRenderLoop();
}

function togglePause() {
  if (racePhase.value === 'paused') continueRace();
  else pauseRace();
}

function showLevelSelection() {
  clearInputs();
  racePhase.value = 'selecting';
  pauseMessage.value = '';
}

async function chooseLevel(level: RacingLevelDefinition) {
  if (!isLevelUnlocked(level)) return;
  selectedLevelId.value = level.id;
  const currentAttempt = ++loadAttempt;
  loadState.value = 'loading';
  loadProgress.value = 0;
  loadError.value = '';
  try {
    await ensureAssets([...COMMON_ASSETS, ...level.requiredAssets], currentAttempt);
    if (currentAttempt !== loadAttempt) return;
    buildLevel(level);
    racePhase.value = 'ready';
    loadState.value = 'ready';
    await nextTick();
    updateSceneTheme();
    gameElement.value?.focus();
  } catch (error) {
    if (currentAttempt !== loadAttempt) return;
    loadState.value = 'error';
    loadError.value = '当前关卡资源加载失败，请重新加载或返回关卡选择。';
    console.warn(`赛车关卡 ${level.id} 加载失败。`, error);
  }
}

function playNextLevel() {
  if (nextLevel.value) void chooseLevel(nextLevel.value);
}

async function retryLoading() {
  if (activeLevel.value) await chooseLevel(activeLevel.value);
  else await loadGame();
}

function updateSceneTheme() {
  if (!scene || !gameElement.value) return;
  const styles = getComputedStyle(gameElement.value);
  const sky = styles.getPropertyValue('--racing-sky').trim() || '#101923';
  const fog = styles.getPropertyValue('--racing-fog').trim() || sky;
  const ambient = styles.getPropertyValue('--racing-ambient').trim() || '#9fb3c7';
  const key = styles.getPropertyValue('--racing-key-light').trim() || '#ffe2b2';
  scene.background = new THREE.Color(sky);
  scene.fog = new THREE.Fog(fog, 48, 128);
  hemisphereLight?.color.set(ambient);
  hemisphereLight?.groundColor.set(sky);
  keyLight?.color.set(key);
  if (renderer && camera) renderer.render(scene, camera);
}

function createScene() {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-24, 24, 24, -24, 0.1, 180);
  hemisphereLight = new THREE.HemisphereLight(0x9fb3c7, 0x2f4b3d, 2.35);
  keyLight = new THREE.DirectionalLight(0xffe2b2, 3.1);
  keyLight.position.set(-28, 44, 24);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -36;
  keyLight.shadow.camera.right = 36;
  keyLight.shadow.camera.top = 36;
  keyLight.shadow.camera.bottom = -36;
  scene.add(hemisphereLight, keyLight);
  updateCamera(true);
  updateSceneTheme();
}

function resizeRenderer() {
  const stage = stageElement.value;
  if (!stage || !renderer || !camera) return;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (width <= 0 || height <= 0) return;
  const aspect = width / height;
  camera.left = -CAMERA_VIEW_SIZE * aspect / 2;
  camera.right = CAMERA_VIEW_SIZE * aspect / 2;
  camera.top = CAMERA_VIEW_SIZE / 2;
  camera.bottom = -CAMERA_VIEW_SIZE / 2;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setSize(width, height, false);
  if (scene) renderer.render(scene, camera);
}

function initializeRenderer() {
  const canvas = canvasElement.value;
  if (!canvas) throw new Error('找不到赛车画布。');
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  createScene();
  resizeRenderer();
}

async function loadGame() {
  const currentAttempt = ++loadAttempt;
  loadState.value = 'loading';
  loadProgress.value = 0;
  loadError.value = '';
  try {
    if (!renderer) initializeRenderer();
    await RAPIER.init();
    if (currentAttempt !== loadAttempt) return;
    loadProgress.value = 8;
    await ensureAssets(COMMON_ASSETS, currentAttempt);
    if (currentAttempt !== loadAttempt) return;
    racePhase.value = 'selecting';
    loadState.value = 'ready';
    startRenderLoop();
  } catch (error) {
    if (currentAttempt !== loadAttempt) return;
    loadState.value = 'error';
    loadError.value = '赛车引擎或公共资源初始化失败，请检查硬件加速后重试。';
    console.warn('高空俯视赛车初始化失败。', error);
  }
}

function disposeMaterial(material: THREE.Material, textures: Set<object>) {
  Object.values(material as unknown as Record<string, unknown>).forEach((value) => {
    if (!(value instanceof THREE.Texture) || textures.has(value)) return;
    textures.add(value);
    value.dispose();
  });
  material.dispose();
}

function disposeObjectResources(
  root: THREE.Object3D,
  geometries: Set<THREE.BufferGeometry>,
  materials: Set<THREE.Material>,
  textures: Set<object>,
) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
    if (!geometries.has(mesh.geometry)) {
      geometries.add(mesh.geometry);
      mesh.geometry.dispose();
    }
    const objectMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    objectMaterials.forEach((material) => {
      if (materials.has(material)) return;
      materials.add(material);
      disposeMaterial(material, textures);
    });
  });
}

function disposeGame() {
  loadAttempt += 1;
  window.cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  motionQuery?.removeEventListener('change', handleReducedMotionChange);
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('keyup', handleKeyup);
  window.removeEventListener('blur', handleWindowBlur);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  clearInputs();
  disposeCurrentLevel();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<object>();
  assetTemplates.forEach((root) => disposeObjectResources(root, geometries, materials, textures));
  assetTemplates.clear();
  scene?.clear();
  scene = undefined;
  camera = undefined;
  hemisphereLight = undefined;
  keyLight = undefined;
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = undefined;
}

onMounted(async () => {
  await nextTick();
  loadRecords();
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion = motionQuery.matches;
  motionQuery.addEventListener('change', handleReducedMotionChange);
  window.addEventListener('keydown', handleKeydown, { passive: false });
  window.addEventListener('keyup', handleKeyup, { passive: false });
  window.addEventListener('blur', handleWindowBlur);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  resizeObserver = new ResizeObserver(resizeRenderer);
  if (stageElement.value) resizeObserver.observe(stageElement.value);
  // Three.js 场景从游戏根节点读取语义色，并跟随全局 Light/Dark 状态实时更新。
  themeObserver = new MutationObserver(updateSceneTheme);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  gameElement.value?.focus();
  await loadGame();
});

onBeforeUnmount(disposeGame);
</script>

<template>
  <section
    ref="gameElement"
    class="racing-game"
    data-top-down-racing-theme-root
    :data-level-theme="activeLevel?.theme ?? 'grass'"
    tabindex="-1"
    aria-labelledby="racing-title"
  >
    <h2 id="racing-title" class="sr-only">高空俯视赛车四关计时赛</h2>
    <div ref="stageElement" class="racing-stage">
      <canvas ref="canvasElement" aria-label="高空俯视赛车赛道"></canvas>

      <AsyncGameLoading
        v-if="loadState !== 'ready'"
        class="racing-loading"
        eyebrow="KENNEY RACING KIT / RAPIER"
        message="正在装载赛车、关卡与物理引擎…"
        :progress="loadProgress"
        :error-message="loadError"
        retry-label="重新加载"
        @retry="retryLoading"
      />

      <template v-else>
        <dl v-if="activeLevel && racePhase !== 'selecting'" class="race-hud" aria-label="比赛状态">
          <div>
            <dt>SPEED</dt>
            <dd>{{ String(speedKph).padStart(3, '0') }}<small>KM/H</small></dd>
          </div>
          <div>
            <dt>{{ activeLevel.raceMode === 'sprint' ? 'STAGE' : 'LAP' }}</dt>
            <dd>{{ currentLap }}<small>/ {{ activeLevel.laps }}</small></dd>
          </div>
          <div>
            <dt>TOTAL</dt>
            <dd>{{ formatTime(raceElapsedMs) }}</dd>
          </div>
        </dl>

        <div v-if="activeLevel && racePhase !== 'selecting'" class="race-actions" aria-label="比赛操作">
          <button
            type="button"
            :disabled="racePhase === 'ready' || racePhase === 'finished'"
            @click="togglePause"
          >
            {{ pauseButtonLabel }}
          </button>
          <button type="button" aria-keyshortcuts="R" @click="restartRace">重新开始（R）</button>
        </div>

        <output v-if="racePhase === 'countdown'" class="race-countdown" aria-live="assertive">
          {{ countdownLabel }}
        </output>

        <div
          v-if="racePhase === 'selecting' || racePhase === 'ready' || racePhase === 'paused' || racePhase === 'finished'"
          class="race-overlay"
          :class="{ 'race-overlay--selection': racePhase === 'selecting' }"
        >
          <section v-if="racePhase === 'selecting'" class="level-select" aria-labelledby="level-select-title">
            <header>
              <p>FOUR-STAGE TIME TRIAL</p>
              <h3 id="level-select-title">选择关卡</h3>
              <p>完成当前关卡后依次解锁下一站。</p>
            </header>
            <ol class="level-grid">
              <li v-for="level in racingLevels" :key="level.id">
                <button
                  type="button"
                  class="level-card"
                  :class="`level-card--${level.theme}`"
                  :disabled="!isLevelUnlocked(level)"
                  :aria-label="isLevelUnlocked(level) ? `进入${level.name}` : `${level.name}尚未解锁`"
                  @click="chooseLevel(level)"
                >
                  <span class="level-card__index">{{ String(level.index).padStart(2, '0') }}</span>
                  <span class="level-card__lock">{{ isLevelUnlocked(level) ? level.code : 'LOCKED' }}</span>
                  <strong>{{ level.name }}</strong>
                  <span class="level-card__copy">{{ level.description }}</span>
                  <span class="level-card__meta">
                    {{ level.raceMode === 'sprint' ? '1 次赛段' : `${level.laps} 圈` }}
                    · {{ formatTime(getLevelRecord(level.id)?.bestRaceMs) }}
                  </span>
                </button>
              </li>
            </ol>
          </section>

          <section v-else-if="racePhase === 'ready'" class="race-panel race-panel--intro" aria-labelledby="race-intro-title">
            <p>{{ activeLevel?.code }}</p>
            <h3 id="race-intro-title">{{ activeLevel?.name }}</h3>
            <p class="race-panel__copy">{{ activeLevel?.description }}</p>
            <p class="race-panel__hint">W 加速，S 制动 / 倒车，A D 转向，R 重置。达到一定速度后转向即可漂移，无需持续踩油门。</p>
            <div class="race-panel__buttons">
              <button type="button" @click="startRace">开始比赛</button>
              <button type="button" class="button-secondary" @click="showLevelSelection">选择关卡</button>
            </div>
          </section>

          <section v-else-if="racePhase === 'paused'" class="race-panel" aria-labelledby="race-paused-title">
            <p>RACE PAUSED</p>
            <h3 id="race-paused-title">比赛已暂停</h3>
            <p class="race-panel__copy">{{ pauseMessage }}</p>
            <div class="race-panel__buttons">
              <button type="button" @click="continueRace">继续比赛</button>
              <button type="button" class="button-secondary" @click="showLevelSelection">选择关卡</button>
            </div>
          </section>

          <section v-else class="race-panel race-panel--result" aria-labelledby="race-result-title">
            <p>RACE COMPLETE</p>
            <h3 id="race-result-title">{{ activeLevel?.name }}完成</h3>
            <dl class="race-result">
              <div><dt>本次总成绩</dt><dd>{{ formatTime(raceElapsedMs) }}</dd></div>
              <div><dt>最佳单圈</dt><dd>{{ formatTime(sessionBestLapMs) }}</dd></div>
              <div><dt>关卡最佳</dt><dd>{{ formatTime(activeRecord?.bestRaceMs) }}</dd></div>
            </dl>
            <div class="race-panel__buttons race-panel__buttons--result">
              <button v-if="nextLevel" type="button" @click="playNextLevel">下一关</button>
              <button type="button" class="button-secondary" @click="restartRace">再跑一次</button>
              <button type="button" class="button-secondary" @click="showLevelSelection">选择关卡</button>
            </div>
          </section>
        </div>

        <div v-if="activeLevel && racePhase !== 'selecting'" class="touch-wasd" aria-label="触屏驾驶控制">
          <button
            type="button"
            aria-label="加速 W"
            @pointerdown.prevent="pressTouchControl('w', $event)"
            @pointerup.prevent="releaseTouchControl"
            @pointercancel.prevent="releaseTouchControl"
          >W</button>
          <button
            type="button"
            aria-label="左转 A"
            @pointerdown.prevent="pressTouchControl('a', $event)"
            @pointerup.prevent="releaseTouchControl"
            @pointercancel.prevent="releaseTouchControl"
          >A</button>
          <button
            type="button"
            aria-label="制动或倒车 S"
            @pointerdown.prevent="pressTouchControl('s', $event)"
            @pointerup.prevent="releaseTouchControl"
            @pointercancel.prevent="releaseTouchControl"
          >S</button>
          <button
            type="button"
            aria-label="右转 D"
            @pointerdown.prevent="pressTouchControl('d', $event)"
            @pointerup.prevent="releaseTouchControl"
            @pointercancel.prevent="releaseTouchControl"
          >D</button>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.racing-game {
  position: relative;
  min-height: calc(100dvh - 72px);
  color: var(--game-foreground);
  outline: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  border: 0;
  clip: rect(0 0 0 0);
  margin: -1px;
  white-space: nowrap;
}

.racing-stage {
  position: relative;
  min-height: max(34rem, calc(100dvh - 72px));
  overflow: hidden;
  background: var(--racing-sky);
  isolation: isolate;
}

.racing-stage canvas {
  position: absolute;
  display: block;
  width: 100%;
  height: 100%;
  inset: 0;
}

.racing-loading {
  position: absolute;
  z-index: 7;
  min-height: 100%;
  background: var(--game-background);
  inset: 0;
}

.race-hud {
  position: absolute;
  z-index: 3;
  top: max(1rem, env(safe-area-inset-top));
  left: max(1rem, env(safe-area-inset-left));
  display: flex;
  margin: 0;
  border: 1px solid var(--game-border-strong);
  background: var(--racing-hud);
  box-shadow: 0 14px 38px var(--game-shadow);
  backdrop-filter: blur(10px);
}

.race-hud > div {
  min-width: 7.4rem;
  padding: .75rem .9rem;
}

.race-hud > div + div {
  border-left: 1px solid var(--game-border);
}

.race-hud dt,
.race-panel > p:first-child,
.level-select header > p:first-child {
  color: var(--racing-level-accent);
  font-size: .58rem;
  font-weight: 780;
  letter-spacing: .17em;
}

.race-hud dd {
  margin: .35rem 0 0;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: clamp(.9rem, 2vw, 1.24rem);
  font-variant-numeric: tabular-nums;
  font-weight: 720;
}

.race-hud small {
  margin-left: .3rem;
  color: var(--game-muted);
  font-size: .56rem;
  font-weight: 650;
}

.race-actions {
  position: absolute;
  z-index: 5;
  top: max(1rem, env(safe-area-inset-top));
  right: max(1rem, env(safe-area-inset-right));
  display: flex;
}

.race-actions button,
.race-panel button,
.touch-wasd button,
.level-card {
  min-height: 48px;
  border: 1px solid var(--game-border-strong);
  background: var(--racing-hud-strong);
  color: var(--game-foreground);
  cursor: pointer;
  font: inherit;
  font-size: .75rem;
  font-weight: 750;
  touch-action: manipulation;
  transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease, transform 220ms ease;
}

.race-actions button {
  min-width: 7rem;
  padding: 0 .9rem;
}

.race-actions button + button {
  border-left: 0;
}

.race-actions button:hover:not(:disabled),
.race-panel button:hover,
.touch-wasd button:hover,
.level-card:hover:not(:disabled) {
  border-color: var(--racing-level-accent);
  background: var(--game-control-hover);
}

.race-actions button:focus-visible,
.race-panel button:focus-visible,
.touch-wasd button:focus-visible,
.level-card:focus-visible {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--game-focus);
  outline-offset: 2px;
}

.race-actions button:disabled,
.level-card:disabled {
  cursor: not-allowed;
  opacity: .48;
}

.race-countdown {
  position: absolute;
  z-index: 4;
  display: grid;
  width: 8rem;
  height: 8rem;
  place-items: center;
  border: 1px solid var(--game-border-strong);
  border-radius: 50%;
  background: var(--racing-hud-strong);
  box-shadow: 0 24px 70px var(--game-shadow);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: 3.5rem;
  font-weight: 820;
  inset: 50% auto auto 50%;
  transform: translate(-50%, -50%);
}

.race-overlay {
  position: absolute;
  z-index: 4;
  display: grid;
  place-items: center;
  padding: 1rem;
  overflow-y: auto;
  background: var(--racing-scrim);
  inset: 0;
}

.race-overlay--selection {
  align-items: center;
  padding-top: 2rem;
  padding-bottom: 2rem;
}

.race-panel,
.level-select {
  width: min(calc(100% - 2rem), 58rem);
  border: 1px solid var(--game-border-strong);
  background: var(--racing-hud-strong);
  box-shadow: 0 28px 90px var(--game-shadow);
}

.race-panel {
  width: min(calc(100% - 2rem), 32rem);
  padding: clamp(1.5rem, 4vw, 2.5rem);
  text-align: center;
}

.race-panel > p,
.race-panel h3,
.race-result,
.level-select header > p,
.level-select h3,
.level-grid {
  margin: 0;
}

.race-panel h3,
.level-select h3 {
  margin-top: .65rem;
  font-size: clamp(2rem, 6vw, 3.65rem);
  font-weight: 610;
  letter-spacing: -.06em;
  line-height: .95;
}

.race-panel .race-panel__copy,
.race-panel__hint,
.level-select header > p:last-child {
  margin: 1.15rem auto 0;
  color: var(--game-muted);
  font-size: .84rem;
  line-height: 1.7;
}

.race-panel__hint {
  max-width: 27rem;
  margin-top: .65rem;
  font-size: .74rem;
}

.race-panel__buttons {
  display: flex;
  justify-content: center;
  margin: 1.5rem -.3rem 0;
}

.race-panel__buttons button {
  min-width: 9rem;
  margin: 0 .3rem;
  padding: 0 1.1rem;
  border-color: var(--racing-level-accent);
  background: var(--racing-level-accent);
  color: var(--racing-on-level-accent);
}

.race-panel__buttons .button-secondary {
  border-color: var(--game-border-strong);
  background: var(--game-control);
  color: var(--game-foreground);
}

.race-panel__buttons--result button {
  min-width: 7.5rem;
}

.race-result {
  margin-top: 1.5rem;
  border-top: 1px solid var(--game-border);
}

.race-result > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: .75rem 0;
  border-bottom: 1px solid var(--game-border);
}

.race-result dt {
  color: var(--game-muted);
  font-size: .75rem;
}

.race-result dd {
  margin: 0;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: .9rem;
  font-variant-numeric: tabular-nums;
  font-weight: 720;
}

.level-select {
  padding: clamp(1.25rem, 3.5vw, 2.5rem);
}

.level-select header {
  text-align: center;
}

.level-select h3 {
  font-size: clamp(2.2rem, 5vw, 4.5rem);
}

.level-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 0;
  margin-top: 2rem;
  list-style: none;
}

.level-grid li:nth-child(even) .level-card {
  border-left: 0;
}

.level-grid li:nth-child(n + 3) .level-card {
  border-top: 0;
}

.level-card {
  position: relative;
  display: flex;
  width: 100%;
  min-height: 12.5rem;
  flex-direction: column;
  align-items: flex-start;
  padding: 1.25rem;
  overflow: hidden;
  text-align: left;
}

.level-card::before {
  position: absolute;
  width: 9rem;
  height: 9rem;
  border-radius: 50%;
  background: var(--level-card-glow);
  content: '';
  filter: blur(10px);
  opacity: .34;
  inset: -4rem -2rem auto auto;
}

.level-card:hover:not(:disabled) {
  transform: translateY(-2px);
}

.level-card--grass { --level-card-glow: #4fa671; }
.level-card--desert { --level-card-glow: #d28a43; }
.level-card--sky { --level-card-glow: #5ba8d1; }
.level-card--mountain { --level-card-glow: #d16d56; }

.level-card__index,
.level-card__lock,
.level-card__meta {
  color: var(--game-muted);
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: .62rem;
  letter-spacing: .1em;
}

.level-card__lock {
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  color: var(--racing-level-accent);
}

.level-card strong {
  margin-top: 1.7rem;
  font-size: clamp(1.35rem, 3vw, 2rem);
  font-weight: 620;
  letter-spacing: -.045em;
}

.level-card__copy {
  margin-top: .55rem;
  color: var(--game-muted);
  font-size: .76rem;
  line-height: 1.55;
}

.level-card__meta {
  margin-top: auto;
  padding-top: 1rem;
}

.touch-wasd {
  position: absolute;
  z-index: 3;
  bottom: max(1rem, env(safe-area-inset-bottom));
  left: max(1rem, env(safe-area-inset-left));
  display: none;
  width: 9rem;
  grid-template-columns: repeat(3, 3rem);
  grid-template-rows: repeat(2, 3rem);
}

.touch-wasd button {
  min-width: 48px;
  padding: 0;
  font-family: "SFMono-Regular", Consolas, monospace;
  font-size: .9rem;
  touch-action: none;
  user-select: none;
}

.touch-wasd button:nth-child(1) { grid-row: 1; grid-column: 2; }
.touch-wasd button:nth-child(2) { grid-row: 2; grid-column: 1; }
.touch-wasd button:nth-child(3) { grid-row: 2; grid-column: 2; }
.touch-wasd button:nth-child(4) { grid-row: 2; grid-column: 3; }

.touch-wasd button:active {
  border-color: var(--racing-level-accent);
  background: var(--racing-level-accent);
  color: var(--racing-on-level-accent);
}

@media (max-width: 768px), (pointer: coarse) {
  .racing-game {
    min-height: calc(100dvh - 68px);
  }

  .racing-stage {
    min-height: max(32rem, calc(100dvh - 68px));
  }

  .touch-wasd {
    display: grid;
  }

  .race-hud {
    right: max(.75rem, env(safe-area-inset-right));
    left: max(.75rem, env(safe-area-inset-left));
  }

  .race-hud > div {
    min-width: 0;
    flex: 1;
    padding: .65rem .6rem;
  }

  .race-hud dd {
    font-size: clamp(.76rem, 3.4vw, 1rem);
  }

  .race-hud small {
    display: block;
    margin: .2rem 0 0;
  }

  .race-actions {
    top: auto;
    right: max(.75rem, env(safe-area-inset-right));
    bottom: max(1rem, env(safe-area-inset-bottom));
    flex-direction: column;
  }

  .race-actions button {
    min-width: 7.25rem;
  }

  .race-actions button + button {
    border-top: 0;
    border-left: 1px solid var(--game-border-strong);
  }

  .race-panel {
    padding: 1.5rem;
  }

  .level-select {
    width: calc(100% - 1rem);
  }
}

@media (max-width: 620px) {
  .level-grid {
    grid-template-columns: 1fr;
  }

  .level-grid li:nth-child(even) .level-card {
    border-left: 1px solid var(--game-border-strong);
  }

  .level-grid li + li .level-card {
    border-top: 0;
  }

  .level-card {
    min-height: 10.5rem;
  }

  .race-panel__buttons,
  .race-panel__buttons--result {
    flex-direction: column;
    margin-right: 0;
    margin-left: 0;
  }

  .race-panel__buttons button {
    width: 100%;
    margin: .3rem 0;
  }
}

@media (max-width: 420px) {
  .race-hud dt {
    font-size: .5rem;
  }

  .race-hud > div {
    padding-right: .45rem;
    padding-left: .45rem;
  }

  .race-panel h3 {
    font-size: 2.35rem;
  }

  .race-panel .race-panel__copy {
    font-size: .78rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .race-actions button,
  .race-panel button,
  .touch-wasd button,
  .level-card {
    transition: none;
  }

  .level-card:hover:not(:disabled) {
    transform: none;
  }
}
</style>

<style>
html[data-theme='dark'] [data-top-down-racing-theme-root] {
  --racing-hud: rgb(10 15 22 / 88%);
  --racing-hud-strong: rgb(14 20 29 / 96%);
  --racing-scrim: rgb(3 6 10 / 58%);
  --racing-on-level-accent: #07100d;
}

html[data-theme='light'] [data-top-down-racing-theme-root] {
  --racing-hud: rgb(250 249 246 / 92%);
  --racing-hud-strong: rgb(255 255 255 / 98%);
  --racing-scrim: rgb(20 24 30 / 48%);
  --racing-on-level-accent: #fff;
}

html[data-theme='dark'] [data-top-down-racing-theme-root][data-level-theme='grass'] {
  --racing-sky: #101923;
  --racing-fog: #15231e;
  --racing-ambient: #a7c6b5;
  --racing-key-light: #ffe1aa;
  --racing-level-accent: #67d69a;
}

html[data-theme='light'] [data-top-down-racing-theme-root][data-level-theme='grass'] {
  --racing-sky: #dbe8ed;
  --racing-fog: #dcebe5;
  --racing-ambient: #f8fbfc;
  --racing-key-light: #fff4dc;
  --racing-level-accent: #18794e;
}

html[data-theme='dark'] [data-top-down-racing-theme-root][data-level-theme='desert'] {
  --racing-sky: #261b18;
  --racing-fog: #34241d;
  --racing-ambient: #e0b98a;
  --racing-key-light: #ffd2a0;
  --racing-level-accent: #f0aa61;
}

html[data-theme='light'] [data-top-down-racing-theme-root][data-level-theme='desert'] {
  --racing-sky: #eadbc3;
  --racing-fog: #e2c9a5;
  --racing-ambient: #fff7e9;
  --racing-key-light: #fff0cf;
  --racing-level-accent: #a95116;
}

html[data-theme='dark'] [data-top-down-racing-theme-root][data-level-theme='sky'] {
  --racing-sky: #101b2b;
  --racing-fog: #172d42;
  --racing-ambient: #a9d7ec;
  --racing-key-light: #dff5ff;
  --racing-level-accent: #71cff5;
}

html[data-theme='light'] [data-top-down-racing-theme-root][data-level-theme='sky'] {
  --racing-sky: #cfe7f2;
  --racing-fog: #bfdce9;
  --racing-ambient: #f6fdff;
  --racing-key-light: #fffde9;
  --racing-level-accent: #176d94;
}

html[data-theme='dark'] [data-top-down-racing-theme-root][data-level-theme='mountain'] {
  --racing-sky: #211b24;
  --racing-fog: #30242a;
  --racing-ambient: #c0a5a0;
  --racing-key-light: #ffbf8d;
  --racing-level-accent: #f28b70;
}

html[data-theme='light'] [data-top-down-racing-theme-root][data-level-theme='mountain'] {
  --racing-sky: #dfc7ba;
  --racing-fog: #c9b3a7;
  --racing-ambient: #f8ece5;
  --racing-key-light: #ffe0bd;
  --racing-level-accent: #a43f2c;
}
</style>
