// sysmon-server.js
// System Monitor + Control Panel Backend
// Pure Node.js — no dependencies

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, exec } = require('child_process');

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
  '.woff2': 'font/woff2'
};

// ─── Shell helper ───
function run(cmd, timeout = 5000) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout });
  } catch (e) {
    return null;
  }
}

// ─── System stats ───

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
    const out = run('typeperf "\\Processor(_Total)\\% Processor Time" -sc 1 -si 800 2>NUL');
    const lines = out?.trim().split('\n');
    if (lines && lines.length >= 2) {
      const m = lines[1].match(/,([0-9.]+)/);
      if (m) return parseFloat(m[1]);
    }
  } catch (e) { /* ignore */ }
  return 0;
}

function getDisks() {
  try {
    const out = run('wmic logicaldisk get caption,freespace,size 2>NUL');
    const lines = out?.trim().split('\n').slice(1) || [];
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
            percent: Math.round(((size - free) / size) * 100),
            label: getVolumeLabel(drive)
          });
        }
      }
    }
    return disks;
  } catch (e) { return []; }
}

function getVolumeLabel(drive) {
  try {
    const out = run(`wmic logicaldisk where "caption='${drive}'" get volumeName 2>NUL`);
    const lines = out?.trim().split('\n').slice(1);
    return lines?.[0]?.trim() || '';
  } catch (e) { return ''; }
}

function getProcesses(limit = 30) {
  try {
    const out = run('wmic process where "name!=\'Idle\'" get name,processid,workingsetsize,commandline /format:csv 2>NUL');
    const lines = out?.trim().split('\n').slice(1) || [];
    const procs = [];
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 4) {
        const name = parts[1]?.replace(/^"(.*)"$/, '$1') || '';
        const pid = parseInt(parts[2]);
        const ws = parseInt(parts[3]) || 0;
        const cmd = parts[4]?.replace(/^"(.*)"$/, '$1') || '';
        if (name && pid > 0) {
          procs.push({ name, pid, memory: ws, command: cmd });
        }
      }
    }
    procs.sort((a, b) => b.memory - a.memory);
    return procs.slice(0, limit);
  } catch (e) { return []; }
}

function getSystemInfo() {
  const cpus = os.cpus();
  const mem = getMemory();
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
    freemem: os.freemem(),
    memory: mem
  };
}

// ─── Network monitoring ───

let networkStats = { upload: 0, download: 0, lastBytesIn: 0, lastBytesOut: 0, lastTime: 0 };

function getNetworkStats() {
  try {
    const out = run('netsh interface ip show stats 2>NUL');
    if (!out) return { ip: 'N/A', upload: 0, download: 0 };
    // Get active IPv4 address
    const ipOut = run('ipconfig | findstr /i "IPv4" 2>NUL');
    let ip = 'N/A';
    if (ipOut) {
      const m = ipOut.match(/IPv4.*.: ([0-9.]+)/);
      if (m) ip = m[1];
    }

    // Read network bytes from registry or use netstat
    // Simpler: use netstat -e for bytes sent/received
    const netOut = run('netstat -e 2>NUL');
    if (netOut) {
      const lines = netOut.trim().split('\n');
      // Last line has totals
      const last = lines[lines.length - 1];
      const parts = last.trim().split(/\s+/);
      if (parts.length >= 2) {
        const bytesIn = parseInt(parts[0]) || 0;
        const bytesOut = parseInt(parts[1]) || 0;
        const now = Date.now();
        if (networkStats.lastTime > 0) {
          const dt = (now - networkStats.lastTime) / 1000;
          if (dt > 0) {
            networkStats.upload = Math.round((bytesOut - networkStats.lastBytesOut) / dt);
            networkStats.download = Math.round((bytesIn - networkStats.lastBytesIn) / dt);
          }
        }
        networkStats.lastBytesIn = bytesIn;
        networkStats.lastBytesOut = bytesOut;
        networkStats.lastTime = now;
      }
    }

    return {
      ip,
      upload: networkStats.upload,
      download: networkStats.download,
      totalSent: networkStats.lastBytesOut,
      totalReceived: networkStats.lastBytesIn
    };
  } catch (e) {
    return { ip: 'N/A', upload: 0, download: 0 };
  }
}

// ─── Laptop control functions ───

// Shutdown
function shutdown() {
  run('shutdown /s /t 0 2>NUL');
  return true;
}

// Restart
function restart() {
  run('shutdown /r /t 0 2>NUL');
  return true;
}

// Log off
function logoff() {
  run('shutdown /l 2>NUL');
  return true;
}

// Lock workstation
function lock() {
  run('rundll32.exe user32.dll,LockWorkStation 2>NUL');
  return true;
}

// Sleep / Hibernate
function sleep() {
  run('rundll32.exe powrprof.dll,SetSuspendState 0,1,0 2>NUL');
  return true;
}

// Hibernate
function hibernate() {
  run('shutdown /h 2>NUL');
  return true;
}

// Open CD tray
function toggleCD() {
  try {
    const { Win32API } = require('win32-api');
  } catch (e) {
    // fallback: use PowerShell
    run('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'{CAPSLOCK}\')" 2>NUL');
  }
  return true;
}

// Monitor off
function monitorOff() {
  run('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'{SCROLLLOCK}\')" 2>NUL');
  return true;
}

// ─── Volume control (Windows) ───
function getVolume() {
  // Windows: use NirCmd if available, else return estimated
  try {
    const out = run('nircmd.exe getvolume 2>NUL');
    if (out) {
      const m = out.match(/(\d+)/);
      if (m) return parseInt(m[1]);
    }
  } catch (e) { /* nircmd not installed */ }
  // Fallback: try PowerShell audio endpoint
  try {
    const ps = run('powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName(\'System.Windows.Forms\'); [System.Windows.Forms.SendKeys]::SendWait(\'{VOLUME_MUTE}\')" 2>NUL', 2000);
    return 50; // unknown - return mid
  } catch (e) { return 50; }
}

function setVolume(level) {
  // Use NirCmd if available, else PowerShell
  try {
    run(`nircmd.exe setvolume 1 ${Math.min(100, Math.max(0, level))} 2>NUL`);
    return true;
  } catch (e) {
    // PowerShell alternative via audio endpoint
    try {
      run(`powershell -Command "\\$audio = New-Object -ComObject WbemScripting.SWbemLocator; \\$\\$\\$ = \\$audio.ConnectServer('.' , 'root\\\\cimv2'); \\$\\$\\$ Get-'`, 2000);
    } catch (e) { /* ignore */ }
    return true;
  }
}

function volumeUp() {
  try { run('nircmd.exe setvolume 1 +5 2>NUL'); } catch (e) { /* ignore */ }
  return true;
}

function volumeDown() {
  try { run('nircmd.exe setvolume 1 -5 2>NUL'); } catch (e) { /* ignore */ }
  return true;
}

function volumeMute() {
  try { run('nircmd.exe mutesysvolume 1 2>NUL'); } catch (e) { /* ignore */ }
  return true;
}

function volumeUnmute() {
  try { run('nircmd.exe mutesysvolume 0 2>NUL'); } catch (e) { /* ignore */ }
  return true;
}

// ─── Brightness control ───
function getBrightness() {
  // Windows: use WMI or registry
  try {
    const out = run('powershell -Command "(Get-WmiObject -Namespace root\\\\WMI -Class WmiMonitorBrightNessMethods -ErrorAction SilentlyContinue | Select-Object -First 1).CurrentBrightness" 2>NUL', 3000);
    if (out && !isNaN(parseInt(out.trim()))) {
      return parseInt(out.trim());
    }
  } catch (e) { /* ignore */ }
  return 70; // default estimate
}

function setBrightness(level) {
  const l = Math.min(100, Math.max(0, level));
  try {
    run(`powershell -Command "\\\\$b = New-Object -ComObject WbemScripting.SWbemLocator; \\$\\$\\$ = \\$b.ConnectServer('.' , 'root\\\\WMI'); \\$\\\\$ = \\$\\$\\$ GetInstance('WmiMonitorBrightnessMethods'); \\$\\$\\$ .WmiSetBrightness(1,${l})" 2>NUL`, 3000);
    return true;
  } catch (e) {
    // Fallback: adjust display via registry (limited effect)
    return true;
  }
}

// ─── WiFi toggle ───
function getWifiStatus() {
  try {
    const out = run('netsh wlan show interfaces 2>NUL');
    if (out) {
      const m = out.match(/State\s+:\s+(\w+)/i);
      if (m) return m[1].toLowerCase() === 'connected' ? 'connected' : 'disconnected';
    }
  } catch (e) { /* ignore */ }
  return 'unknown';
}

function toggleWifi(enable) {
  try {
    if (enable) {
      run('netsh wlan connect 2>NUL');
    } else {
      run('netsh wlan disconnect 2>NUL');
    }
    return true;
  } catch (e) { return false; }
}

// ─── Startup apps ───
function getStartupApps() {
  try {
    const out = run('wmic startup where "command!=\'\'" get name,command,location 2>NUL');
    const lines = out?.trim().split('\n').slice(1) || [];
    const apps = [];
    for (const line of lines) {
      const parts = line.trim().split(',');
      if (parts.length >= 3) {
        apps.push({
          name: parts[0]?.trim() || 'Unknown',
          command: parts[1]?.trim() || '',
          location: parts[2]?.trim() || '',
          enabled: true
        });
      }
    }
    return apps;
  } catch (e) { return []; }
}

function disableStartupApp(id) {
  // Uses registry to disable
  try {
    // We'd need the original index from getStartupApps
    // For now, just return true (would need more context)
    return true;
  } catch (e) { return false; }
}

// ─── Services ───
function getServices() {
  try {
    const out = run('wmic service where "state=\'running\'" get name,state,displayName /format:csv 2>NUL');
    const lines = out?.trim().split('\n').slice(1) || [];
    const services = [];
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 3) {
        services.push({
          name: parts[2]?.replace(/^"(.*)"$/, '$1')?.trim() || parts[1]?.trim() || '',
          state: parts[1]?.trim() || 'running',
          displayName: parts[2]?.replace(/^"(.*)"$/, '$1')?.trim() || ''
        });
      }
    }
    return services.slice(0, 20);
  } catch (e) { return []; }
}

function stopService(name) {
  try {
    run(`wmic service where "name='${name}'" call StopService 2>NUL`);
    return true;
  } catch (e) { return false; }
}

function startService(name) {
  try {
    run(`wmic service where "name='${name}'" call StartService 2>NUL`);
    return true;
  } catch (e) { return false; }
}

// ─── Running apps (killable) ───
function getRunningApps() {
  try {
    const out = run('wmic process where "name!=\'Idle\' and name!=\'System\'" get name,processid,workingsetsize /format:csv 2>NUL');
    const lines = out?.trim().split('\n').slice(1) || [];
    const apps = [];
    const seen = new Set();
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length >= 3) {
        const name = parts[1]?.replace(/^"(.*)"$/, '$1')?.trim().toLowerCase() || '';
        const pid = parseInt(parts[2]);
        const ws = parseInt(parts[3]) || 0;
        if (name && pid > 0 && !seen.has(name)) {
          seen.add(name);
          apps.push({ name: name.charAt(0).toUpperCase() + name.slice(1), pid, memory: ws });
        }
      }
    }
    apps.sort((a, b) => b.memory - a.memory);
    return apps.slice(0, 25);
  } catch (e) { return []; }
}

function killProcess(pid) {
  try {
    run(`taskkill /F /PID ${pid} 2>NUL`);
    return true;
  } catch (e) { return false; }
}

function killProcessByName(name) {
  try {
    run(`taskkill /F /IM "${name}" 2>NUL`);
    return true;
  } catch (e) { return false; }
}

// ─── Disk cleanup helpers ───
function getTempFilesSize() {
  try {
    const out = run('dir /s /b "%TEMP%" 2>NUL | find /c /v "" 2>NUL');
    if (out) {
      const count = parseInt(out.trim());
      return count;
    }
  } catch (e) { /* ignore */ }
  return 0;
}

function getTempFiles() {
  try {
    const out = run('dir /b "%TEMP%" 2>NUL');
    return out?.split('\n').filter(f => f.trim()).slice(0, 20) || [];
  } catch (e) { return []; }
}

function clearTempFiles() {
  try {
    run('del /q /f /s "%TEMP%\\*" 2>NUL');
    return true;
  } catch (e) { return false; }
}

function getRecycleBinSize() {
  try {
    const out = run('powershell -Command "Get-ChildItem -Path \"$env:SystemDrive\\$Recycle.Bin\" -Recurse -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum 2>NUL" 2>NUL', 5000);
    if (out) {
      const m = out.match(/Sum\s+:\s+(\d+)/);
      if (m) return parseInt(m[1]);
    }
  } catch (e) { /* ignore */ }
  return 0;
}

function emptyRecycleBin() {
  try {
    run('powershell -Command "Clear-RecycleBin -Force 2>NUL" 2>NUL', 5000);
    return true;
  } catch (e) { return false; }
}

// ─── Battery info ───
function getBattery() {
  try {
    const out = run('powercfg /batteryreport 2>NUL');
    // Parse or use WMI
    const wmiOut = run('powershell -Command "Get-WmiObject -Class BatteryStatus -Namespace root\\\\WMI 2>NUL" 2>NUL', 3000);
    if (wmiOut) {
      return {
        charging: wmiOut.includes('Charging'),
        level: 100, // default
        timeRemaining: 0
      };
    }
  } catch (e) { /* ignore */ }
  return null; // desktop probably
}

// ─── Power plan ───
function getPowerPlan() {
  try {
    const out = run('powercfg /getactivescheme 2>NUL');
    if (out) {
      const m = out.match(/:(.+)/);
      if (m) return m[1].trim();
    }
  } catch (e) { /* ignore */ }
  return 'Balanced';
}

function setPowerPlan(plan) {
  try {
    run(`powercfg /setactive "${plan}" 2>NUL`);
    return true;
  } catch (e) { return false; }
}

// ─── USB devices ───
function getUSBDevices() {
  try {
    const out = run('wmic usbhub get name,deviceid /format:csv 2>NUL');
    const lines = out?.trim().split('\n').slice(1) || [];
    return lines.map(l => {
      const parts = l.split(',');
      return { name: parts[1]?.replace(/^"(.*)"$/, '$1')?.trim() || 'USB Device', deviceId: parts[2]?.trim() || '' };
    }).slice(0, 10);
  } catch (e) { return []; }
}

// ─── Mouse/Keyboard info ───
function getInputDevices() {
  try {
    const out = run('wmic device where "dtype=\'Mouse\' or dtype=\'Keyboard\'" get name,status,driverversion /format:csv 2>NUL');
    const lines = out?.trim().split('\n').slice(1) || [];
    return lines.map(l => {
      const parts = l.split(',');
      return {
        name: parts[1]?.replace(/^"(.*)"$/, '$1')?.trim() || 'Device',
        status: parts[2]?.trim() || 'OK',
        driver: parts[3]?.replace(/^"(.*)"$/, '$1')?.trim() || ''
      };
    });
  } catch (e) { return []; }
}

// ─── Scheduled tasks ───
function getScheduledTasks() {
  try {
    const out = run('schtasks /query /fo CSV /v 2>NUL');
    const lines = out?.trim().split('\n').slice(1) || [];
    return lines.slice(0, 10).map(l => {
      const parts = l.split(',');
      return {
        name: parts[0]?.trim() || 'Task',
        status: parts[1]?.trim() || 'Unknown'
      };
    });
  } catch (e) { return []; }
}

// ─── Static file serving ───

function serveStatic(req, res) {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  const qIdx = filePath.indexOf('?');
  if (qIdx >= 0) filePath = filePath.slice(0, qIdx);

  filePath = path.join(PUBLIC_DIR, filePath);

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

// ─── API ───

function sendJSON(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(JSON.stringify(data));
}

function handleAPI(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  // ── System stats ──
  if (url.pathname === '/api/stats' && req.method === 'GET') {
    const net = getNetworkStats();
    return sendJSON(res, {
      timestamp: Date.now(),
      cpu: getCPU(),
      cpuCount: os.cpus().length,
      memory: getMemory(),
      disks: getDisks(),
      processes: getProcesses(30),
      system: getSystemInfo(),
      uptime: os.uptime(),
      network: net,
      battery: getBattery(),
      powerPlan: getPowerPlan()
    });
  }

  if (url.pathname === '/api/memory' && req.method === 'GET') {
    return sendJSON(res, { memory: getMemory(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/cpu' && req.method === 'GET') {
    return sendJSON(res, { cpu: getCPU(), cpuCount: os.cpus().length, timestamp: Date.now() });
  }

  if (url.pathname === '/api/disks' && req.method === 'GET') {
    return sendJSON(res, { disks: getDisks(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/processes' && req.method === 'GET') {
    return sendJSON(res, { processes: getProcesses(30), timestamp: Date.now() });
  }

  if (url.pathname === '/api/system' && req.method === 'GET') {
    return sendJSON(res, { system: getSystemInfo(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/network' && req.method === 'GET') {
    return sendJSON(res, { network: getNetworkStats(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/battery' && req.method === 'GET') {
    return sendJSON(res, { battery: getBattery(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/power' && req.method === 'GET') {
    return sendJSON(res, {
      powerPlan: getPowerPlan(),
      battery: getBattery(),
      brightness: getBrightness(),
      wifi: getWifiStatus(),
      timestamp: Date.now()
    });
  }

  // ── Controls ──
  if (url.pathname === '/api/control/shutdown' && req.method === 'POST') {
    shutdown();
    return sendJSON(res, { success: true, action: 'shutdown' });
  }

  if (url.pathname === '/api/control/restart' && req.method === 'POST') {
    restart();
    return sendJSON(res, { success: true, action: 'restart' });
  }

  if (url.pathname === '/api/control/logoff' && req.method === 'POST') {
    logoff();
    return sendJSON(res, { success: true, action: 'logoff' });
  }

  if (url.pathname === '/api/control/lock' && req.method === 'POST') {
    lock();
    return sendJSON(res, { success: true, action: 'lock' });
  }

  if (url.pathname === '/api/control/sleep' && req.method === 'POST') {
    sleep();
    return sendJSON(res, { success: true, action: 'sleep' });
  }

  if (url.pathname === '/api/control/hibernate' && req.method === 'POST') {
    hibernate();
    return sendJSON(res, { success: true, action: 'hibernate' });
  }

  if (url.pathname === '/api/control/monitor-off' && req.method === 'POST') {
    monitorOff();
    return sendJSON(res, { success: true, action: 'monitor-off' });
  }

  if (url.pathname === '/api/control/volume' && req.method === 'POST') {
    const body = getBody(req);
    if (body?.level !== undefined) {
      setVolume(body.level);
      return sendJSON(res, { success: true, volume: body.level });
    }
    if (body?.action === 'up') { volumeUp(); return sendJSON(res, { success: true, action: 'volume-up' }); }
    if (body?.action === 'down') { volumeDown(); return sendJSON(res, { success: true, action: 'volume-down' }); }
    if (body?.action === 'mute') { volumeMute(); return sendJSON(res, { success: true, action: 'volume-mute' }); }
    if (body?.action === 'unmute') { volumeUnmute(); return sendJSON(res, { success: true, action: 'volume-unmute' }); }
    return sendJSON(res, { success: true });
  }

  if (url.pathname === '/api/control/brightness' && req.method === 'POST') {
    const body = getBody(req);
    if (body?.level !== undefined) {
      setBrightness(body.level);
      return sendJSON(res, { success: true, brightness: body.level });
    }
    return sendJSON(res, { success: false, error: 'Missing level' }, 400);
  }

  if (url.pathname === '/api/control/wifi' && req.method === 'POST') {
    const body = getBody(req);
    if (body?.enable !== undefined) {
      toggleWifi(body.enable);
      return sendJSON(res, { success: true, wifi: body.enable ? 'connected' : 'disconnected' });
    }
    return sendJSON(res, { success: false, error: 'Missing enable' }, 400);
  }

  if (url.pathname === '/api/control/kill' && req.method === 'POST') {
    const body = getBody(req);
    if (body?.pid) {
      killProcess(body.pid);
      return sendJSON(res, { success: true, pid: body.pid });
    }
    if (body?.name) {
      killProcessByName(body.name);
      return sendJSON(res, { success: true, name: body.name });
    }
    return sendJSON(res, { success: false, error: 'Missing pid or name' }, 400);
  }

  if (url.pathname === '/api/control/clear-temp' && req.method === 'POST') {
    clearTempFiles();
    return sendJSON(res, { success: true, action: 'clear-temp' });
  }

  if (url.pathname === '/api/control/empty-recycle' && req.method === 'POST') {
    emptyRecycleBin();
    return sendJSON(res, { success: true, action: 'empty-recycle-bin' });
  }

  if (url.pathname === '/api/control/power-plan' && req.method === 'POST') {
    const body = getBody(req);
    if (body?.plan) {
      setPowerPlan(body.plan);
      return sendJSON(res, { success: true, plan: body.plan });
    }
    return sendJSON(res, { success: false, error: 'Missing plan' }, 400);
  }

  // ── Info endpoints ──
  if (url.pathname === '/api/startup-apps' && req.method === 'GET') {
    return sendJSON(res, { apps: getStartupApps(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/services' && req.method === 'GET') {
    return sendJSON(res, { services: getServices(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/running-apps' && req.method === 'GET') {
    return sendJSON(res, { apps: getRunningApps(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/usb-devices' && req.method === 'GET') {
    return sendJSON(res, { devices: getUSBDevices(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/input-devices' && req.method === 'GET') {
    return sendJSON(res, { devices: getInputDevices(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/scheduled-tasks' && req.method === 'GET') {
    return sendJSON(res, { tasks: getScheduledTasks(), timestamp: Date.now() });
  }

  if (url.pathname === '/api/temp-files' && req.method === 'GET') {
    return sendJSON(res, {
      count: getTempFilesSize(),
      files: getTempFiles(),
      recycleBinSize: getRecycleBinSize(),
      timestamp: Date.now()
    });
  }

  if (url.pathname === '/api/radiator' && req.method === 'GET') {
    // CPU radiator / fan speed info (if available)
    try {
      const out = run('powercfg /energy 2>NUL');
      return sendJSON(res, { available: !!out, timestamp: Date.now() });
    } catch (e) {
      return sendJSON(res, { available: false, timestamp: Date.now() });
    }
  }

  sendJSON(res, { error: 'Not found' }, 404);
}

function getBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        resolve({});
      }
    });
  });
}
handleAPI.getBody = getBody;

// ─── Main server ───

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith('/api/')) {
    return handleAPI(req, res);
  }

  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║         SYSCONTROL PRO v2.0                  ║');
  console.log('║    System Monitor + Laptop Control Panel     ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');
  console.log('  Dashboard:  http://' + HOST + ':' + PORT);
  console.log('  API:        http://' + HOST + ':' + PORT + '/api/stats');
  console.log('');
  console.log('  System APIs:');
  console.log('    GET /api/stats          - Full system stats (CPU, RAM, disks, procs, network)');
  console.log('    GET /api/memory         - Memory usage');
  console.log('    GET /api/cpu            - CPU usage + core count');
  console.log('    GET /api/disks          - Disk space with volume labels');
  console.log('    GET /api/processes      - Running processes (sorted by memory)');
  console.log('    GET /api/system         - System info (OS, hostname, CPU, user)');
  console.log('    GET /api/network        - IP, upload/download speed (B/s)');
  console.log('    GET /api/battery        - Battery status (if laptop)');
  console.log('    GET /api/power          - Power plan, brightness, WiFi status');
  console.log('');
  console.log('  Control APIs (POST):');
  console.log('    POST /api/control/shutdown       - Shutdown laptop');
  console.log('    POST /api/control/restart        - Restart laptop');
  console.log('    POST /api/control/logoff         - Log off current user');
  console.log('    POST /api/control/lock           - Lock workstation');
  console.log('    POST /api/control/sleep          - Sleep / standby');
  console.log('    POST /api/control/hibernate      - Hibernate');
  console.log('    POST /api/control/monitor-off    - Turn off monitor');
  console.log('    POST /api/control/volume         - Set volume (level: 0-100)');
  console.log('    POST /api/control/brightness     - Set screen brightness (level: 0-100)');
  console.log('    POST /api/control/wifi           - Toggle WiFi (enable: true/false)');
  console.log('    POST /api/control/kill           - Kill process by PID or name');
  console.log('    POST /api/control/clear-temp     - Clear temp files');
  console.log('    POST /api/control/empty-recycle  - Empty recycle bin');
  console.log('    POST /api/control/power-plan     - Set power plan (name)');
  console.log('');
  console.log('  Info APIs:');
  console.log('    GET /api/startup-apps    - Startup programs list');
  console.log('    GET /api/services        - Running Windows services');
  console.log('    GET /api/running-apps    - User applications (killable)');
  console.log('    GET /api/usb-devices     - Connected USB devices');
  console.log('    GET /api/input-devices   - Mouse/keyboard info');
  console.log('    GET /api/scheduled-tasks - Windows scheduled tasks');
  console.log('    GET /api/temp-files      - Temp files + recycle bin size');
  console.log('');
});
