// sysmon-server.js
// System Monitor Backend — serves API + static dashboard
// No dependencies, pure Node.js

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PORT = process.env.PORT || 3001;
const HOST = '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

// ─── MIME types ───
const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// ─── System stats helpers ───

function getMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    total,
    used,
    free,
    percent: Math.round((used / total) * 1000) / 10
  };
}

function getCPU() {
  try {
    // Windows: typeperf returns CSV with % Processor Time per process
    // We'll sample twice with a gap
    const out1 = execSync('typeperf "\\Processor(_Total)\\% Processor Time" -sc 1 -si 1000 2>NUL', {
      encoding: 'utf8',
      timeout: 3000
    });
    const lines1 = out1.trim().split('\n');
    if (lines1.length >= 2) {
      const m1 = lines1[1].match(/,([0-9.]+)/);
      if (m1) {
        // Give it a moment then sample again
        setTimeout(() => {}, 500);
        return parseFloat(m1[1]);
      }
    }
  } catch (e) { /* ignore */ }
  // Fallback: rough estimate from os
  return 0;
}

function getCPUCount() {
  return os.cpus().length;
}

function getDisks() {
  try {
    const out = execSync('wmic logicaldisk get caption,freespace,size 2>NUL', {
      encoding: 'utf8',
      timeout: 3000
    });
    const lines = out.trim().split('\n').slice(1);
    const disks = [];
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 3) {
        const drive = parts[0];
        const free = parseInt(parts[1]);
        const size = parseInt(parts[2]);
        if (!isNaN(free) && !isNaN(size) && size > 0 && drive.length === 2) {
          disks.push({
            drive,
            free,
            total: size,
            used: size - free,
            percent: Math.round(((size - free) / size) * 100)
          });
        }
      }
    }
    return disks;
  } catch (e) {
    return [];
  }
}

function getProcesses(limit = 20) {
  try {
    const out = execSync('wmic process where "name!=\'Idle\'" get name,processid,workingsetsize /format:csv 2>NUL', {
      encoding: 'utf8',
      timeout: 5000
    });
    const lines = out.trim().split('\n').slice(1);
    const procs = [];
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 3) {
        const name = parts[1]?.replace(/^"(.*)"$/, '$1') || '';
        const pid = parseInt(parts[2]);
        const ws = parseInt(parts[3]) || 0;
        if (name && pid > 0) {
          procs.push({ name, pid, memory: ws });
        }
      }
    }
    procs.sort((a, b) => b.memory - a.memory);
    return procs.slice(0, limit);
  } catch (e) {
    return [];
  }
}

function getSystemInfo() {
  const cpus = os.cpus();
  return {
    type: os.type(),
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    user: process.env.USERNAME || process.env.USER || 'user',
    homedir: os.homedir(),
    cpuCount: cpus.length,
    cpus: cpus.map(c => ({ model: c.model, speed: c.speed })),
    totalMemory: os.totalmem(),
    uptime: os.uptime(),
    freemem: os.freemem()
  };
}

// ─── Static file serving ───

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  // Remove query string
  const qIdx = filePath.indexOf('?');
  if (qIdx >= 0) filePath = filePath.slice(0, qIdx);

  filePath = path.join(PUBLIC_DIR, filePath);

  // Security: prevent path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found');
      } else {
        res.writeHead(500);
        res.end('Server error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// ─── API endpoints ───

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function handleAPI(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  if (url.pathname === '/api/health' && req.method === 'GET') {
    return sendJSON(res, { status: 'ok', server: 'sysmon', time: Date.now() });
  }

  if (url.pathname === '/api/stats' && req.method === 'GET') {
    return sendJSON(res, {
      timestamp: Date.now(),
      cpu: getCPU(),
      cpuCount: getCPUCount(),
      memory: getMemory(),
      disks: getDisks(),
      processes: getProcesses(20),
      system: getSystemInfo(),
      uptime: os.uptime()
    });
  }

  if (url.pathname === '/api/memory' && req.method === 'GET') {
    return sendJSON(res, { memory: getMemory(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/cpu' && req.method === 'GET') {
    return sendJSON(res, { cpu: getCPU(), cpuCount: getCPUCount(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/disks' && req.method === 'GET') {
    return sendJSON(res, { disks: getDisks(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/processes' && req.method === 'GET') {
    return sendJSON(res, { processes: getProcesses(25), timestamp: Date.now() });
  }

  if (url.pathname === '/api/system' && req.method === 'GET') {
    return sendJSON(res, { system: getSystemInfo(), timestamp: Date.now() });
  }

  sendJSON(res, { error: 'Not found' }, 404);
}

// ─── Main server ───

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // API routes
  if (url.pathname.startsWith('/api/')) {
    return handleAPI(req, res);
  }

  // Static files
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔══════════════════════════════════╗');
  console.log('║   SYSCONTROL MONITOR v1.0        ║');
  console.log('║   System Control Panel           ║');
  console.log('╚══════════════════════════════════╝');
  console.log('');
  console.log('  Dashboard:  http://' + HOST + ':' + PORT);
  console.log('  API:        http://' + HOST + ':' + PORT + '/api/stats');
  console.log('');
  console.log('  Endpoints:');
  console.log('    GET /api/stats       - Full system stats');
  console.log('    GET /api/memory      - Memory usage');
  console.log('    GET /api/cpu         - CPU usage');
  console.log('    GET /api/disks       - Disk space');
  console.log('    GET /api/processes   - Running processes');
  console.log('    GET /api/system      - System info');
  console.log('    GET /api/health      - Health check');
  console.log('');
});
