<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

interface Point {
  x: number;
  y: number;
}

type Direction = 'up' | 'down' | 'left' | 'right';

const gridSize = 20;
const cellSize = 24;
const canvasSize = gridSize * cellSize;
const directionVectors: Record<Direction, Point> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const oppositeDirections: Record<Direction, Direction> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const gameElement = ref<HTMLElement>();
const canvasElement = ref<HTMLCanvasElement>();
const score = ref(0);
const bestScore = ref(0);
const isRunning = ref(false);
const stateMessage = ref('按开始游戏，使用方向键或 W A S D 控制。');

let context: CanvasRenderingContext2D | null = null;
let snake: Point[] = [];
let food: Point = { x: 14, y: 10 };
let direction: Direction = 'right';
let queuedDirection: Direction = 'right';
let loopHandle = 0;
let themeObserver: MutationObserver | undefined;

function pointEquals(first: Point, second: Point) {
  return first.x === second.x && first.y === second.y;
}

function readColor(variable: string, fallback: string) {
  const game = gameElement.value;
  return game ? getComputedStyle(game).getPropertyValue(variable).trim() || fallback : fallback;
}

function drawGame() {
  if (!context) return;
  const background = readColor('--game-canvas', '#0c1018');
  const grid = readColor('--game-canvas-grid', 'rgb(255 255 255 / 7%)');
  const snakeColor = readColor('--game-accent-secondary', '#68e5d1');
  const snakeHead = readColor('--game-foreground', '#f4f5f8');
  const foodColor = readColor('--game-accent', '#9f91ff');

  context.fillStyle = background;
  context.fillRect(0, 0, canvasSize, canvasSize);
  context.strokeStyle = grid;
  context.lineWidth = 1;
  for (let index = 0; index <= gridSize; index += 1) {
    const position = index * cellSize + .5;
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, canvasSize);
    context.stroke();
    context.beginPath();
    context.moveTo(0, position);
    context.lineTo(canvasSize, position);
    context.stroke();
  }

  snake.forEach((segment, index) => {
    context!.fillStyle = index === 0 ? snakeHead : snakeColor;
    const inset = index === 0 ? 3 : 4;
    context!.fillRect(
      segment.x * cellSize + inset,
      segment.y * cellSize + inset,
      cellSize - inset * 2,
      cellSize - inset * 2,
    );
  });

  context.fillStyle = foodColor;
  context.beginPath();
  context.arc(
    food.x * cellSize + cellSize / 2,
    food.y * cellSize + cellSize / 2,
    cellSize * .32,
    0,
    Math.PI * 2,
  );
  context.fill();
}

function createFood() {
  const available: Point[] = [];
  for (let x = 0; x < gridSize; x += 1) {
    for (let y = 0; y < gridSize; y += 1) {
      if (!snake.some((segment) => segment.x === x && segment.y === y)) available.push({ x, y });
    }
  }
  food = available[Math.floor(Math.random() * available.length)] ?? { x: 0, y: 0 };
}

function stopGame(message?: string) {
  window.clearInterval(loopHandle);
  loopHandle = 0;
  isRunning.value = false;
  if (message) stateMessage.value = message;
}

function stepGame() {
  direction = queuedDirection;
  const vector = directionVectors[direction];
  const head = snake[0];
  const nextHead = { x: head.x + vector.x, y: head.y + vector.y };
  const hitWall = nextHead.x < 0 || nextHead.x >= gridSize || nextHead.y < 0 || nextHead.y >= gridSize;
  const hitSelf = snake.some((segment) => pointEquals(segment, nextHead));
  if (hitWall || hitSelf) {
    bestScore.value = Math.max(bestScore.value, score.value);
    stopGame(`游戏结束，本局得分 ${score.value}。按重新开始再来一局。`);
    return;
  }

  snake.unshift(nextHead);
  if (pointEquals(nextHead, food)) {
    score.value += 10;
    bestScore.value = Math.max(bestScore.value, score.value);
    createFood();
  } else {
    snake.pop();
  }
  drawGame();
}

function resetGame(startImmediately = false) {
  stopGame();
  snake = [
    { x: 8, y: 10 },
    { x: 7, y: 10 },
    { x: 6, y: 10 },
  ];
  direction = 'right';
  queuedDirection = 'right';
  score.value = 0;
  createFood();
  stateMessage.value = '准备就绪，避开墙壁和自己的身体。';
  drawGame();
  if (startImmediately) startGame();
}

function startGame() {
  if (isRunning.value) {
    stopGame('游戏已暂停，按继续游戏恢复。');
    return;
  }
  isRunning.value = true;
  stateMessage.value = '游戏进行中。';
  loopHandle = window.setInterval(stepGame, 125);
  gameElement.value?.focus();
}

function changeDirection(nextDirection: Direction) {
  if (oppositeDirections[direction] === nextDirection) return;
  queuedDirection = nextDirection;
  if (!isRunning.value) gameElement.value?.focus();
}

function handleKeydown(event: KeyboardEvent) {
  const keyDirections: Record<string, Direction> = {
    ArrowUp: 'up',
    w: 'up',
    W: 'up',
    ArrowDown: 'down',
    s: 'down',
    S: 'down',
    ArrowLeft: 'left',
    a: 'left',
    A: 'left',
    ArrowRight: 'right',
    d: 'right',
    D: 'right',
  };
  const nextDirection = keyDirections[event.key];
  if (nextDirection) {
    event.preventDefault();
    changeDirection(nextDirection);
  } else if (event.code === 'Space') {
    event.preventDefault();
    startGame();
  } else if (event.key === 'r' || event.key === 'R') {
    resetGame(true);
  }
}

onMounted(async () => {
  await nextTick();
  context = canvasElement.value?.getContext('2d') ?? null;
  // Canvas 不会自动响应 CSS 变量变化，主题切换后主动重绘当前棋盘。
  themeObserver = new MutationObserver(drawGame);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  resetGame();
  gameElement.value?.focus();
});

onBeforeUnmount(() => {
  stopGame();
  themeObserver?.disconnect();
});
</script>

<template>
  <section
    ref="gameElement"
    class="snake-game"
    tabindex="0"
    aria-labelledby="snake-title"
    @keydown="handleKeydown"
  >
    <header class="game-heading">
      <div>
        <p>TWO-DIMENSIONAL ARCADE</p>
        <h2 id="snake-title">贪吃蛇</h2>
      </div>
      <dl class="game-stats">
        <div>
          <dt>SCORE</dt>
          <dd>{{ String(score).padStart(4, '0') }}</dd>
        </div>
        <div>
          <dt>BEST</dt>
          <dd>{{ String(bestScore).padStart(4, '0') }}</dd>
        </div>
      </dl>
    </header>

    <div class="snake-layout">
      <div class="canvas-frame">
        <canvas
          ref="canvasElement"
          :width="canvasSize"
          :height="canvasSize"
          aria-label="二十乘二十网格的贪吃蛇游戏区域"
        ></canvas>
      </div>

      <aside class="game-console">
        <div class="instruction-card">
          <span>HOW TO PLAY / 操作</span>
          <strong>方向键或 W A S D 移动</strong>
          <p>吃到目标得 10 分。撞到边界或自身时本局结束，空格键可开始或暂停。</p>
        </div>

        <p class="state-message" aria-live="polite">{{ stateMessage }}</p>

        <div class="direction-pad" aria-label="移动方向控制">
          <button type="button" aria-label="向上移动" @click="changeDirection('up')">上</button>
          <button type="button" aria-label="向左移动" @click="changeDirection('left')">左</button>
          <button type="button" aria-label="向下移动" @click="changeDirection('down')">下</button>
          <button type="button" aria-label="向右移动" @click="changeDirection('right')">右</button>
        </div>

        <div class="game-actions">
          <button type="button" @click="startGame">{{ isRunning ? '暂停游戏' : '开始 / 继续' }}</button>
          <button type="button" @click="resetGame(true)">重新开始</button>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.snake-game {
  min-height: 100%;
  padding: clamp(1.25rem, 3vw, 3rem);
  color: var(--game-foreground);
  outline: none;
}

.snake-game:focus-visible {
  outline: 2px solid var(--game-focus);
  outline-offset: -4px;
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
.instruction-card span {
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
  min-width: 7rem;
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

.snake-layout {
  display: grid;
  min-height: min(68dvh, 720px);
  grid-template-columns: minmax(320px, 1fr) minmax(19rem, .55fr);
  border-bottom: 1px solid var(--game-border);
}

.canvas-frame {
  display: grid;
  min-height: 430px;
  place-items: center;
  padding: clamp(1rem, 3vw, 2.5rem);
  border-right: 1px solid var(--game-border);
  background: radial-gradient(circle at 50% 50%, var(--game-stage-glow), transparent 62%);
}

.canvas-frame canvas {
  display: block;
  width: min(100%, 560px);
  height: auto;
  aspect-ratio: 1;
  border: 1px solid var(--game-border-strong);
  box-shadow: 0 22px 70px var(--game-shadow);
}

.game-console {
  display: flex;
  flex-direction: column;
  padding: clamp(1.25rem, 3vw, 2.5rem);
}

.instruction-card {
  padding: 1rem;
  border: 1px solid var(--game-border);
  background: var(--game-surface);
}

.instruction-card span,
.instruction-card strong {
  display: block;
}

.instruction-card strong {
  margin-top: .7rem;
  font-size: 1rem;
}

.instruction-card p,
.state-message {
  color: var(--game-muted);
  font-size: .78rem;
  line-height: 1.65;
}

.instruction-card p {
  margin: .65rem 0 0;
}

.state-message {
  min-height: 2.5rem;
  margin: 1.25rem 0;
}

.direction-pad {
  display: grid;
  width: min(100%, 14rem);
  grid-template-columns: repeat(3, 1fr);
  align-self: center;
}

.direction-pad button,
.game-actions button {
  min-height: 48px;
  border: 1px solid var(--game-border-strong);
  background: var(--game-control);
  color: var(--game-foreground);
  cursor: pointer;
  font: inherit;
  font-weight: 720;
  touch-action: manipulation;
  transition: border-color 180ms ease, background-color 180ms ease;
}

.direction-pad button:first-child {
  grid-column: 2;
}

.direction-pad button:nth-child(2) {
  grid-row: 2;
  grid-column: 1;
}

.direction-pad button:nth-child(3) {
  grid-row: 2;
  grid-column: 2;
}

.direction-pad button:nth-child(4) {
  grid-row: 2;
  grid-column: 3;
}

.direction-pad button:hover,
.game-actions button:hover {
  border-color: var(--game-accent);
  background: var(--game-control-hover);
}

.direction-pad button:focus-visible,
.game-actions button:focus-visible {
  outline: 2px solid var(--game-focus);
  outline-offset: 2px;
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
  .snake-layout {
    grid-template-columns: 1fr;
  }

  .canvas-frame {
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
    min-width: 5rem;
    margin: 0 0 .75rem 1rem;
  }

  .snake-layout,
  .canvas-frame {
    min-height: 0;
  }
}
</style>
