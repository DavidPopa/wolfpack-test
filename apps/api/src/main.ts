import { startApi } from "./runtime.js";

async function start(): Promise<void> {
  const running = await startApi(process.env);
  process.stdout.write(`API listening on port ${running.port}\n`);
  const stop = (): void => {
    void running.shutdown().then(
      () => process.exit(0),
      () => {
        process.stderr.write("API shutdown failed\n");
        process.exit(1);
      }
    );
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "unknown startup error";
  process.stderr.write(`API failed to start: ${message}\n`);
  process.exitCode = 1;
});
