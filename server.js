const express = require('express');
const expressWs = require('express-ws');
const path = require('path');
const db = require('./database');
const executor = require('./executor');
const scheduler = require('./scheduler');

const app = express();
const wsInstance = expressWs(app);

// Initialize
executor.setDB(db);
scheduler.setDB(db);
scheduler.setExecutor(executor);
executor.onProgress = (notification) => {
  scheduler.sendProgressNotification(notification);
};

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Auth Middleware ---
function authMiddleware(req, res, next) {
  const key = req.headers['x-auth-key'] || req.query.key;
  if (key !== db.getSettings().authKey) {
    return res.status(401).json({ error: 'Invalid key' });
  }
  next();
}

// --- WebSocket ---
app.ws('/ws', (ws, req) => {
  const key = req.query.key;
  if (key !== db.getSettings().authKey) {
    ws.close(1008, 'Unauthorized');
    return;
  }

  executor.addClient(ws);
  console.log('🔌 WebSocket client connected');

  // Send initial state
  ws.send(JSON.stringify({
    type: 'init',
    projects: db.getProjects(),
    settings: db.getSettings(),
    runningTasks: executor.getRunningTasks()
  }));

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      handleWsMessage(ws, data);
    } catch {}
  });

  ws.on('close', () => {
    executor.removeClient(ws);
    console.log('🔌 WebSocket client disconnected');
  });
});

function handleWsMessage(ws, data) {
  switch (data.type) {
    case 'ping':
      ws.send(JSON.stringify({ type: 'pong' }));
      break;
    case 'get_projects':
      ws.send(JSON.stringify({ type: 'projects', projects: db.getProjects() }));
      break;
    case 'get_project':
      const project = db.getProject(data.projectId);
      if (project) ws.send(JSON.stringify({ type: 'project', project }));
      break;
  }
}

// --- API Routes ---

// Auth check
app.post('/api/auth', (req, res) => {
  const { key } = req.body;
  if (key === db.getSettings().authKey) {
    res.json({ success: true, settings: db.getSettings() });
  } else {
    res.status(401).json({ error: 'Invalid key' });
  }
});

// Generate clarifying questions based on project description
app.post('/api/generate-questions', authMiddleware, (req, res) => {
  const { description } = req.body;
  if (!description) return res.json({ questions: [] });

  const desc = description.toLowerCase();
  const questions = [];

  // Detect project type and ask relevant questions
  if (desc.match(/web|site|portfolio|blog|landing|page|html|css|react|next|vue/)) {
    questions.push({
      title: '🌐 Tech Stack',
      options: ['Vanilla HTML/CSS/JS', 'React', 'Vue.js', 'Next.js', 'Astro', 'Svelte'],
      timeLimit: 60
    });
  }

  if (desc.match(/game|play|unity|godot|2d|3d|pixel|rpg/)) {
    questions.push({
      title: '🎮 Game Engine',
      options: ['Unity (C#)', 'Godot', 'Phaser.js', 'Pygame', 'Bevy (Rust)', 'Custom Engine'],
      timeLimit: 120
    });
  }

  if (desc.match(/ai|ml|model|neural|train|llm|chatbot|gpt|machine learning/)) {
    questions.push({
      title: '🤖 AI Framework',
      options: ['Python + TensorFlow', 'Python + PyTorch', 'OpenAI API', 'Hugging Face', 'Local LLM (Ollama)'],
      timeLimit: 90
    });
  }

  if (desc.match(/mobile|app|ios|android|flutter|react native|dart/)) {
    questions.push({
      title: '📱 Mobile Framework',
      options: ['React Native', 'Flutter', 'Swift (iOS)', 'Kotlin (Android)', 'Expo'],
      timeLimit: 90
    });
  }

  if (desc.match(/hardware|arduino|raspberry|rpi|iot|sensor|circuit|esp|robot/)) {
    questions.push({
      title: '🔧 Hardware Platform',
      options: ['Arduino', 'Raspberry Pi', 'ESP32', 'STM32', 'FPGA'],
      timeLimit: 60
    });
  }

  // Always ask these general questions
  questions.push({
    title: '🎨 Design Approach',
    options: ['Minimal & Clean', 'Dark Theme', 'Colorful & Fun', 'Professional', 'Retro/Pixel Art'],
    timeLimit: null
  });

  questions.push({
    title: '📦 Features to Include',
    options: ['Authentication', 'Database', 'API Integration', 'Real-time Updates', 'Offline Support', 'Dark Mode', 'Responsive Design', 'Animations'],
    timeLimit: null
  });

  questions.push({
    title: '🎯 Priority',
    options: ['Get a working MVP fast', 'Polish & perfect details', 'Focus on core feature only', 'Build for scale'],
    timeLimit: null
  });

  res.json({ questions });
});

// Projects
app.get('/api/projects', authMiddleware, (req, res) => {
  res.json(db.getProjects());
});

app.post('/api/projects', authMiddleware, (req, res) => {
  const { name, description, timeLimit, questions } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  const project = db.createProject({ name, description, timeLimit, questions });
  executor.broadcast('project_created', { project });
  res.json(project);
});

app.get('/api/projects/:id', authMiddleware, (req, res) => {
  const project = db.getProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Not found' });
  res.json(project);
});

app.put('/api/projects/:id', authMiddleware, (req, res) => {
  const project = db.updateProject(req.params.id, req.body);
  if (!project) return res.status(404).json({ error: 'Not found' });
  res.json(project);
});

app.delete('/api/projects/:id', authMiddleware, (req, res) => {
  db.deleteProject(req.params.id);
  res.json({ success: true });
});

// Tasks
app.post('/api/projects/:projectId/tasks', authMiddleware, (req, res) => {
  const { name, commands, timeLimit } = req.body;
  if (!commands || !commands.length) return res.status(400).json({ error: 'Commands required' });
  const task = db.createTask(req.params.projectId, { name, commands, timeLimit });
  if (!task) return res.status(404).json({ error: 'Project not found' });
  executor.broadcast('task_created', { projectId: req.params.projectId, task });
  res.json(task);
});

app.post('/api/projects/:projectId/tasks/:taskId/run', authMiddleware, async (req, res) => {
  const result = await executor.executeTask(req.params.projectId, req.params.taskId);
  if (result.error) return res.status(400).json(result);
  res.json({ success: true });
});

app.post('/api/projects/:projectId/tasks/:taskId/stop', authMiddleware, (req, res) => {
  const stopped = executor.stopTask(req.params.projectId, req.params.taskId);
  if (!stopped) return res.status(400).json({ error: 'Task not running' });
  res.json({ success: true });
});

// School mode
app.post('/api/school-mode', authMiddleware, (req, res) => {
  const { enabled } = req.body;
  db.updateSettings({ schoolMode: !!enabled });
  const msg = enabled ? '🏫 School mode ENABLED - tasks will auto-run' : '🏫 School mode DISABLED';
  console.log(msg);
  executor.broadcast('settings_updated', { settings: db.getSettings() });
  res.json({ success: true, schoolMode: !!enabled });
});

// Settings
app.get('/api/settings', authMiddleware, (req, res) => {
  res.json(db.getSettings());
});

app.put('/api/settings', authMiddleware, (req, res) => {
  const settings = db.updateSettings(req.body);
  res.json(settings);
});

// Project summary for notifications
app.get('/api/status', authMiddleware, (req, res) => {
  const projects = db.getProjects();
  const running = executor.getRunningTasks();
  const totalTasks = projects.reduce((sum, p) => sum + p.tasks.length, 0);
  const completedTasks = projects.reduce((sum, p) => sum + p.tasks.filter(t => t.status === 'completed').length, 0);

  res.json({
    totalProjects: projects.length,
    totalTasks,
    completedTasks,
    runningTasks: running.length,
    schoolMode: db.getSettings().schoolMode,
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      progress: p.progress,
      taskCount: p.tasks.length
    }))
  });
});

// Start server
const PORT = process.env.PORT || 3000;
scheduler.start();

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🌟 ═══════════════════════════════════════════════');
  console.log(`🌟  Stardance Remote Control - Running on port ${PORT}`);
  console.log(`🌟  Access from any device: http://localhost:${PORT}`);
  console.log(`🌟  Auth key: keshu@4567`);
  console.log('🌟 ═══════════════════════════════════════════════');
  console.log('');
});
