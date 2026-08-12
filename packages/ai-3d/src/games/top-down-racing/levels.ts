export type RacingLevelId = 'stadium' | 'desert-loop' | 'sky-coaster' | 'mountain-pass';
export type RacingThemeId = 'grass' | 'desert' | 'sky' | 'mountain';
export type RacingAssetKey =
  | 'race'
  | 'barrierRed'
  | 'barrierWhite'
  | 'barrierWall'
  | 'flagCheckers'
  | 'grandStand'
  | 'treeLarge'
  | 'treeSmall';

export type Vector3Tuple = readonly [x: number, y: number, z: number];

export interface RacingRouteDefinition {
  id: string;
  points: readonly Vector3Tuple[];
  closed: boolean;
  width: number;
  sampleCount: number;
  surfaceOffsetY?: number;
  barriers?: 'both' | 'left' | 'right' | 'none';
  barrierGaps?: readonly {
    side: 'left' | 'right' | 'both';
    start: number;
    end: number;
  }[];
  curbGaps?: readonly {
    side: 'left' | 'right' | 'both';
    start: number;
    end: number;
  }[];
  jumpGaps?: readonly {
    start: number;
    end: number;
  }[];
  bankRanges?: readonly {
    start: number;
    end: number;
    angle: number;
  }[];
}

export interface RacingCheckpointOption {
  routeId: string;
  progress: number;
}

export interface RacingCheckpointGroup {
  options: readonly RacingCheckpointOption[];
}

export interface RacingDecorationDefinition {
  asset: RacingAssetKey;
  position: Vector3Tuple;
  rotationY: number;
  scale?: number;
}

export interface RacingLevelDefinition {
  id: RacingLevelId;
  index: number;
  code: string;
  name: string;
  description: string;
  raceMode: 'circuit' | 'sprint';
  laps: number;
  theme: RacingThemeId;
  ground: 'grass' | 'sand' | 'void';
  groundColor: string;
  roadColor: string;
  // 关卡可单独定义驶离赛道后的速度惩罚，未配置时沿用通用上限。
  offRoadSpeedLimit?: number;
  start: RacingCheckpointOption;
  finish: RacingCheckpointOption;
  checkpoints: readonly RacingCheckpointGroup[];
  routes: readonly RacingRouteDefinition[];
  decorations: readonly RacingDecorationDefinition[];
  requiredAssets: readonly RacingAssetKey[];
  worldBounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  };
  killY: number;
}

const stadiumRoute: RacingRouteDefinition = {
  id: 'main',
  closed: true,
  width: 10.5,
  sampleCount: 220,
  barriers: 'both',
  points: [
    [0, 0, 30],
    [-30, 0, 30],
    [-40, 0, 20],
    [-40, 0, -20],
    [-30, 0, -30],
    [30, 0, -30],
    [40, 0, -20],
    [40, 0, 20],
    [30, 0, 30],
  ],
};

const desertMainRoute: RacingRouteDefinition = {
  id: 'main',
  closed: true,
  width: 10,
  sampleCount: 260,
  barriers: 'both',
  barrierGaps: [
    { side: 'right', start: 0.68, end: 0.73 },
    { side: 'right', start: 0.825, end: 0.87 },
  ],
  curbGaps: [
    { side: 'right', start: 0.68, end: 0.73 },
    { side: 'right', start: 0.825, end: 0.87 },
  ],
  points: [
    [0, 0, 34],
    [-34, 0, 34],
    [-47, 0, 23],
    [-48, 0, -8],
    [-39, 0, -25],
    [-18, 0, -32],
    [20, 0, -32],
    [41, 0, -25],
    [49, 0, -8],
    [48, 0, 12],
    [39, 0, 29],
    [25, 0, 36],
  ],
};

const desertShortcutRoute: RacingRouteDefinition = {
  id: 'shortcut',
  closed: false,
  width: 6.2,
  sampleCount: 72,
  surfaceOffsetY: 0.035,
  barriers: 'both',
  barrierGaps: [
    { side: 'both', start: 0, end: 0.12 },
    { side: 'both', start: 0.88, end: 1 },
  ],
  curbGaps: [
    { side: 'both', start: 0, end: 0.12 },
    { side: 'both', start: 0.88, end: 1 },
  ],
  points: [
    [47, 0, -10],
    [31, 0, -6],
    [24, 0, 5],
    [34, 0, 14],
    [41, 0, 27],
  ],
};

const coasterRoute: RacingRouteDefinition = {
  id: 'main',
  closed: true,
  width: 8.4,
  sampleCount: 300,
  barriers: 'both',
  barrierGaps: [
    { side: 'both', start: 0.285, end: 0.37 },
  ],
  bankRanges: [
    { start: 0.08, end: 0.2, angle: -0.16 },
    { start: 0.5, end: 0.67, angle: 0.2 },
    { start: 0.75, end: 0.9, angle: -0.14 },
  ],
  points: [
    [0, 3, 36],
    [-29, 4, 34],
    [-45, 9, 20],
    [-43, 16, -4],
    [-27, 23, -24],
    [-4, 25, -35],
    [23, 17, -33],
    [43, 10, -18],
    [48, 8, 5],
    [36, 13, 27],
    [16, 20, 37],
  ],
};

const mountainRoute: RacingRouteDefinition = {
  id: 'main',
  closed: false,
  width: 8.2,
  sampleCount: 360,
  barriers: 'both',
  bankRanges: [
    { start: 0.1, end: 0.2, angle: 0.08 },
    { start: 0.38, end: 0.5, angle: -0.1 },
    { start: 0.68, end: 0.8, angle: 0.09 },
  ],
  points: [
    [0, 32, 50],
    [31, 30, 43],
    [43, 27, 28],
    [36, 24, 13],
    [-33, 22, 8],
    [-45, 19, -5],
    [-34, 17, -20],
    [33, 15, -24],
    [45, 12, -38],
    [34, 10, -52],
    [-31, 8, -56],
    [-44, 5, -70],
    [-31, 3, -84],
    [24, 1, -88],
    [39, -1, -101],
    [21, -3, -113],
    [-24, -5, -117],
    [-5, -7, -131],
    [18, -9, -139],
  ],
};

export const racingLevels: readonly RacingLevelDefinition[] = [
  {
    id: 'stadium',
    index: 1,
    code: 'GRASS STADIUM',
    name: '草地体育场',
    description: '宽阔的一圈入门赛，适合熟悉动力漂移。',
    raceMode: 'circuit',
    laps: 1,
    theme: 'grass',
    ground: 'grass',
    groundColor: '#4f8a67',
    roadColor: '#403e39',
    start: { routeId: 'main', progress: 0.025 },
    finish: { routeId: 'main', progress: 0 },
    checkpoints: [
      { options: [{ routeId: 'main', progress: 0.16 }] },
      { options: [{ routeId: 'main', progress: 0.34 }] },
      { options: [{ routeId: 'main', progress: 0.52 }] },
      { options: [{ routeId: 'main', progress: 0.7 }] },
      { options: [{ routeId: 'main', progress: 0.87 }] },
    ],
    routes: [stadiumRoute],
    decorations: [
      { asset: 'flagCheckers', position: [3.5, 0, 37], rotationY: 0, scale: 0.55 },
      { asset: 'grandStand', position: [18, 0, 51], rotationY: Math.PI, scale: 0.9 },
    ],
    requiredAssets: ['flagCheckers', 'grandStand'],
    worldBounds: { minX: -62, maxX: 62, minZ: -52, maxZ: 52 },
    killY: -8,
  },
  {
    id: 'desert-loop',
    index: 2,
    code: 'DESERT HAIRPIN',
    name: '沙漠回环',
    description: '两圈发卡弯挑战，窄近道更快也更难控制。',
    raceMode: 'circuit',
    laps: 2,
    theme: 'desert',
    ground: 'sand',
    groundColor: '#c59a5c',
    roadColor: '#45413b',
    start: { routeId: 'main', progress: 0.025 },
    finish: { routeId: 'main', progress: 0 },
    checkpoints: [
      { options: [{ routeId: 'main', progress: 0.16 }] },
      { options: [{ routeId: 'main', progress: 0.36 }] },
      { options: [{ routeId: 'main', progress: 0.57 }] },
      {
        options: [
          { routeId: 'main', progress: 0.76 },
          { routeId: 'shortcut', progress: 0.5 },
        ],
      },
      { options: [{ routeId: 'main', progress: 0.91 }] },
    ],
    routes: [desertMainRoute, desertShortcutRoute],
    decorations: [
      { asset: 'flagCheckers', position: [4, 0, 41], rotationY: 0, scale: 0.55 },
      { asset: 'barrierWall', position: [14, 0, 5], rotationY: Math.PI / 2, scale: 0.9 },
      { asset: 'barrierWall', position: [18, 0, 5], rotationY: Math.PI / 2, scale: 0.9 },
    ],
    requiredAssets: ['flagCheckers', 'barrierWall'],
    worldBounds: { minX: -68, maxX: 68, minZ: -54, maxZ: 56 },
    killY: -8,
  },
  {
    id: 'sky-coaster',
    index: 3,
    code: 'HIGHLAND CIRCUIT',
    name: '高地巡回',
    description: '三圈连续高低差赛道，跌落草地将受到明显减速惩罚。',
    raceMode: 'circuit',
    laps: 3,
    theme: 'sky',
    ground: 'grass',
    groundColor: '#4b8056',
    roadColor: '#3d4247',
    offRoadSpeedLimit: 8,
    start: { routeId: 'main', progress: 0.025 },
    finish: { routeId: 'main', progress: 0 },
    checkpoints: [
      { options: [{ routeId: 'main', progress: 0.15 }] },
      { options: [{ routeId: 'main', progress: 0.29 }] },
      { options: [{ routeId: 'main', progress: 0.43 }] },
      { options: [{ routeId: 'main', progress: 0.58 }] },
      { options: [{ routeId: 'main', progress: 0.74 }] },
      { options: [{ routeId: 'main', progress: 0.9 }] },
    ],
    routes: [coasterRoute],
    decorations: [
      { asset: 'flagCheckers', position: [3.5, 3, 43], rotationY: 0, scale: 0.55 },
    ],
    requiredAssets: ['flagCheckers'],
    worldBounds: { minX: -66, maxX: 68, minZ: -54, maxZ: 58 },
    killY: -12,
  },
  {
    id: 'mountain-pass',
    index: 4,
    code: 'DUSK TOUGE',
    name: '黄昏山林',
    description: '一次下山赛段，连续八个发卡弯考验节奏。',
    raceMode: 'sprint',
    laps: 1,
    theme: 'mountain',
    ground: 'void',
    groundColor: '#48513f',
    roadColor: '#393a38',
    start: { routeId: 'main', progress: 0.015 },
    finish: { routeId: 'main', progress: 0.985 },
    checkpoints: [
      { options: [{ routeId: 'main', progress: 0.12 }] },
      { options: [{ routeId: 'main', progress: 0.24 }] },
      { options: [{ routeId: 'main', progress: 0.36 }] },
      { options: [{ routeId: 'main', progress: 0.48 }] },
      { options: [{ routeId: 'main', progress: 0.6 }] },
      { options: [{ routeId: 'main', progress: 0.72 }] },
      { options: [{ routeId: 'main', progress: 0.84 }] },
      { options: [{ routeId: 'main', progress: 0.94 }] },
    ],
    routes: [mountainRoute],
    decorations: [
      { asset: 'flagCheckers', position: [18, -9, -145], rotationY: Math.PI / 2, scale: 0.55 },
      { asset: 'barrierWall', position: [1, 31, 57], rotationY: Math.PI / 2, scale: 0.9 },
      { asset: 'treeLarge', position: [-14, 27, 31], rotationY: 0.4, scale: 1.2 },
      { asset: 'treeSmall', position: [21, 25, 15], rotationY: -0.6, scale: 1.1 },
      { asset: 'treeLarge', position: [-21, 17, -28], rotationY: 1.2, scale: 1.15 },
      { asset: 'treeSmall', position: [24, 9, -61], rotationY: 0.2 },
      { asset: 'treeLarge', position: [-19, 1, -92], rotationY: -0.9, scale: 1.25 },
      { asset: 'treeSmall', position: [25, -6, -124], rotationY: 0.7, scale: 1.05 },
    ],
    requiredAssets: ['flagCheckers', 'barrierWall', 'treeLarge', 'treeSmall'],
    worldBounds: { minX: -66, maxX: 66, minZ: -154, maxZ: 68 },
    killY: -24,
  },
] as const;

export const racingLevelById = Object.fromEntries(
  racingLevels.map((level) => [level.id, level]),
) as Record<RacingLevelId, RacingLevelDefinition>;
