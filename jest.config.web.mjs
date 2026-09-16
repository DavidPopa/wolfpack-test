export default {
  displayName: "web", testEnvironment: "jsdom", roots: ["<rootDir>/apps/web"], testMatch: ["**/*.test.tsx"],
  modulePathIgnorePatterns: ["<rootDir>/apps/web/.next/"],
  setupFilesAfterEnv: ["<rootDir>/apps/web/test/setup.ts"], extensionsToTreatAsEsm: [".ts", ".tsx"],
  transform: { "^.+\\.(t|j)sx?$": ["@swc/jest", { jsc: { parser: { syntax: "typescript", tsx: true }, transform: { react: { runtime: "automatic" } }, target: "es2023" }, module: { type: "es6" } }] },
  moduleNameMapper: { "^@map-chat/contracts$": "<rootDir>/packages/contracts/src/index.ts", "^@/(.*)$": "<rootDir>/apps/web/$1", "^.+\\.css$": "<rootDir>/apps/web/test/style-mock.mjs", "^(\\.{1,2}/.*)\\.js$": "$1" }
};
