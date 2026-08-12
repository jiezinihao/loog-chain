import * as THREE from 'three';

import type {
  RacingCheckpointOption,
  RacingLevelDefinition,
  RacingRouteDefinition,
} from './levels';

export interface TrackPose {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  side: THREE.Vector3;
  up: THREE.Vector3;
  rotation: THREE.Quaternion;
  width: number;
}

export interface TrackGate extends TrackPose {
  left: THREE.Vector3;
  right: THREE.Vector3;
}

export interface BarrierPlacement {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  rotationY: number;
  color: 'red' | 'white';
}

export interface BarrierColliderSegment {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  halfExtents: THREE.Vector3;
}

export interface RouteRuntime {
  definition: RacingRouteDefinition;
  curve: THREE.CatmullRomCurve3;
  samples: readonly TrackPose[];
  roadGeometry: THREE.BufferGeometry;
  curbGeometry: THREE.BufferGeometry;
  colliderVertices: Float32Array;
  colliderIndices: Uint32Array;
  barrierPlacements: readonly BarrierPlacement[];
  barrierColliders: readonly BarrierColliderSegment[];
}

export interface LevelTrackRuntime {
  group: THREE.Group;
  routes: ReadonlyMap<string, RouteRuntime>;
  checkpointGroups: readonly (readonly TrackGate[])[];
  finishGate: TrackGate;
  startPose: TrackPose;
}

interface TrackMaterials {
  road: THREE.Material;
  curbRed: THREE.Material;
  curbWhite: THREE.Material;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const CURB_WIDTH = 0.52;
const BARRIER_OFFSET = 0.78;
const BARRIER_SPACING = 2.95;
const BARRIER_COLLIDER_STEP = 4;

function isInsideRange(progress: number, start: number, end: number) {
  return progress >= start && progress <= end;
}

function isRouteGap(route: RacingRouteDefinition, progress: number) {
  return route.jumpGaps?.some((gap) => isInsideRange(progress, gap.start, gap.end)) ?? false;
}

function isBarrierGap(route: RacingRouteDefinition, side: 'left' | 'right', progress: number) {
  return route.barrierGaps?.some((gap) => (
    (gap.side === side || gap.side === 'both') && isInsideRange(progress, gap.start, gap.end)
  )) ?? false;
}

function isCurbGap(route: RacingRouteDefinition, side: 'left' | 'right', progress: number) {
  return route.curbGaps?.some((gap) => (
    (gap.side === side || gap.side === 'both') && isInsideRange(progress, gap.start, gap.end)
  )) ?? false;
}

function getBankAngle(route: RacingRouteDefinition, progress: number) {
  const range = route.bankRanges?.find((item) => isInsideRange(progress, item.start, item.end));
  if (!range) return 0;
  const local = (progress - range.start) / Math.max(0.0001, range.end - range.start);
  const envelope = Math.sin(Math.PI * local);
  return range.angle * envelope;
}

function createTrackPose(curve: THREE.CatmullRomCurve3, route: RacingRouteDefinition, progress: number) {
  const normalizedProgress = route.closed
    ? ((progress % 1) + 1) % 1
    : THREE.MathUtils.clamp(progress, 0, 1);
  const position = curve.getPointAt(normalizedProgress);
  position.y += route.surfaceOffsetY ?? 0;
  const tangent = curve.getTangentAt(normalizedProgress).normalize();
  const side = new THREE.Vector3().crossVectors(WORLD_UP, tangent).normalize();
  if (side.lengthSq() < 0.01) side.set(1, 0, 0);
  side.applyAxisAngle(tangent, getBankAngle(route, normalizedProgress)).normalize();
  const up = new THREE.Vector3().crossVectors(tangent, side).normalize();
  const rotation = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(side, up, tangent),
  );
  return { position, tangent, side, up, rotation, width: route.width } satisfies TrackPose;
}

function createRouteSamples(curve: THREE.CatmullRomCurve3, route: RacingRouteDefinition) {
  const count = route.closed ? route.sampleCount : route.sampleCount + 1;
  return Array.from({ length: count }, (_, index) => (
    createTrackPose(curve, route, index / route.sampleCount)
  ));
}

function getSegmentProgress(route: RacingRouteDefinition, index: number) {
  return (index + 0.5) / route.sampleCount;
}

function createRoadGeometry(route: RacingRouteDefinition, samples: readonly TrackPose[]) {
  const positions: number[] = [];
  samples.forEach((sample) => {
    const halfWidth = sample.width / 2;
    const left = sample.position.clone().addScaledVector(sample.side, halfWidth);
    const right = sample.position.clone().addScaledVector(sample.side, -halfWidth);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
  });

  const indices: number[] = [];
  const segmentCount = route.closed ? samples.length : samples.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    if (isRouteGap(route, getSegmentProgress(route, index))) continue;
    const next = (index + 1) % samples.length;
    const left = index * 2;
    const right = left + 1;
    const nextLeft = next * 2;
    const nextRight = nextLeft + 1;
    indices.push(left, right, nextLeft, right, nextRight, nextLeft);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return {
    geometry,
    vertices: new Float32Array(positions),
    indices: new Uint32Array(indices),
  };
}

function createCurbGeometry(route: RacingRouteDefinition, samples: readonly TrackPose[]) {
  const positions: number[] = [];
  const indices: number[] = [];
  const materialGroups: number[] = [];
  const segmentCount = route.closed ? samples.length : samples.length - 1;
  let traveledDistance = 0;

  const appendStrip = (
    current: TrackPose,
    next: TrackPose,
    direction: 1 | -1,
    materialIndex: number,
  ) => {
    const currentEdge = current.position.clone().addScaledVector(current.side, direction * current.width / 2);
    const currentOuter = currentEdge.clone().addScaledVector(current.side, direction * CURB_WIDTH);
    const nextEdge = next.position.clone().addScaledVector(next.side, direction * next.width / 2);
    const nextOuter = nextEdge.clone().addScaledVector(next.side, direction * CURB_WIDTH);
    const offset = positions.length / 3;
    positions.push(
      currentEdge.x, currentEdge.y + 0.012, currentEdge.z,
      currentOuter.x, currentOuter.y + 0.012, currentOuter.z,
      nextEdge.x, nextEdge.y + 0.012, nextEdge.z,
      nextOuter.x, nextOuter.y + 0.012, nextOuter.z,
    );
    indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
    materialGroups.push(materialIndex);
  };

  for (let index = 0; index < segmentCount; index += 1) {
    const progress = getSegmentProgress(route, index);
    const nextIndex = (index + 1) % samples.length;
    const current = samples[index];
    const next = samples[nextIndex];
    if (!current || !next || isRouteGap(route, progress)) continue;
    const segmentLength = current.position.distanceTo(next.position);
    const materialIndex = Math.floor(traveledDistance / 3.2) % 2;
    if (!isCurbGap(route, 'left', progress)) appendStrip(current, next, 1, materialIndex);
    if (!isCurbGap(route, 'right', progress)) appendStrip(current, next, -1, materialIndex);
    traveledDistance += segmentLength;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  materialGroups.forEach((materialIndex, index) => geometry.addGroup(index * 6, 6, materialIndex));
  return geometry;
}

function routeUsesBarrierSide(route: RacingRouteDefinition, side: 'left' | 'right') {
  const barriers = route.barriers ?? 'both';
  return barriers === 'both' || barriers === side;
}

function createBarrierData(route: RacingRouteDefinition, samples: readonly TrackPose[]) {
  const placements: BarrierPlacement[] = [];
  const colliders: BarrierColliderSegment[] = [];
  const segmentCount = route.closed ? samples.length : samples.length - 1;
  let distanceSincePlacement = 0;
  const colorIndices = { left: 0, right: 0 };

  for (let index = 0; index < segmentCount; index += 1) {
    const nextIndex = (index + 1) % samples.length;
    const current = samples[index];
    const next = samples[nextIndex];
    if (!current || !next) continue;
    const progress = getSegmentProgress(route, index);
    const length = current.position.distanceTo(next.position);
    distanceSincePlacement += length;
    const isGap = isRouteGap(route, progress);

    (['left', 'right'] as const).forEach((sideName) => {
      if (!routeUsesBarrierSide(route, sideName) || isGap || isBarrierGap(route, sideName, progress)) return;
      const direction = sideName === 'left' ? 1 : -1;
      if (index % BARRIER_COLLIDER_STEP === 0) {
        const endIndex = Math.min(index + BARRIER_COLLIDER_STEP, segmentCount);
        const colliderEnd = samples[route.closed ? endIndex % samples.length : endIndex];
        if (colliderEnd) {
          const startEdge = current.position.clone().addScaledVector(
            current.side,
            direction * (current.width / 2 + CURB_WIDTH + BARRIER_OFFSET),
          );
          const endEdge = colliderEnd.position.clone().addScaledVector(
            colliderEnd.side,
            direction * (colliderEnd.width / 2 + CURB_WIDTH + BARRIER_OFFSET),
          );
          const tangent = endEdge.clone().sub(startEdge).normalize();
          const up = current.up.clone();
          const localZ = new THREE.Vector3().crossVectors(tangent, up).normalize();
          const rotation = new THREE.Quaternion().setFromRotationMatrix(
            new THREE.Matrix4().makeBasis(tangent, up, localZ),
          );
          colliders.push({
            position: startEdge.clone().add(endEdge).multiplyScalar(0.5).addScaledVector(up, 0.65),
            rotation,
            halfExtents: new THREE.Vector3(startEdge.distanceTo(endEdge) / 2 + 0.16, 0.72, 0.24),
          });
        }
      }

      if (distanceSincePlacement < BARRIER_SPACING) return;
      const position = current.position.clone()
        .addScaledVector(current.side, direction * (current.width / 2 + CURB_WIDTH + BARRIER_OFFSET))
        .addScaledVector(current.up, 0.08);
      const localZ = new THREE.Vector3().crossVectors(current.tangent, current.up).normalize();
      const rotation = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(current.tangent, current.up, localZ),
      );
      placements.push({
        position,
        rotation,
        rotationY: -Math.atan2(current.tangent.z, current.tangent.x),
        color: colorIndices[sideName] % 2 === 0 ? 'red' : 'white',
      });
      colorIndices[sideName] += 1;
    });

    if (distanceSincePlacement >= BARRIER_SPACING) distanceSincePlacement = 0;
  }

  return { placements, colliders };
}

function createRouteRuntime(route: RacingRouteDefinition, materials: TrackMaterials) {
  const points = route.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(points, route.closed, 'centripetal', 0.45);
  const samples = createRouteSamples(curve, route);
  const road = createRoadGeometry(route, samples);
  const curbGeometry = createCurbGeometry(route, samples);
  const roadMesh = new THREE.Mesh(road.geometry, materials.road);
  const curbMesh = new THREE.Mesh(curbGeometry, [materials.curbRed, materials.curbWhite]);
  roadMesh.receiveShadow = true;
  curbMesh.receiveShadow = true;
  const barriers = createBarrierData(route, samples);
  return {
    definition: route,
    curve,
    samples,
    roadGeometry: road.geometry,
    curbGeometry,
    colliderVertices: road.vertices,
    colliderIndices: road.indices,
    barrierPlacements: barriers.placements,
    barrierColliders: barriers.colliders,
    roadMesh,
    curbMesh,
  };
}

export function getRoutePose(runtime: RouteRuntime, progress: number) {
  return createTrackPose(runtime.curve, runtime.definition, progress);
}

export function createTrackGate(runtime: RouteRuntime, option: RacingCheckpointOption) {
  const pose = getRoutePose(runtime, option.progress);
  return {
    ...pose,
    left: pose.position.clone().addScaledVector(pose.side, pose.width / 2 + 0.3),
    right: pose.position.clone().addScaledVector(pose.side, -pose.width / 2 - 0.3),
  } satisfies TrackGate;
}

export function createLevelTrack(level: RacingLevelDefinition, materials: TrackMaterials) {
  const group = new THREE.Group();
  group.name = `track-${level.id}`;
  const routeMap = new Map<string, RouteRuntime>();
  level.routes.forEach((route) => {
    const runtime = createRouteRuntime(route, materials);
    routeMap.set(route.id, runtime);
    group.add(runtime.roadMesh, runtime.curbMesh);
  });

  const resolveGate = (option: RacingCheckpointOption) => {
    const route = routeMap.get(option.routeId);
    if (!route) throw new Error(`关卡 ${level.id} 缺少路线：${option.routeId}`);
    return createTrackGate(route, option);
  };

  return {
    group,
    routes: routeMap,
    checkpointGroups: level.checkpoints.map((checkpoint) => checkpoint.options.map(resolveGate)),
    finishGate: resolveGate(level.finish),
    startPose: getRoutePose(routeMap.get(level.start.routeId)!, level.start.progress),
  } satisfies LevelTrackRuntime;
}

export function disposeLevelTrack(runtime?: LevelTrackRuntime) {
  if (!runtime) return;
  runtime.routes.forEach((route) => {
    route.roadGeometry.dispose();
    route.curbGeometry.dispose();
  });
  runtime.group.clear();
}
