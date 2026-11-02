import globals from 'globals';

const rules = {
  'no-undef': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-redeclare': 'error',
  'no-self-assign': 'error',
  'no-cond-assign': 'error',
  'no-constant-condition': 'warn',
  'no-fallthrough': 'warn',
  'no-unsafe-optional-chaining': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-dupe-else-if': 'error',
  'no-import-assign': 'error',
  'no-const-assign': 'error',
  'no-func-assign': 'error',
  'getter-return': 'error',
  'no-async-promise-executor': 'warn',
  'no-loss-of-precision': 'error',
  'no-compare-neg-zero': 'error',
};

export default [
  { ignores: ['public/vendor/**', 'node_modules/**', '.wrangler/**', 'test-results/**', 'playwright-report/**'] },
  {
    files: ['public/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.serviceworker } },
    rules,
  },
  {
    files: ['worker/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.serviceworker, ...globals.node } },
    rules,
  },
  {
    files: ['tests/**/*.js', '*.config.js', '*.config.mjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules,
  },
];
