import js from '@eslint/js'
import globals from 'globals'

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      // 源头防屎门禁：禁 console.log/debug（warn/error 保留——运行时错误日志可追溯）
      'no-console': ['error', { allow: ['warn', 'error'] }]
    }
  },
  {
    ignores: ['node_modules/', 'data/', 'coverage/']
  }
]
