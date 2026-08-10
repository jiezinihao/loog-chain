<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { renderMarkdown } from './markdown';
import { thinkingNotes } from './notes';

const route = useRoute();
const router = useRouter();
const activeHeadingId = ref('');
let scrollFrame = 0;

const noteLinks = new Map(thinkingNotes.map((note) => [note.fileName, note.id]));
const noteId = computed(() => {
  const routeId = route.params.id;
  return Array.isArray(routeId) ? routeId[0] : routeId;
});
const noteIndex = computed(() => thinkingNotes.findIndex((item) => item.id === noteId.value));
const note = computed(() => thinkingNotes[noteIndex.value]);
const previousNote = computed(() => (noteIndex.value > 0 ? thinkingNotes[noteIndex.value - 1] : undefined));
const nextNote = computed(() => (
  noteIndex.value >= 0 && noteIndex.value < thinkingNotes.length - 1
    ? thinkingNotes[noteIndex.value + 1]
    : undefined
));
const renderedNote = computed(() => (
  note.value ? renderMarkdown(note.value.content, noteLinks) : { headings: [], html: '' }
));
const noteStyle = computed(() => ({ '--note-accent': note.value?.accent ?? '244 118 152' }));

function updateActiveHeading() {
  const headings = renderedNote.value.headings;
  let currentHeadingId = headings[0]?.id ?? '';

  headings.forEach((heading) => {
    const element = document.getElementById(heading.id);
    if (element && element.getBoundingClientRect().top <= 160) {
      currentHeadingId = heading.id;
    }
  });

  activeHeadingId.value = currentHeadingId;
}

function scheduleActiveHeadingUpdate() {
  if (scrollFrame) {
    return;
  }

  scrollFrame = window.requestAnimationFrame(() => {
    updateActiveHeading();
    scrollFrame = 0;
  });
}

function scrollToHeading(id: string, updateHash = true) {
  const target = document.getElementById(id);
  if (!target) {
    return;
  }

  target.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
  activeHeadingId.value = id;

  if (updateHash) {
    void router.replace({ hash: `#${id}` });
  }
}

function handleArticleClick(event: MouseEvent) {
  if (!(event.target instanceof Element)) {
    return;
  }

  const noteLink = event.target.closest<HTMLAnchorElement>('a[data-note-link="true"]');
  if (!noteLink) {
    return;
  }

  event.preventDefault();
  const targetUrl = new URL(noteLink.href, window.location.origin);
  void router.push(targetUrl.pathname);
}

function getHashTarget() {
  const hash = route.hash.slice(1);
  try {
    return decodeURIComponent(hash);
  } catch {
    return hash;
  }
}

async function syncPage() {
  await nextTick();
  document.title = note.value ? `${note.value.title} · Think Chain` : '笔记不存在 · Think Chain';

  if (route.hash) {
    scrollToHeading(getHashTarget(), false);
  } else {
    window.scrollTo({ top: 0, behavior: 'auto' });
    activeHeadingId.value = renderedNote.value.headings[0]?.id ?? '';
  }
}

watch(noteId, () => {
  void syncPage();
});

onMounted(() => {
  window.addEventListener('scroll', scheduleActiveHeadingUpdate, { passive: true });
  void syncPage();
});

onBeforeUnmount(() => {
  window.removeEventListener('scroll', scheduleActiveHeadingUpdate);
  window.cancelAnimationFrame(scrollFrame);
  document.title = 'Think Chain';
});
</script>

<template>
  <main
    v-if="note"
    class="thinking-detail"
    :style="noteStyle"
    data-thinking-detail-root
  >
    <a class="thinking-detail__skip" href="#thinking-article">跳到正文</a>
    <div class="thinking-detail__glow" aria-hidden="true"></div>

    <header class="thinking-detail__header">
      <RouterLink class="thinking-detail__back" :to="{ name: 'thinking' }">
        <span aria-hidden="true">←</span>
        <span>返回思想切面</span>
      </RouterLink>
      <p class="thinking-detail__category">{{ note.category }}</p>
      <h1>{{ note.title }}</h1>
      <p class="thinking-detail__description">{{ note.excerpt }}</p>
      <p class="thinking-detail__meta">
        {{ note.fileName }} · 约 {{ note.readingMinutes }} 分钟
      </p>
    </header>

    <div class="thinking-detail__layout">
      <aside class="thinking-detail__toc" aria-label="文章目录">
        <p>ON THIS PAGE</p>
        <nav v-if="renderedNote.headings.length">
          <a
            v-for="heading in renderedNote.headings"
            :key="heading.id"
            :class="[
              `thinking-detail__toc-link--level-${heading.level}`,
              { 'thinking-detail__toc-link--active': activeHeadingId === heading.id },
            ]"
            :href="`#${heading.id}`"
            :aria-current="activeHeadingId === heading.id ? 'location' : undefined"
            @click.prevent="scrollToHeading(heading.id)"
          >
            {{ heading.text }}
          </a>
        </nav>
        <span v-else class="thinking-detail__toc-empty">本篇暂无目录</span>
      </aside>

      <!-- 正文 HTML 已在 renderMarkdown 中经过 DOMPurify 净化，仅在此处按只读内容渲染。 -->
      <!-- eslint-disable vue/no-v-html -->
      <article
        id="thinking-article"
        class="thinking-detail__article"
        @click="handleArticleClick"
        v-html="renderedNote.html"
      ></article>
      <!-- eslint-enable vue/no-v-html -->
    </div>

    <nav class="thinking-detail__pagination" aria-label="相邻笔记">
      <RouterLink
        v-if="previousNote"
        class="thinking-detail__page-link thinking-detail__page-link--previous"
        :to="{ name: 'thinking-detail', params: { id: previousNote.id } }"
      >
        <span>上一篇</span>
        <strong>{{ previousNote.title }}</strong>
      </RouterLink>
      <span v-else class="thinking-detail__page-link thinking-detail__page-link--disabled">
        <span>上一篇</span>
        <strong>已经是第一篇</strong>
      </span>

      <RouterLink
        v-if="nextNote"
        class="thinking-detail__page-link thinking-detail__page-link--next"
        :to="{ name: 'thinking-detail', params: { id: nextNote.id } }"
      >
        <span>下一篇</span>
        <strong>{{ nextNote.title }}</strong>
      </RouterLink>
      <span v-else class="thinking-detail__page-link thinking-detail__page-link--next thinking-detail__page-link--disabled">
        <span>下一篇</span>
        <strong>已经是最后一篇</strong>
      </span>
    </nav>
  </main>

  <main v-else class="thinking-detail thinking-detail--missing" data-thinking-detail-root>
    <p>NOTE NOT FOUND</p>
    <h1>这篇笔记暂时不存在</h1>
    <RouterLink :to="{ name: 'thinking' }">返回思想切面</RouterLink>
  </main>
</template>

<style>
/* 详情页遵循项目级 Light / Dark 主题规范，单独映射阅读场景的语义色。 */
html[data-theme='light'] [data-thinking-detail-root] {
  --detail-background: #f3f0ec;
  --detail-surface: #fff;
  --detail-foreground: #202126;
  --detail-muted: #5a5b63;
  --detail-subtle: #77747a;
  --detail-border: rgb(32 33 38 / 18%);
  --detail-code: #ebe6e2;
  --detail-quote: rgb(255 255 255 / 72%);
  --detail-selection: rgb(165 31 81 / 18%);
  --detail-shadow: 0 18px 46px rgb(62 48 57 / 9%);
}
</style>

<style scoped>
:global(*) {
  box-sizing: border-box;
}

.thinking-detail {
  --note-accent: 244 118 152;
  --detail-background: #08090c;
  --detail-surface: #151519;
  --detail-foreground: #f6f1eb;
  --detail-muted: #aaa6a4;
  --detail-subtle: #7f7b79;
  --detail-border: rgb(255 255 255 / 14%);
  --detail-code: #111217;
  --detail-quote: rgb(255 255 255 / 5%);
  --detail-selection: rgb(244 118 152 / 22%);
  --detail-shadow: 0 18px 46px rgb(0 0 0 / 24%);
  position: relative;
  min-height: 100dvh;
  padding-bottom: max(5rem, env(safe-area-inset-bottom));
  background: var(--detail-background);
  color: var(--detail-foreground);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  transition: background-color 220ms ease, color 220ms ease;
}

.thinking-detail::before {
  position: fixed;
  z-index: 0;
  background-image: linear-gradient(var(--detail-border) 1px, transparent 1px), linear-gradient(90deg, var(--detail-border) 1px, transparent 1px);
  background-size: 72px 72px;
  content: '';
  opacity: .16;
  pointer-events: none;
  inset: 0;
}

.thinking-detail__glow {
  position: absolute;
  width: min(44rem, 70vw);
  aspect-ratio: 1;
  top: -22rem;
  right: -12rem;
  border-radius: 50%;
  background: rgb(var(--note-accent) / 13%);
  filter: blur(90px);
  pointer-events: none;
}

.thinking-detail__skip {
  position: fixed;
  z-index: 1100;
  top: 1rem;
  left: 1rem;
  padding: .7rem .9rem;
  background: var(--detail-foreground);
  color: var(--detail-background);
  font-size: .75rem;
  font-weight: 700;
  opacity: 0;
  pointer-events: none;
  text-decoration: none;
  transform: translateY(-1rem);
}

.thinking-detail__skip:focus {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.thinking-detail__header,
.thinking-detail__layout,
.thinking-detail__pagination {
  position: relative;
  z-index: 1;
  width: min(76rem, calc(100% - 3rem));
  margin-right: auto;
  margin-left: auto;
}

.thinking-detail__header {
  padding: max(7rem, calc(env(safe-area-inset-top) + 6rem)) 0 5rem;
  border-bottom: 1px solid var(--detail-border);
}

.thinking-detail__back {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  color: var(--detail-muted);
  font-size: .76rem;
  letter-spacing: .08em;
  text-decoration: none;
  transition: color 180ms ease, transform 180ms ease;
}

.thinking-detail__back span:first-child {
  margin-right: .65rem;
  font-size: 1rem;
}

.thinking-detail__back:hover,
.thinking-detail__back:focus-visible {
  color: var(--detail-foreground);
  transform: translateX(-3px);
}

.thinking-detail__back:focus-visible,
.thinking-detail__toc a:focus-visible,
.thinking-detail__page-link:focus-visible,
.thinking-detail--missing a:focus-visible {
  outline: 2px solid rgb(var(--note-accent));
  outline-offset: 4px;
}

.thinking-detail__category {
  margin: 3rem 0 0;
  color: rgb(var(--note-accent));
  font-size: .68rem;
  font-weight: 700;
  letter-spacing: .2em;
}

.thinking-detail__header h1 {
  max-width: 58rem;
  margin: .9rem 0 0;
  font-family: "Songti SC", "STSong", "Noto Serif SC", Georgia, serif;
  font-size: clamp(3rem, 7vw, 7rem);
  font-weight: 600;
  letter-spacing: -.075em;
  line-height: .98;
}

.thinking-detail__description {
  max-width: 42rem;
  margin: 2rem 0 0;
  color: var(--detail-muted);
  font-family: "Songti SC", "STSong", serif;
  font-size: clamp(1rem, 1.5vw, 1.18rem);
  line-height: 1.8;
}

.thinking-detail__meta {
  margin: 1.5rem 0 0;
  color: var(--detail-subtle);
  font-size: .68rem;
  letter-spacing: .12em;
}

.thinking-detail__layout {
  display: grid;
  grid-template-columns: 15rem minmax(0, 46rem);
  justify-content: space-between;
  padding-top: 5rem;
}

.thinking-detail__toc {
  position: sticky;
  top: 6rem;
  align-self: start;
  padding-right: 2rem;
}

.thinking-detail__toc > p {
  margin: 0 0 1.25rem;
  color: var(--detail-subtle);
  font-size: .62rem;
  font-weight: 700;
  letter-spacing: .18em;
}

.thinking-detail__toc nav {
  border-left: 1px solid var(--detail-border);
}

.thinking-detail__toc a {
  display: block;
  margin-left: -1px;
  padding: .48rem 0 .48rem 1rem;
  border-left: 1px solid transparent;
  color: var(--detail-muted);
  font-size: .74rem;
  line-height: 1.45;
  text-decoration: none;
  transition: border-color 180ms ease, color 180ms ease, transform 180ms ease;
}

.thinking-detail__toc a:hover,
.thinking-detail__toc a:focus-visible,
.thinking-detail__toc-link--active {
  border-left-color: rgb(var(--note-accent)) !important;
  color: var(--detail-foreground) !important;
  transform: translateX(3px);
}

.thinking-detail__toc-link--level-3 {
  padding-left: 1.8rem !important;
  font-size: .69rem !important;
}

.thinking-detail__toc-empty {
  color: var(--detail-subtle);
  font-size: .74rem;
}

.thinking-detail__article {
  min-width: 0;
  color: var(--detail-foreground);
  font-size: 1rem;
  line-height: 1.85;
}

.thinking-detail__article::selection,
.thinking-detail__article :deep(*)::selection {
  background: var(--detail-selection);
}

.thinking-detail__article :deep(h2),
.thinking-detail__article :deep(h3) {
  scroll-margin-top: 6rem;
  font-family: "Songti SC", "STSong", "Noto Serif SC", Georgia, serif;
  line-height: 1.25;
}

.thinking-detail__article :deep(h2) {
  margin: 4.5rem 0 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--detail-border);
  font-size: clamp(1.8rem, 4vw, 2.65rem);
  letter-spacing: -.04em;
}

.thinking-detail__article :deep(h2:first-child) {
  margin-top: 0;
}

.thinking-detail__article :deep(h3) {
  margin: 3rem 0 1rem;
  font-size: clamp(1.3rem, 2.5vw, 1.7rem);
}

.thinking-detail__article :deep(p) {
  margin: 1.3rem 0 0;
}

.thinking-detail__article :deep(ul),
.thinking-detail__article :deep(ol) {
  margin: 1.3rem 0 0;
  padding-left: 1.45rem;
}

.thinking-detail__article :deep(li) {
  margin-top: .55rem;
  padding-left: .25rem;
}

.thinking-detail__article :deep(blockquote) {
  margin: 2rem 0;
  padding: 1.25rem 1.5rem;
  border-left: 3px solid rgb(var(--note-accent));
  background: var(--detail-quote);
  color: var(--detail-muted);
  box-shadow: var(--detail-shadow);
}

.thinking-detail__article :deep(blockquote p) {
  margin: 0;
}

.thinking-detail__article :deep(a) {
  color: rgb(var(--note-accent));
  text-decoration-color: rgb(var(--note-accent) / 45%);
  text-underline-offset: .18em;
}

.thinking-detail__article :deep(code) {
  padding: .16em .38em;
  border: 1px solid var(--detail-border);
  border-radius: .3rem;
  background: var(--detail-code);
  font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
  font-size: .88em;
}

.thinking-detail__article :deep(pre) {
  max-width: 100%;
  margin: 2rem 0;
  overflow-x: auto;
  padding: 1.3rem 1.5rem;
  border: 1px solid var(--detail-border);
  border-radius: .35rem;
  background: var(--detail-code);
  box-shadow: var(--detail-shadow);
  line-height: 1.65;
}

.thinking-detail__article :deep(pre code) {
  padding: 0;
  border: 0;
  background: transparent;
  font-size: .82rem;
}

.thinking-detail__article :deep(table) {
  display: block;
  width: 100%;
  margin: 2rem 0;
  overflow-x: auto;
  border-collapse: collapse;
}

.thinking-detail__article :deep(th),
.thinking-detail__article :deep(td) {
  padding: .8rem 1rem;
  border: 1px solid var(--detail-border);
  text-align: left;
  white-space: nowrap;
}

.thinking-detail__article :deep(hr) {
  margin: 3rem 0;
  border: 0;
  border-top: 1px solid var(--detail-border);
}

.thinking-detail__pagination {
  display: flex;
  justify-content: space-between;
  margin-top: 7rem;
  padding-top: 2rem;
  border-top: 1px solid var(--detail-border);
}

.thinking-detail__page-link {
  display: flex;
  width: calc(50% - .75rem);
  min-height: 8.5rem;
  padding: 1.5rem;
  border: 1px solid var(--detail-border);
  flex-direction: column;
  justify-content: space-between;
  background: var(--detail-surface);
  color: var(--detail-foreground);
  box-shadow: var(--detail-shadow);
  text-decoration: none;
  transition: border-color 180ms ease, transform 180ms ease;
}

.thinking-detail__page-link--next {
  align-items: flex-end;
  text-align: right;
}

.thinking-detail__page-link:not(.thinking-detail__page-link--disabled):hover {
  border-color: rgb(var(--note-accent) / 70%);
  transform: translateY(-3px);
}

.thinking-detail__page-link span {
  color: var(--detail-subtle);
  font-size: .65rem;
  font-weight: 700;
  letter-spacing: .16em;
}

.thinking-detail__page-link strong {
  max-width: 24rem;
  font-family: "Songti SC", "STSong", serif;
  font-size: clamp(1.1rem, 2vw, 1.5rem);
  line-height: 1.35;
}

.thinking-detail__page-link--disabled {
  box-shadow: none;
  opacity: .48;
}

.thinking-detail--missing {
  display: grid;
  align-content: center;
  padding: 2rem;
  text-align: center;
}

.thinking-detail--missing p,
.thinking-detail--missing h1 {
  margin: 0;
}

.thinking-detail--missing p {
  color: var(--detail-subtle);
  font-size: .68rem;
  letter-spacing: .2em;
}

.thinking-detail--missing h1 {
  margin-top: 1rem;
  font-family: "Songti SC", "STSong", serif;
  font-size: clamp(2.2rem, 7vw, 5rem);
}

.thinking-detail--missing a {
  width: fit-content;
  min-height: 44px;
  margin: 2rem auto 0;
  color: var(--detail-muted);
  line-height: 44px;
}

@media (max-width: 900px) {
  .thinking-detail__header,
  .thinking-detail__layout,
  .thinking-detail__pagination {
    width: min(46rem, calc(100% - 2.5rem));
  }

  .thinking-detail__header {
    padding-bottom: 3.5rem;
  }

  .thinking-detail__layout {
    display: block;
    padding-top: 2.5rem;
  }

  .thinking-detail__toc {
    position: relative;
    top: auto;
    margin-bottom: 4rem;
    padding: 1.25rem;
    border: 1px solid var(--detail-border);
    background: var(--detail-surface);
  }

  .thinking-detail__toc nav {
    columns: 2;
  }

  .thinking-detail__toc a {
    break-inside: avoid;
  }
}

@media (max-width: 600px) {
  .thinking-detail__header {
    padding-top: max(6.5rem, calc(env(safe-area-inset-top) + 5.5rem));
  }

  .thinking-detail__header h1 {
    font-size: clamp(2.7rem, 14vw, 4.5rem);
  }

  .thinking-detail__category {
    margin-top: 2rem;
  }

  .thinking-detail__toc nav {
    columns: 1;
  }

  .thinking-detail__pagination {
    display: block;
    margin-top: 5rem;
  }

  .thinking-detail__page-link {
    width: 100%;
    min-height: 7.5rem;
  }

  .thinking-detail__page-link + .thinking-detail__page-link {
    margin-top: 1rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .thinking-detail,
  .thinking-detail__back,
  .thinking-detail__toc a,
  .thinking-detail__page-link {
    transition: none;
  }
}
</style>
