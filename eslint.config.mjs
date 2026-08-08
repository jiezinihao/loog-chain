import js from '@eslint/js';
import prettier from 'eslint-config-prettier/flat';
import vue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const browserTypedFiles = ['apps/**/*.{ts,tsx,vue}', 'packages/**/*.{ts,tsx,vue}'];
const viteConfigFiles = ['apps/entry/vite.config.ts'];
const typedParserOptions = {
  project: './tsconfig.eslint.json',
  tsconfigRootDir: import.meta.dirname,
};

function applyFiles(configs, files) {
  return configs.map((config) => ({ ...config, files }));
}

function elevateRules(configs) {
  return configs.map((config) => ({
    ...config,
    rules: Object.fromEntries(
      Object.entries(config.rules ?? {}).map(([name, value]) => [
        name,
        Array.isArray(value) && value[0] === 'warn'
          ? ['error', ...value.slice(1)]
          : value === 'warn'
            ? 'error'
            : value,
      ]),
    ),
  }));
}

const typedRules = {
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    },
  ],
  'no-console': 'off',
  'no-debugger': 'error',
};

export default tseslint.config(
  {
    name: 'think-chain/ignores',
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '.codex/**',
    ],
  },
  {
    name: 'think-chain/linter-options',
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  {
    name: 'think-chain/javascript',
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
      'no-debugger': 'error',
    },
  },
  ...applyFiles(tseslint.configs.recommendedTypeChecked, browserTypedFiles),
  {
    name: 'think-chain/typescript',
    files: browserTypedFiles,
    languageOptions: {
      globals: globals.browser,
      parserOptions: typedParserOptions,
    },
    rules: typedRules,
  },
  ...applyFiles(tseslint.configs.recommendedTypeChecked, viteConfigFiles),
  {
    name: 'think-chain/vite-config',
    files: viteConfigFiles,
    languageOptions: {
      globals: globals.node,
      parserOptions: typedParserOptions,
    },
    rules: typedRules,
  },
  ...elevateRules(vue.configs['flat/recommended']),
  {
    name: 'think-chain/vue-typescript',
    files: ['apps/**/*.vue', 'packages/**/*.vue'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ...typedParserOptions,
        extraFileExtensions: ['.vue'],
        parser: tseslint.parser,
      },
    },
    rules: typedRules,
  },
  prettier,
);
