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
    // （TS 收尾迁移后模板内联处理函数含类型标注/断言，espree 无法解析）；
    // 普通 js script 维持 espree 不变
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
    // 必须在通用 rules 块之后（flat config 后者胜出）：
    // lang="ts" 块的类型位参数（defineEmits<{ (e: 'x'): void }>）对基础规则是误报源，
    // 换 TS 感知版；JS 块同样兼容（ESTree 超集），未用变量纪律不降级。
    // no-undef 关闭：TS 类型名（如 as EventListener）会被误报，类型系统由 vue-tsc 兜底
    // （typescript-eslint 官方口径：TS 文件不启用 no-undef）
    files: ['**/*.vue'],
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
  },
  {
    // scripts/ 是 node CLI 脚本（check-i18n、compress-paper-tex 等），用 node globals；console 输出是脚本本职
    files: ['scripts/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off' }
  },
  {
    // .ts 独立脚本走 TS parser；no-undef/no-unused-vars 换 TS 感知版
    // （typescript-eslint 官方口径：TS 文件不启用 no-undef，类型系统由 tsc 兜底）
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
    // eslint 配置本身是 node 环境 ESM 脚本
    files: ['eslint.config.ts'],
    languageOptions: { globals: { ...globals.node } }
  },
  {
    ignores: ['node_modules/', 'dist/', 'coverage/']
  }
]
