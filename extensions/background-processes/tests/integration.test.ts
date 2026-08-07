import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalBashOperations } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, test } from "vitest";
import { BackgroundTaskRegistry } from "../src/registry.js";

const temporaryDirectories: string[] = [];
const registries: BackgroundTaskRegistry[] = [];

afterEach(async () => {
  await Promise.all(registries.splice(0).map((registry) => registry.shutdown()));
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function setup() {
  const notifications: string[] = [];
  const registry = new BackgroundTaskRegistry(createLocalBashOperations(), (task) => notifications.push(task.id));
  registries.push(registry);
  return { notifications, registry };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe.runIf(process.platform !== "win32")("local Bash integration", () => {
  test("runs without blocking launch and returns output through wait", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-bg-integration-"));
    temporaryDirectories.push(root);
    const { notifications, registry } = setup();

    const startedAt = Date.now();
    const task = registry.run({
      name: "Delayed output",
      command: "printf 'start\\n'; sleep 0.1; printf 'done\\n'",
      cwd: root,
    });
    expect(Date.now() - startedAt).toBeLessThan(100);

    const result = await registry.wait({ taskIds: [task.id] });

    expect(result.tasks).toMatchObject([{ status: "completed", exitCode: 0 }]);
    expect(result.outputs[0]?.output.content).toBe("start\ndone\n");
    expect(notifications).toEqual([]);
  });

  test("applies the background command timeout", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-bg-integration-"));
    temporaryDirectories.push(root);
    const { registry } = setup();
    const task = registry.run({ name: "Timeout", command: "sleep 5", cwd: root, timeoutSeconds: 0.05 });

    const result = await registry.wait({ taskIds: [task.id] });

    expect(result.tasks).toMatchObject([{ status: "timed_out" }]);
    expect(result.tasks[0]?.error).toContain("timed out after 0.05 seconds");
  });

  test("kill removes ordinary descendants in the task process group", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-bg-integration-"));
    temporaryDirectories.push(root);
    const marker = join(root, "escaped-marker");
    const { registry } = setup();
    const task = registry.run({
      name: "Tree",
      command: `(sleep 0.3; printf orphan > ${shellQuote(marker)}) & wait`,
      cwd: root,
    });
    await delay(50);

    const killed = await registry.kill(task.id);
    await delay(400);

    expect(killed.status).toBe("killed");
    await expect(access(marker)).rejects.toThrow();
  });
});
