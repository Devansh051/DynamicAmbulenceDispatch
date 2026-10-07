export default {
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/databaseSafety.setup.js'],
  testTimeout: 30000
};
