// Flat-config for ESLint 9+. Loaded automatically; no CLI flag needed.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'gen/**', 'coverage/**', '**/*.cds']
  },
  js.configs.recommended,
  {
    files: ['srv/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
        // CAP runtime globals
        SELECT: 'readonly',
        INSERT: 'readonly',
        UPDATE: 'readonly',
        DELETE: 'readonly',
        cds: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      semi: ['error', 'always'],
      quotes: ['error', 'single', { avoidEscape: true }]
    }
  }
];
