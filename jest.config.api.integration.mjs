export default {
  displayName: "api-integration",
  testEnvironment: "node",
  roots: ["<rootDir>/apps/api/src"],
  testMatch: ["**/*.integration.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: { "^.+\\.ts$": ["@swc/jest", { jsc: { parser: { syntax: "typescript" }, target: "es2023" }, module: { type: "es6" } }] },
  moduleNameMapper: { "^@map-chat/contracts$": "<rootDir>/packages/contracts/src/index.ts", "^(\\.{1,2}/.*)\\.js$": "$1" },
  testTimeout: 10000,
  maxWorkers: 1
};
