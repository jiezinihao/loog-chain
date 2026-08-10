import { onBeforeUnmount, onMounted, ref } from 'vue';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'think-chain-theme';
const THEME_COLORS: Record<Theme, string> = {
  dark: '#07080b',
  light: '#f5f2ed',
};

function getStoredTheme(): Theme | null {
  try {
    const storedTheme = window.localStorage.getItem(STORAGE_KEY);
    return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : null;
  } catch {
    return null;
  }
}

function getSystemTheme(mediaQuery: MediaQueryList): Theme {
  return mediaQuery.matches ? 'dark' : 'light';
}

function syncDocumentTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  // 同步浏览器系统栏颜色；入口未声明时由主题逻辑安全补建。
  let themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!themeColorMeta) {
    themeColorMeta = document.createElement('meta');
    themeColorMeta.name = 'theme-color';
    document.head.append(themeColorMeta);
  }
  themeColorMeta.content = THEME_COLORS[theme];
}

export function useTheme() {
  const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const storedTheme = getStoredTheme();
  const hasManualPreference = ref(storedTheme !== null);
  const theme = ref<Theme>(storedTheme ?? getSystemTheme(systemThemeQuery));

  // 在应用首次渲染前同步根节点，所有路由共享同一份主题来源。
  syncDocumentTheme(theme.value);

  function handleSystemThemeChange(event: MediaQueryListEvent) {
    if (hasManualPreference.value) {
      return;
    }

    theme.value = event.matches ? 'dark' : 'light';
    syncDocumentTheme(theme.value);
  }

  function setTheme(nextTheme: Theme) {
    // 显式选择 Light 或 Dark，不再把主题切换建模成亮度的反转操作。
    theme.value = nextTheme;
    hasManualPreference.value = true;
    syncDocumentTheme(theme.value);

    try {
      window.localStorage.setItem(STORAGE_KEY, theme.value);
    } catch {
      // 浏览器禁用存储时仍保留本次会话的主题，不阻断页面交互。
    }
  }

  onMounted(() => {
    systemThemeQuery.addEventListener('change', handleSystemThemeChange);
  });

  onBeforeUnmount(() => {
    systemThemeQuery.removeEventListener('change', handleSystemThemeChange);
  });

  return {
    theme,
    setTheme,
  };
}
