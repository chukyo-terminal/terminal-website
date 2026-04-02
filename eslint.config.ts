import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { fixupConfigRules } from '@eslint/compat';
import { FlatCompat } from '@eslint/eslintrc';

// eslint plugins
import stylistic from '@stylistic/eslint-plugin';
import unicorn from 'eslint-plugin-unicorn';
import * as globals from 'globals';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
});


export default defineConfig([
  unicorn.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],

    extends: fixupConfigRules(compat.extends(
      'next/core-web-vitals',
      'next/typescript',
    )),

    plugins: {
      '@stylistic': stylistic,
    },

    languageOptions: {
      globals: {
        ...globals.node,
      },
      ecmaVersion: 2024,
      sourceType: 'module',
    },

    settings: {
    },

    rules: {
      'max-len': ['warn', { code: 120 }],
      'new-cap': ['error', { capIsNew: false }],
      'object-curly-spacing': ['error', 'always'],
      'require-jsdoc': 'off',

      '@stylistic/indent': ['error', 2],
      '@stylistic/quotes': ['error', 'single'],

      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      'unicorn/catch-error-name': ['error', { name: 'e' }],
      'unicorn/expiring-todo-comments': 'off',
      'unicorn/filename-case': ['error', { cases: { camelCase: true } }],
      'unicorn/no-empty-file': 'off',
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
          }
        },
      ],
    },
  },
]);
