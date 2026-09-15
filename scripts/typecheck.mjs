// Per-package typecheck orchestrator.
//
// Packages that ship their own upstream/native tsconfig are checked with it,
// because the root config (bundler resolution, different lib/target) produces
// hundreds of diagnostics that do not exist under their native configs:
//   packages/pi-workflow             -> its own tsconfig.json (strict NodeNext)
//   packages/pi-agent-browser-native  -> its own tsconfig.json (upstream)
//   packages/omp-best-of              -> its own check:types script
//   packages/pi-tasks                 -> its own tsconfig.json (upstream)
//   packages/omp-undo-redo            -> its own tsconfig.json (upstream)
// Every other package (omp-model-router, gsd-omp, omp-edit-committer,
// omp-kafka) is checked by the root tsconfig, which excludes the five above so
// nothing is double-checked and nothing is skipped.
// (pi-tasks and omp-undo-redo were moved to native after their root-config
// diagnostics proved to be resolution artifacts absent under their native
// configs; both native tsconfigs are green.)
// Fails fast: the first failing step aborts with its output.

import { execSync } from 'node:child_process';

const steps = [
  { name: 'pi-workflow', dir: 'packages/pi-workflow', cmd: 'bunx tsc --noEmit' },
  { name: 'pi-agent-browser-native', dir: 'packages/pi-agent-browser-native', cmd: 'bunx tsc -p tsconfig.json --noEmit' },
  { name: 'omp-best-of', dir: 'packages/omp-best-of', cmd: 'bun run check:types' },
  { name: 'pi-tasks', dir: 'packages/pi-tasks', cmd: 'bunx tsc -p tsconfig.json --noEmit' },
  { name: 'omp-undo-redo', dir: 'packages/omp-undo-redo', cmd: 'bunx tsc --noEmit' },
  { name: 'root (remaining packages)', dir: '.', cmd: 'bunx tsc --noEmit -p tsconfig.json' },
];

let failed = false;
for (const step of steps) {
  console.log('--- typecheck: ' + step.name);
  try {
    execSync(step.cmd, { cwd: step.dir, stdio: 'inherit' });
    console.log('ok: ' + step.name);
  } catch {
    console.error('FAILED: ' + step.name);
    failed = true;
    break;
  }
}
if (failed) process.exit(1);
console.log('typecheck: all packages passed');
