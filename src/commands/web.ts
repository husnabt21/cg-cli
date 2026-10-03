import { exec } from 'child_process';
import { startServer } from '../web/server';
import { runDashboard } from './dashboard';

function openBrowser(url: string): void {
  const command =
    process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(command, () => {
    // Ignored: the URL is printed in the terminal anyway.
  });
}

export async function runWebDashboard(args: string[]): Promise<void> {
  let port = 3000;
  let open = true;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--terminal') {
      runDashboard(); // the previous terminal dashboard is preserved
      return;
    } else if (arg === '--no-open') {
      open = false;
    } else if (arg === '--port' || arg.startsWith('--port=')) {
      const value = arg === '--port' ? args[++i] : arg.slice('--port='.length);
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        console.error('--port must be a whole number between 1 and 65535.');
        process.exitCode = 1;
        return;
      }
      port = parsed;
    } else {
      console.error(`Unknown option: ${arg}\nUsage: cg dashboard [--port N] [--no-open] [--terminal]`);
      process.exitCode = 1;
      return;
    }
  }

  const server = startServer(port);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Try: cg dashboard --port ${port + 1}`);
    } else {
      console.error('Dashboard server error:', err.message);
    }
    process.exitCode = 1;
  });

  server.on('listening', () => {
    const url = `http://localhost:${port}`;
    console.log('CG Context Optimizer Dashboard\n');
    console.log('Running locally:');
    console.log(url + '\n');
    console.log('Press Ctrl+C to stop.');
    if (open) openBrowser(url);
  });
}