module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
    jest: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'script'
  },
  extends: ['eslint:recommended', 'prettier'],
  rules: {
    // Legacy code uses console heavily; warn (not error) so CI doesn't fail
    // while we migrate to the structured logger incrementally.
    'no-console': 'warn',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'no-useless-escape': 'warn',
    'no-prototype-builtins': 'warn',
    'no-case-declarations': 'warn',
    'no-misleading-character-class': 'warn',
    'no-inner-declarations': 'warn',
    'no-undef': 'error',
    'no-process-exit': 'off',
    'prefer-const': 'warn',
    eqeqeq: ['error', 'smart']
  },
  overrides: [
    {
      files: ['static/js/**/*.js', 'public/**/*.js'],
      env: { browser: true, node: false, commonjs: true },
      // showNotification is defined in modernized-app.js and used by cache-loader.js
      globals: { showNotification: 'readonly' }
    }
  ],
  ignorePatterns: [
    'node_modules/',
    'logs/',
    'static/js/*.min.js',
    'coverage/',
    'database.sqlite',
    'soulclap.db'
  ]
};
