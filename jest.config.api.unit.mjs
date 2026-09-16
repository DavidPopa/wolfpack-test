export default {
  displayName: "api-unit",
  testEnvironment: "node",
  roots: ["<rootDir>/apps/api/src"],
  testMatch: ["**/*.unit.test.ts"],
  extensionsToTreatAsEsm: [".ts"],
  transform: { "^.+\\.ts$": ["@swc/jest", { jsc: { parser: { syntax: "typescript" }, target: "es2023" }, module: { type: "es6" } }] },
  moduleNameMapper: { "^@map-chat/contracts$": "<rootDir>/packages/contracts/src/index.ts", "^(\\.{1,2}/.*)\\.js$": "$1" },
  collectCoverageFrom: ["apps/api/src/**/*.ts", "!apps/api/src/**/*.test.ts", "!apps/api/src/main.ts"]
};
