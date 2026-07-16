const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const COLORS = {
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  debug: '\x1b[35m', // Magenta
  reset: '\x1b[0m',
};

function formatTimestamp() {
  return new Date().toISOString();
}

function formatMessage(level, message, meta = null) {
  const timestamp = formatTimestamp();
  const color = COLORS[level] || '';
  const reset = COLORS.reset;

  let formatted = `${timestamp} [${color}${level.toUpperCase()}${reset}] ${message}`;

  if (meta) {
    if (meta instanceof Error) {
      formatted += `\n${meta.stack}`;
    } else if (typeof meta === 'object') {
      formatted += `\n${JSON.stringify(meta, null, 2)}`;
    } else {
      formatted += `\n${meta}`;
    }
  }

  return formatted;
}

function log(level, message, meta = null) {
  if (LEVELS[level] > LEVELS[LOG_LEVEL]) {
    return;
  }

  const formatted = formatMessage(level, message, meta);

  // Console output
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](formatted);

  // File output
  const logFile = path.join(LOG_DIR, `${level}.log`);
  fs.appendFileSync(logFile, formatted + '\n', 'utf8');
}

module.exports = {
  logger: {
    error: (msg, meta) => log('error', msg, meta),
    warn: (msg, meta) => log('warn', msg, meta),
    info: (msg, meta) => log('info', msg, meta),
    debug: (msg, meta) => log('debug', msg, meta),
  },
};
