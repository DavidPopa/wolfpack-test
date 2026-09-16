#!/usr/bin/env node

function deny(reason) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } })}\n`);
}

let event;
try {
  event = JSON.parse(await new Promise((resolve) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { input += chunk; });
    process.stdin.on("end", () => resolve(input));
  }));
} catch {
  deny("Malformed hook payload blocked by repository policy.");
  process.exit(0);
}

if (!event || !["Bash", "apply_patch"].includes(event.tool_name)) process.exit(0);
const command = event.tool_input?.command;
if (typeof command !== "string") {
  deny("Tool call without inspectable command blocked by repository policy.");
  process.exit(0);
}

const normalized = command.replace(/\\\s*\n/g, " ").replace(/\s+/g, " ").trim();
const destructiveGit = /(?:^|[;&|]\s*)git\b[^;&|\n]*(?:\b(?:commit|push|merge|rebase|cherry-pick)\b|\breset\s+--hard\b|\bclean\s+-[^\s;&|]*[fd])/i;
const destructiveDatabase = /\b(?:dropdb\b|prisma\s+(?:migrate\s+reset|db\s+push\s+[^;&|]*--force-reset)|redis-cli\s+[^;&|]*flush(?:all|db)\b|(?:drop\s+(?:database|schema|table)|truncate\s+table)\b)/i;
const destructiveDocker = /\bdocker\s+(?:volume\s+(?:rm|prune)\b|system\s+prune\b|compose\s+[^;&|]*down\b[^;&|]*\s(?:-v|--volumes)\b)/i;
const envFile = String.raw`(?:[^\s"';&|]+[\\/])*\.env(?:\.[A-Za-z0-9_-]+)*`;
const allowedExample = /\.env(?:\.test)?\.example$/i;
const redirectionTarget = new RegExp(String.raw`>{1,2}\s*["']?(${envFile})["']?`, "gi");
const writerCommand = new RegExp(String.raw`\b(?:tee|cp|mv|install|touch)\b([^;&|\n]*)`, "gi");
const envArgument = new RegExp(String.raw`(?:^|\s)["']?(${envFile})["']?(?=\s|$)`, "gi");
const patchTarget = new RegExp(String.raw`\*\*\* (?:Add|Update) File:\s+(${envFile})\s*$`, "gim");

function hasRealTarget(input, pattern) {
  pattern.lastIndex = 0;
  return [...input.matchAll(pattern)].some((match) => !allowedExample.test(match[1]));
}

function writesRealEnvironmentFile(input) {
  if (hasRealTarget(input, redirectionTarget) || hasRealTarget(input, patchTarget)) return true;
  writerCommand.lastIndex = 0;
  return [...input.matchAll(writerCommand)].some((commandMatch) => hasRealTarget(commandMatch[1], envArgument));
}

let reason;
if (destructiveGit.test(normalized)) reason = "Agent Git mutation blocked; commits and integration operations are developer-owned.";
else if (destructiveDatabase.test(normalized)) reason = "Destructive database operation blocked by repository policy.";
else if (destructiveDocker.test(normalized)) reason = "Destructive Docker or volume operation blocked by repository policy.";
else if (writesRealEnvironmentFile(command)) reason = "Writing a real environment/secret file is blocked; use an example file with dummy values.";

if (reason) deny(reason);
