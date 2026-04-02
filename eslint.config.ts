import { defineConfig } from 'eslint/config';

// ESLint plugins
import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

import stylistic from '@stylistic/eslint-plugin';
import tsdoc from 'eslint-plugin-tsdoc';
import unicorn from 'eslint-plugin-unicorn';

export default defineConfig([
  js.configs.recommended,
  unicorn.configs.recommended,
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/**/*.{js,mjs,cjs,ts,tsx}', 'eslint.config.ts'],
    plugins: {
      '@stylistic': stylistic,
      'tsdoc': tsdoc,
    },
    rules: {
      'arrow-spacing': 'error',
      'comma-dangle': ['error', 'always-multiline'],
      'comma-spacing': 'error',
      'keyword-spacing': 'error',
      'max-len': ['warn', { code: 120 }],
      'new-cap': ['error', { capIsNew: false }],
      'no-extra-semi': 'error',
      'no-trailing-spaces': 'error',
      'object-curly-spacing': ['error', 'always'],
      'require-jsdoc': 'off', // 経過措置
      'semi': ['error', 'always'],
      'space-before-blocks': 'error',
      'space-in-parens': ['error', 'never'],
      'space-infix-ops': 'error',

      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single'],

      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      'react/jsx-tag-spacing': ['error', { beforeSelfClosing: 'always' }],

      'react-hooks/set-state-in-effect': 'off',

      'sonarjs/no-unused-vars': 'off', // 競合回避のため

      'tsdoc/syntax': 'error',

      'unicorn/catch-error-name': ['error', { name: 'e' }],
      'unicorn/expiring-todo-comments': 'off',
      'unicorn/filename-case': ['error', { cases: { camelCase: true } }],
      'unicorn/no-negated-condition': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prevent-abbreviations': [
        'warn',
        {
          allowList: {
            'db': true,
            'e': true,
            'str': true,
            'utils': true,
          },
        },
      ],
    },
  },
]);
