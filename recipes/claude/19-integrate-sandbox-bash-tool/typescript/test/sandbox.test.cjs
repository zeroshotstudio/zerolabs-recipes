const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { SandboxedBashRunner } = require('../dist/index.js');

test('host fallback and invalid limits are rejected', () => {
  assert.throws(() => new SandboxedBashRunner({ useDocker: false }), /Host shell execution is disabled/);
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: NaN }, { timeoutMs: 120001 }, { maxOutputBytes: -1 }, { workingDirectory: '/' }]) {
    assert.throws(() => new SandboxedBashRunner(options));
  }
});

test('missing daemon cannot execute on host and restart preserves inputs', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-ts-test-'));
  try {
    const marker = path.join(root, 'must-not-exist');
    const runner = new SandboxedBashRunner({ workingDirectory: root, dockerSocket: path.join(root, 'absent.sock') });
    const result = await runner.execute(`touch '${marker}'`);
    assert.equal(result.isError, true);
    assert.notEqual(result.exitCode, 0);
    assert.equal(fs.existsSync(marker), false);
    fs.writeFileSync(marker, 'retained');
    assert.equal((await runner.execute('', true)).exitCode, 0);
    assert.equal(fs.readFileSync(marker, 'utf8'), 'retained');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('delayed daemon creation after deadline never starts model work or claims confirmed cleanup', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-delayed-create-'));
  const originalPath = process.env.PATH;
  try {
    const metadata = path.join(root, 'late-created');
    const started = path.join(root, 'model-started');
    const calls = path.join(root, 'calls');
    fs.writeFileSync(path.join(root, 'docker'), `#!/usr/bin/env node
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const operation = process.argv[3];
fs.appendFileSync(${JSON.stringify(calls)}, operation + '\\n');
if (operation === 'create') {
  const late = spawn(process.execPath, ['-e', 'setTimeout(() => require("node:fs").writeFileSync(process.argv[1], "created"), 800)', ${JSON.stringify(metadata)}], { detached: true, stdio: 'ignore' });
  late.unref();
  setTimeout(() => {}, 30000);
} else if (operation === 'start') fs.writeFileSync(${JSON.stringify(started)}, 'unsafe model execution');
else if (operation === 'rm' || operation === 'inspect') process.exitCode = 1;
`);
    fs.chmodSync(path.join(root, 'docker'), 0o755);
    process.env.PATH = root + path.delimiter + originalPath;
    const result = await new SandboxedBashRunner({ timeoutMs: 100 }).execute('echo untrusted-model-command');
    assert.equal(result.exitCode, 124, result.output);
    assert.match(result.output, /No command started/);
    assert.match(result.output, /Creation cleanup cannot be confirmed/);
    assert.equal(fs.readFileSync(calls, 'utf8').split('\n').includes('start'), false);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    assert.equal(fs.existsSync(metadata), true);
    assert.equal(fs.existsSync(started), false);
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const live = { skip: process.env.RUN_SANDBOX_DOCKER_TESTS !== '1' };

test('container prevents host/symlink reads and host/root writes', live, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox-ts-test-'));
  try {
    const marker = path.join(root, 'private-marker');
    const inputs = path.join(root, 'inputs');
    fs.mkdirSync(inputs);
    fs.chmodSync(root, 0o755);
    fs.chmodSync(inputs, 0o755);
    fs.writeFileSync(marker, 'HOST_SECRET_MARKER');
    fs.writeFileSync(path.join(inputs, 'allowed.txt'), 'allowed-input');
    fs.symlinkSync(marker, path.join(inputs, 'escape'));
    const runner = new SandboxedBashRunner({ workingDirectory: inputs });
    assert.equal((await runner.execute('cat /inputs/allowed.txt')).output, 'allowed-input');
    for (const command of [`cat '${marker}'`, 'cat /inputs/escape', 'echo changed > /inputs/allowed.txt', 'touch /etc/host-write']) {
      const result = await runner.execute(command);
      assert.equal(result.isError, true, command);
      assert.doesNotMatch(result.output, /HOST_SECRET_MARKER/);
    }
    assert.equal(fs.readFileSync(path.join(inputs, 'allowed.txt'), 'utf8'), 'allowed-input');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('unprivileged user, disabled networking, memory/CPU/PID/storage limits are real', live, async () => {
  const runner = new SandboxedBashRunner();
  const result = await runner.execute("id -u; cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.swap.max /sys/fs/cgroup/pids.max /sys/fs/cgroup/cpu.max; df -k /workspace | tail -1 | awk '{print $2}'; ulimit -f; ulimit -n");
  assert.equal(result.exitCode, 0, result.output);
  const values = result.output.trim().split('\n');
  assert.notEqual(values[0], '0');
  assert.deepEqual(values.slice(1), ['134217728', '0', '64', '50000 100000', '65536', '16384', '256']);
  assert.equal((await runner.execute('echo probe > /dev/tcp/1.1.1.1/443')).isError, true);
  assert.equal((await runner.execute('echo scratch > /workspace/example')).exitCode, 0);
  assert.equal((await runner.execute('test ! -e /workspace/example')).exitCode, 0);
});

test('Unicode stdout/stderr share a byte cap; timeout stops descendant containers', live, async () => {
  for (const [options, command, expected] of [
    [{ maxOutputBytes: 512 }, "echo $HOSTNAME >&2; yes '😀' >&2", 125],
    [{ timeoutMs: 1000 }, 'echo $HOSTNAME; sleep 30 & wait', 124],
  ]) {
    const start = Date.now();
    const result = await new SandboxedBashRunner(options).execute(command);
    assert.equal(result.exitCode, expected, result.output);
    assert.equal(result.isError, true);
    assert.ok(Buffer.byteLength(result.output) <= (options.maxOutputBytes ?? 65536));
    assert.ok(Date.now() - start < 7000);
    const id = result.output.split('\n')[0];
    assert.match(id, /^[a-f0-9]{12}$/);
    assert.notEqual(spawnSync('docker', ['--host=unix:///var/run/docker.sock', 'inspect', id], { stdio: 'ignore' }).status, 0);
  }
});
