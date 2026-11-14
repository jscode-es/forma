const assert = require("node:assert/strict");
const { after, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const processes = require("node:child_process");

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "forma-job-queue-"));
const originalLoad = Module._load;
Module._load = function (id, ...args) {
  if (id === "electron") return { app: { getPath: () => temporary, getAppPath: () => process.cwd() }, BrowserWindow: { getAllWindows: () => [] } };
  return originalLoad.call(this, id, ...args);
};
const database = require("../../dist-electron/db.js");
const engines = require("../../dist-electron/engines.js");
const { jobs } = require("../../dist-electron/jobs.js");
Module._load = originalLoad;
database.openDb(path.join(temporary, "test.db"));
const flush = () => new Promise((resolve) => setImmediate(resolve));
const engine = {
  dir: temporary,
  info: { available: true },
  manifest: { id: "queue-test", version: "1", tasks: ["mesh-inspect"], parameters: [], weights: [], runtime: { type: "node", entry: "worker.js" }, timeoutSeconds: 10, inputs: { images: { min: 0, max: 0 }, models: { min: 0, max: 0 }, videos: { min: 0, max: 0 }, views: [] } },
};
const request = { engineId: "queue-test", task: "mesh-inspect", projectId: null, parameters: {}, images: [], models: [] };

async function scenario(check, delayCommand = false) {
  const runner = new jobs.constructor();
  const oldList = engines.listEngines;
  const oldSpawn = processes.spawn;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let calls = 0;
  const children = [];
  let active = 0;
  let maximum = 0;
  engines.listEngines = async () => {
    calls++;
    if (!delayCommand && (calls === 2 || calls === 4)) await gate;
    return [engine];
  };
  if (delayCommand) {
    const command = runner.command.bind(runner);
    runner.command = async (installed) => {
      await gate;
      return command(installed);
    };
  }
  processes.spawn = () => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), exitCode: null });
    children.push(child);
    maximum = Math.max(maximum, ++active);
    return child;
  };
  function close(child) {
    if (child.exitCode !== null) return;
    active--;
    child.exitCode = 0;
    child.stdout.end();
    child.stderr.end();
    child.emit("close", 0);
  }
  try {
    await check({ runner, release, children, close, maximum: () => maximum });
  } finally {
    runner.shutdown();
    database.getDb().prepare("UPDATE jobs SET status = 'cancelled' WHERE status = 'queued'").run();
    release();
    await flush();
    children.forEach(close);
    await flush();
    engines.listEngines = oldList;
    processes.spawn = oldSpawn;
  }
}

test("cancelling during discovery never starts or revives a queued job", async () => {
  await scenario(async ({ runner, release, children }) => {
    const job = await runner.enqueue(request);
    runner.cancel(job.id);
    release();
    await flush();
    assert.equal(children.length, 0);
    assert.equal(runner.list().find((item) => item.id === job.id).status, "cancelled");
  });
});

test("two enqueues reserve a single startup slot and spawn serially", async () => {
  await scenario(async ({ runner, release, children, close, maximum }) => {
    await runner.enqueue(request);
    await runner.enqueue(request);
    release();
    await flush();
    assert.equal(children.length, 1);
    close(children[0]);
    await flush();
    assert.equal(children.length, 2);
    assert.equal(maximum(), 1);
    close(children[1]);
  });
});

test("shutdown during discovery prevents startup and further pumping", async () => {
  await scenario(async ({ runner, release, children }) => {
    await runner.enqueue(request);
    runner.shutdown();
    release();
    await flush();
    assert.equal(children.length, 0);
    runner.recover();
    await flush();
    assert.equal(children.length, 0);
  });
});

test("cancelling while resolving the runtime prevents spawn", async () => {
  await scenario(async ({ runner, release, children }) => {
    const job = await runner.enqueue(request);
    await flush();
    runner.cancel(job.id);
    release();
    await flush();
    assert.equal(children.length, 0);
    assert.equal(runner.list().find((item) => item.id === job.id).status, "cancelled");
  }, true);
});

test("shutdown while resolving the runtime prevents spawn", async () => {
  await scenario(async ({ runner, release, children }) => {
    await runner.enqueue(request);
    await flush();
    runner.shutdown();
    release();
    await flush();
    assert.equal(children.length, 0);
  }, true);
});

test("a child closing after shutdown never starts the next queued job", async () => {
  await scenario(async ({ runner, release, children, close }) => {
    await runner.enqueue(request);
    await runner.enqueue(request);
    release();
    await flush();
    assert.equal(children.length, 1);
    runner.shutdown();
    close(children[0]);
    await flush();
    assert.equal(children.length, 1);
  });
});

after(() => {
  database.getDb().close();
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(temporary).startsWith("forma-job-queue-"));
  fs.rmSync(temporary, { recursive: true, force: true });
});
