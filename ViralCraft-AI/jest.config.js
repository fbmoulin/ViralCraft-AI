/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: [
    'services/**/*.js',
    'middleware/**/*.js',
    'routes/**/*.js',
    'utils/**/*.js',
    '!**/node_modules/**'
  ],
  coverageThreshold: {
    global: {
      statements: 20,
      branches: 15,
      functions: 20,
      lines: 20
    }
  },
  coverageReporters: ['text', 'lcov', 'html'],
  testTimeout: 15000,
  setupFilesAfterEach: [],
  clearMocks: true,
  verbose: true
};
