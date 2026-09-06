module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/scripts/validation/__tests__'],
  testMatch: ['**/*.test.ts'],
};
