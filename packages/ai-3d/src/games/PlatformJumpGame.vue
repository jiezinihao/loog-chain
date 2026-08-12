<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

interface Rectangle {
  height: number;
  width: number;
  x: number;
  y: number;
}

interface Player extends Rectangle {
  velocityX: number;
  velocityY: number;
}

const canvasWidth = 800;
const canvasHeight = 450;
const platforms: Rectangle[] = [
  { x: 0, y: 408, width: 170, height: 42 },
  { x: 190, y: 358, width: 126, height: 22 },
  { x: 348, y: 308, width: 120, height: 22 },
  { x: 500, y: 252, width: 122, height: 22 },
  { x: 648, y: 195, width: 132, height: 22 },
];
const player: Player = {
  x: 44,
  y: 368,
  width: 28,
  height: 40,
  velocityX: 0,
  velocityY: 0,
};

const gameElement = ref<HTMLElement>();
const canvasElement = ref<HTMLCanvasElement>();
const isRunning = ref(false);
const attempts = ref(0);
const stateMessage = ref('按开始挑战，移动到最高平台的信标。');

let context: CanvasRenderingContext2D | null = null;
let animationFrame = 0;
let lastFrameTime = 0;
let themeObserver: MutationObserver | undefined;
let isGrounded = false;
let hasWon = false;
const pressedKeys = new Set<string>();

function readColor(variable: string, fallback: string) {
  const game = gameElement.value;
  return game ? getComputedStyle(game).getPropertyValue(variable).trim() || fallback : fallback;
}

function drawPixelCloud(x: number, y: number, color: string) {
  if (!context) return;
  context.fillStyle = color;
  context.fillRect(x + 18, y, 54, 12);
  context.fillRect(x, y + 12, 96, 14);
  context.fillRect(x + 12, y + 26, 72, 10);
}

function drawGame() {
  if (!context) return;
  const background = readColor('--game-canvas', '#0c1018');
  const grid = readColor('--game-canvas-grid', 'rgb(255 255 255 / 7%)');
  const foreground = readColor('--game-foreground', '#f4f5f8');
  const muted = readColor('--game-muted', '#a5abb7');
  const accent = readColor('--game-accent', '#9f91ff');
  const secondary = readColor('--game-accent-secondary', '#68e5d1');

  context.fillStyle = background;
  context.fillRect(0, 0, canvasWidth, canvasHeight);
  context.strokeStyle = grid;
  context.lineWidth = 1;
  for (let x = 0; x <= canvasWidth; x += 32) {
    context.beginPath();
    context.moveTo(x + .5, 0);
    context.lineTo(x + .5, canvasHeight);
    context.stroke();
  }
  for (let y = 0; y <= canvasHeight; y += 32) {
    context.beginPath();
    context.moveTo(0, y + .5);
    context.lineTo(canvasWidth, y + .5);
    context.stroke();
  }

  context.globalAlpha = .16;
  drawPixelCloud(80, 82, foreground);
  drawPixelCloud(420, 66, secondary);
  context.globalAlpha = 1;

  platforms.forEach((platform, index) => {
    context!.fillStyle = index === platforms.length - 1 ? accent : muted;
    context!.fillRect(platform.x, platform.y, platform.width, platform.height);
    context!.fillStyle = background;
    context!.fillRect(platform.x + 8, platform.y + 8, platform.width - 16, 4);
  });

  const goal = platforms[platforms.length - 1];
  context.fillStyle = foreground;
  context.fillRect(goal.x + goal.width - 18, goal.y - 58, 4, 58);
  context.fillStyle = secondary;
  context.fillRect(goal.x + goal.width - 14, goal.y - 58, 30, 18);

  context.fillStyle = hasWon ? secondary : foreground;
  context.fillRect(Math.round(player.x), Math.round(player.y), player.width, player.height);
  context.fillStyle = background;
  context.fillRect(Math.round(player.x) + 6, Math.round(player.y) + 10, 5, 5);
  context.fillRect(Math.round(player.x) + 18, Math.round(player.y) + 10, 5, 5);
  context.fillStyle = accent;
  context.fillRect(Math.round(player.x) + 5, Math.round(player.y) + player.height - 6, 8, 6);
  context.fillRect(Math.round(player.x) + 17, Math.round(player.y) + player.height - 6, 8, 6);
}

function rectanglesOverlap(first: Rectangle, second: Rectangle) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function placePlayerAtStart(countAttempt: boolean) {
  if (countAttempt) attempts.value += 1;
  player.x = 44;
  player.y = 368;
  player.velocityX = 0;
  player.velocityY = 0;
  isGrounded = true;
  hasWon = false;
}

function stopGame(message?: string) {
  window.cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  lastFrameTime = 0;
  isRunning.value = false;
  pressedKeys.clear();
  if (message) stateMessage.value = message;
}

function resetLevel(startImmediately = false) {
  stopGame();
  attempts.value = 0;
  placePlayerAtStart(false);
  stateMessage.value = '关卡已重置，向右攀登到达信标。';
  drawGame();
  if (startImmediately) startGame();
}

function startGame() {
  if (isRunning.value) {
    stopGame('挑战已暂停，按继续挑战恢复。');
    return;
  }
  if (hasWon) placePlayerAtStart(true);
  isRunning.value = true;
  stateMessage.value = '挑战进行中。';
  lastFrameTime = performance.now();
  animationFrame = window.requestAnimationFrame(updateGame);
  gameElement.value?.focus();
}

function jump() {
  if (!isGrounded || !isRunning.value) return;
  player.velocityY = -520;
  isGrounded = false;
}

function updateGame(time: number) {
  if (!isRunning.value) return;
  const delta = Math.min((time - lastFrameTime) / 1000, .033);
  lastFrameTime = time;
  const movingLeft = pressedKeys.has('ArrowLeft') || pressedKeys.has('a') || pressedKeys.has('A');
  const movingRight = pressedKeys.has('ArrowRight') || pressedKeys.has('d') || pressedKeys.has('D');
  player.velocityX = movingLeft === movingRight ? 0 : movingLeft ? -230 : 230;
  const previousBottom = player.y + player.height;
  player.x = Math.max(0, Math.min(canvasWidth - player.width, player.x + player.velocityX * delta));
  player.velocityY += 1320 * delta;
  player.y += player.velocityY * delta;
  isGrounded = false;

  if (player.velocityY >= 0) {
    for (const platform of platforms) {
      const currentBottom = player.y + player.height;
      const horizontallyAligned = player.x + player.width > platform.x && player.x < platform.x + platform.width;
      if (horizontallyAligned && previousBottom <= platform.y && currentBottom >= platform.y) {
        player.y = platform.y - player.height;
        player.velocityY = 0;
        isGrounded = true;
        break;
      }
    }
  }

  const goalPlatform = platforms[platforms.length - 1];
  const goalArea = { x: goalPlatform.x + goalPlatform.width - 28, y: goalPlatform.y - 64, width: 48, height: 66 };
  if (rectanglesOverlap(player, goalArea)) {
    hasWon = true;
    drawGame();
    stopGame(`抵达信标，完成挑战！本局失误 ${attempts.value} 次。`);
    return;
  }

  if (player.y > canvasHeight + 40) {
    placePlayerAtStart(true);
    stateMessage.value = `跌落后已返回起点，当前失误 ${attempts.value} 次。`;
  }

  drawGame();
  animationFrame = window.requestAnimationFrame(updateGame);
}

function handleKeydown(event: KeyboardEvent) {
  const controlledKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'a', 'A', 'd', 'D', 'w', 'W'];
  if (controlledKeys.includes(event.key) || event.code === 'Space') {
    event.preventDefault();
    if (!isRunning.value) startGame();
  }
  pressedKeys.add(event.key);
  if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W' || event.code === 'Space') jump();
  if (event.key === 'r' || event.key === 'R') resetLevel(true);
}

function handleKeyup(event: KeyboardEvent) {
  pressedKeys.delete(event.key);
}

function pressDirection(direction: 'left' | 'right') {
  const key = direction === 'left' ? 'ArrowLeft' : 'ArrowRight';
  if (!isRunning.value) startGame();
  pressedKeys.add(key);
}

function releaseDirection(direction: 'left' | 'right') {
  pressedKeys.delete(direction === 'left' ? 'ArrowLeft' : 'ArrowRight');
}

function pressJump() {
  if (!isRunning.value) startGame();
  jump();
}

onMounted(async () => {
  await nextTick();
  context = canvasElement.value?.getContext('2d') ?? null;
  // 2D Canvas 使用主题语义色绘制，主题变化后无需重建关卡即可同步外观。
  themeObserver = new MutationObserver(drawGame);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  placePlayerAtStart(false);
  drawGame();
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
    class="platform-game"
    tabindex="0"
    aria-labelledby="platform-title"
    @keydown="handleKeydown"
    @keyup="handleKeyup"
  >
    <header class="game-heading">
      <div>
        <p>TWO-DIMENSIONAL PLATFORMER</p>
        <h2 id="platform-title">像素平台跳跃</h2>
      </div>
      <dl class="game-stats">
        <div>
          <dt>FALLS</dt>
          <dd>{{ String(attempts).padStart(2, '0') }}</dd>
        </div>
        <div>
          <dt>GOAL</dt>
          <dd>BEACON</dd>
        </div>
      </dl>
    </header>

    <div class="platform-layout">
      <div class="canvas-frame">
        <canvas
          ref="canvasElement"
          :width="canvasWidth"
          :height="canvasHeight"
          aria-label="横向攀登五个平台并到达信标的像素跳跃游戏"
        ></canvas>
      </div>

      <aside class="game-console">
        <div class="instruction-card">
          <span>HOW TO PLAY / 操作</span>
          <strong>A D 或左右键移动，W / 空格跳跃</strong>
          <p>借助逐级升高的平台抵达右上方信标。跌落后会立即回到起点。</p>
        </div>

        <p class="state-message" aria-live="polite">{{ stateMessage }}</p>

        <div class="move-controls" aria-label="角色移动控制">
          <button
            type="button"
            @pointerdown="pressDirection('left')"
            @pointerup="releaseDirection('left')"
            @pointercancel="releaseDirection('left')"
            @pointerleave="releaseDirection('left')"
          >
            向左
          </button>
          <button type="button" @click="pressJump">跳跃</button>
          <button
            type="button"
            @pointerdown="pressDirection('right')"
            @pointerup="releaseDirection('right')"
            @pointercancel="releaseDirection('right')"
            @pointerleave="releaseDirection('right')"
          >
            向右
          </button>
        </div>

        <div class="game-actions">
          <button type="button" @click="startGame">{{ isRunning ? '暂停挑战' : '开始 / 继续' }}</button>
          <button type="button" @click="resetLevel(true)">重新挑战</button>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.platform-game {
  min-height: 100%;
  padding: clamp(1.25rem, 3vw, 3rem);
  color: var(--game-foreground);
  outline: none;
}

.platform-game:focus-visible {
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
  font-size: clamp(.9rem, 2vw, 1.35rem);
  font-variant-numeric: tabular-nums;
}

.platform-layout {
  display: grid;
  min-height: min(68dvh, 720px);
  grid-template-columns: minmax(0, 1.35fr) minmax(19rem, .55fr);
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
  width: min(100%, 900px);
  height: auto;
  aspect-ratio: 16 / 9;
  border: 1px solid var(--game-border-strong);
  box-shadow: 0 22px 70px var(--game-shadow);
  image-rendering: pixelated;
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
  line-height: 1.45;
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

.move-controls,
.game-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.move-controls button,
.game-actions button {
  min-height: 48px;
  border: 1px solid var(--game-border-strong);
  background: var(--game-control);
  color: var(--game-foreground);
  cursor: pointer;
  font: inherit;
  font-weight: 720;
  touch-action: none;
  transition: border-color 180ms ease, background-color 180ms ease;
}

.move-controls button + button,
.game-actions button + button {
  border-left: 0;
}

.move-controls button:nth-child(2) {
  border-color: var(--game-accent-secondary);
}

.move-controls button:hover,
.game-actions button:hover {
  border-color: var(--game-accent);
  background: var(--game-control-hover);
}

.move-controls button:focus-visible,
.game-actions button:focus-visible {
  outline: 2px solid var(--game-focus);
  outline-offset: 2px;
}

.game-actions {
  grid-template-columns: 1fr 1fr;
  margin-top: auto;
  padding-top: 1.5rem;
}

.game-actions button:first-child {
  border-color: var(--game-accent);
  background: var(--game-accent);
  color: var(--game-on-accent);
}

@media (max-width: 1000px) {
  .platform-layout {
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

  .platform-layout,
  .canvas-frame {
    min-height: 0;
  }
}
</style>
