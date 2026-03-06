#!/usr/bin/env node
/**
 * Auto-Tmux Dev Hook - Start dev servers in tmux automatically
 *
 * Cross-platform (Windows, macOS, Linux)
 *
 * Runs before Bash tool use. If command is a dev server (npm run dev, pnpm dev, yarn dev, bun run dev),
 * transforms it to run in a tmux session named after the current directory.
 *
 * Benefits:
 * - Dev server runs detached (doesn't block Claude Code)
 * - Session persists (can run `tmux capture-pane -t <session> -p` to see logs)
 * - Session name matches project directory (allows multiple projects simultaneously)
 *
 * Session management:
 * - Kills any existing session with the same name (clean restart)
 * - Creates new detached session
 * - Reports session name and how to view logs
 */

const path = require('path');
const { execFileSync } = require('child_process');

const MAX_STDIN = 1024 * 1024; // 1MB limit
let data = '';
process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
  if (data.length < MAX_STDIN) {
    const remaining = MAX_STDIN - data.length;
    data += chunk.substring(0, remaining);
  }
});

process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const cmd = input.tool_input?.command || '';

    // Detect dev server commands: npm run dev, pnpm dev, yarn dev, bun run dev
    // Use word boundary (\b) to avoid matching partial commands
    const devServerRegex = /(npm run dev\b|pnpm( run)? dev\b|yarn dev\b|bun run dev\b)/;

    if (process.platform !== 'win32' && devServerRegex.test(cmd)) {
      // Get session name from current directory basename
      // e.g., /home/user/Portfolio → "Portfolio", /home/user/my-app-v2 → "my-app-v2"
      const sessionName = path.basename(process.cwd());

      // Build the transformed command:
      // 1. Kill existing session (silent if doesn't exist)
      // 2. Create new detached session with the dev command
      // 3. Echo confirmation message with instructions for viewing logs
      const transformedCmd = `SESSION="${sessionName}"; tmux kill-session -t "$SESSION" 2>/dev/null || true; tmux new-session -d -s "$SESSION" '${cmd}' && echo "[Hook] Dev server started in tmux session '\${SESSION}'. View logs: tmux capture-pane -t \${SESSION} -p -S -100"`;

      input.tool_input.command = transformedCmd;
    }
  } catch {
    // Invalid input — pass through
  }

  process.stdout.write(JSON.stringify(input));
  process.exit(0);
});
