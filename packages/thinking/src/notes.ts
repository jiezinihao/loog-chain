const noteFiles = import.meta.glob<string>('../note/*.md', {
  eager: true,
  import: 'default',
  query: '?raw',
});

export type NoteWeight = 1 | 2 | 3;

export interface ThinkingNote {
  id: string;
  title: string;
  fileName: string;
  content: string;
  category: string;
  excerpt: string;
  weight: NoteWeight;
  accent: string;
  rank: number;
  readingMinutes: number;
}

interface NotePresentation {
  category: string;
  weight: NoteWeight;
  accent: string;
  rank: number;
}

// 展示权重属于编辑决策，独立于文章长度，避免长文天然占据最大的视觉层级。
const NOTE_PRESENTATION: Record<string, NotePresentation> = {
  'AI辅助开发的工程方法.md': { category: 'AI / METHOD', weight: 3, accent: '244 118 152', rank: 1 },
  'Agent应用工程基础.md': { category: 'AGENT / SYSTEM', weight: 3, accent: '109 154 255', rank: 2 },
  'Skill与Hook的工程化约束.md': {
    category: 'AGENT / GUARDRAIL',
    weight: 2,
    accent: '165 126 255',
    rank: 3,
  },
  'MCP服务设计与业务实践.md': {
    category: 'MCP / PRACTICE',
    weight: 2,
    accent: '60 212 185',
    rank: 4,
  },
  'WebGIS地图业务基础.md': { category: 'MAP / WEBGIS', weight: 2, accent: '97 196 138', rank: 5 },
  'Git复杂协作场景与命令.md': {
    category: 'GIT / WORKFLOW',
    weight: 1,
    accent: '240 167 83',
    rank: 6,
  },
  '通过github实现项目的ci-cd.md': {
    category: 'GIT / DELIVERY',
    weight: 1,
    accent: '232 117 92',
    rank: 7,
  },
  'VPN TUN模式下访问本地内网.md': {
    category: 'NETWORK / VPN',
    weight: 1,
    accent: '82 174 255',
    rank: 8,
  },
};

const DEFAULT_PRESENTATION: NotePresentation = {
  category: 'NOTE / SLICE',
  weight: 1,
  accent: '180 151 132',
  rank: Number.MAX_SAFE_INTEGER,
};

function getFileName(path: string) {
  return decodeURIComponent(path.split('/').at(-1) ?? path);
}

function createId(fileName: string) {
  return fileName.replace(/\.md$/i, '').normalize('NFKC').replace(/\s+/g, '-').toLocaleLowerCase();
}

function getTitle(content: string, fileName: string) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? fileName.replace(/\.md$/i, '');
}

function getExcerpt(content: string) {
  const quote = content.match(/^>\s+(.+)$/m)?.[1]?.trim();
  if (quote) {
    return quote;
  }

  const paragraph = content
    .split(/\r?\n\r?\n/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .find((item) => item && !item.startsWith('#') && !item.startsWith('```'));

  return paragraph ?? '一份仍在生长的思考切面。';
}

function getReadingMinutes(content: string) {
  const meaningfulCharacters = content.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, '').length;
  return Math.max(2, Math.ceil(meaningfulCharacters / 520));
}

export const thinkingNotes: ThinkingNote[] = Object.entries(noteFiles)
  .map(([path, content]) => {
    const fileName = getFileName(path);
    const presentation = NOTE_PRESENTATION[fileName] ?? DEFAULT_PRESENTATION;

    return {
      id: createId(fileName),
      title: getTitle(content, fileName),
      fileName,
      content,
      category: presentation.category,
      excerpt: getExcerpt(content),
      weight: presentation.weight,
      accent: presentation.accent,
      rank: presentation.rank,
      readingMinutes: getReadingMinutes(content),
    };
  })
  .sort((left, right) => left.rank - right.rank || left.title.localeCompare(right.title, 'zh-CN'));
