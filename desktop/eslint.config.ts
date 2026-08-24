// 桌面端 lint 配置：口径与 web/eslint.config.ts 对齐（桌面端功能铺开时保持同步演进）
import js from '@eslint/js'
import globals from 'globals'
import pluginVue from 'eslint-plugin-vue'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'

export default [
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    // .vue 文件：<script lang="ts"> 与模板表达式均走 @typescript-eslint/parser
    files: ['**/*.vue'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: {
      parserOptions: {
        parser: {
          js: 'espree',
          ts: tsParser,
          '<template>': tsParser
        }
      }
    }
  },
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      // 源头防屎门禁：console 残留 warn 提示（开发期允许 log，提交前提示清理）
      'no-console': 'warn',
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'warn',
      'vue/require-default-prop': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
      'vue/attribute-hyphenation': 'off',
      'vue/v-on-event-hyphenation': 'off'
    }
  },
  {
    // TS 文件：no-undef/no-unused-vars 换 TS 感知版（typescript-eslint 官方口径）
    files: ['**/*.ts'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: { parser: tsParser },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    // eslint/vitest 配置本身是 node 环境 ESM 脚本
    files: ['eslint.config.ts', 'vitest.config.ts'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    ignores: ['node_modules/', 'dist/', 'coverage/', 'src-tauri/']
  }
]
