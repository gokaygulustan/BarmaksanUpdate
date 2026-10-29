import { spawn } from 'child_process';

const children = [];

function run(name, command, args, env = {}) {
  const child = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: 'inherit',
    shell: true,
  });
  child.on('exit', (code, signal) => {
    console.error(`[${name}] exited code=${code} signal=${signal}`);
    for (const c of children) {
      if (c !== child && !c.killed) c.kill('SIGTERM');
    }
    process.exit(code ?? 1);
  });
  children.push(child);
  return child;
}

const webPort = process.env.PORT || '3000';
const apiPort = process.env.API_PORT || '4000';

run('api', 'npm', ['run', 'start', '--workspace=apps/api'], {
  PORT: String(apiPort),
});

run('web', 'npm', ['run', 'start', '--workspace=apps/web'], {
  PORT: String(webPort),
  API_INTERNAL_ORIGIN: process.env.API_INTERNAL_ORIGIN || `http://127.0.0.1:${apiPort}`,
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const c of children) {
      if (!c.killed) c.kill(sig);
    }
  });
}
