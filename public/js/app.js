// ═══════════════════════════════════════════
// 🌟 STARDANCE REMOTE CONTROL - APP
// ═══════════════════════════════════════════

const App = {
  key: null,
  ws: null,
  projects: [],
  currentProject: null,
  currentView: 'dashboard',
  notificationTimer: null,
  reconnectAttempts: 0,

  // ─── Auth ───
  login() {
    const keyInput = document.getElementById('auth-key');
    const key = keyInput.value.trim();
    if (!key) return;

    fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        this.key = key;
        document.getElementById('auth-screen').style.display = 'none';
        document.getElementById('app-screen').style.display = 'block';
        this.connectWebSocket();
        this.loadProjects();
        this.requestNotificationPermission();
        this.toast('SYSTEM LINKED // WELCOME', 'success');
      } else {
        this.showAuthError('ACCESS DENIED // INVALID KEY');
      }
    })
    .catch(() => {        this.showAuthError('CONNECTION FAILED // RETRY');
    });
  },

  showAuthError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 3000);
  },

  logout() {
    this.key = null;
    if (this.ws) this.ws.close();
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'block';
    document.getElementById('auth-key').value = '';
  },

  // ─── WebSocket ───
  connectWebSocket() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${location.host}/ws?key=${encodeURIComponent(this.key)}`);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.updateConnectionStatus(true);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleWsMessage(data);
      } catch {}
    };

    this.ws.onclose = () => {
      this.updateConnectionStatus(false);
      // Reconnect after delay
      if (this.key && this.reconnectAttempts < 10) {
        this.reconnectAttempts++;
        setTimeout(() => this.connectWebSocket(), 2000 * this.reconnectAttempts);
      }
    };

    this.ws.onerror = () => {};
  },

  handleWsMessage(data) {
    switch (data.type) {
      case 'init':
        this.projects = data.projects;
        this.renderDashboard();
        if (data.settings) {
          document.getElementById('school-mode-check').checked = data.settings.schoolMode;
        }
        break;

      case 'projects':
        this.projects = data.projects;
        this.renderDashboard();
        break;

      case 'project':
        this.currentProject = data.project;
        this.renderProjectDetail();
        break;

      case 'project_created':
        this.projects.unshift(data.project);
        this.renderDashboard();
        this.toast('PROJECT INITIALIZED // SUCCESS', 'success');
        break;

      case 'task_created':
        this.updateLocalTask(data.projectId, data.task);
        this.renderProjectDetail();
        this.toast('TASK QUEUED // READY', 'info');
        break;

      case 'task_started':
        this.updateLocalTask(data.projectId, data.task);
        this.renderProjectDetail();
        this.toast(`EXECUTING: ${data.task.name}`, 'info');
        break;

      case 'task_progress':
        this.updateLocalTaskProgress(data.projectId, data.taskId, data.progress, data.step, data.totalSteps, data.currentCommand);
        this.renderProjectDetail();
        break;

      case 'task_output':
        this.updateLocalTaskOutput(data.projectId, data.taskId, data.output);
        this.renderProjectDetail();
        break;

      case 'task_completed':
        this.updateLocalTaskStatus(data.projectId, data.taskId, data.status, data.progress);
        this.renderProjectDetail();
        this.renderDashboard();
        this.toast(`TASK ${data.status === 'completed' ? 'COMPLETE // SUCCESS' : `FAILED // ${data.status.toUpperCase()}`}`,
          data.status === 'completed' ? 'success' : 'error');
        break;

      case 'task_failed':
        this.updateLocalTaskStatus(data.projectId, data.taskId, 'failed', 0);
        this.renderProjectDetail();
        this.toast(`SYSTEM ERROR: ${data.error}`, 'error');
        break;

      case 'notification':
        this.showNotification(data);
        break;

      case 'settings_updated':
        if (data.settings) {
          document.getElementById('school-mode-check').checked = data.settings.schoolMode;
        }
        break;
    }
  },

  // ─── Local State Updates ───
  updateLocalTask(projectId, task) {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;
    const idx = project.tasks.findIndex(t => t.id === task.id);
    if (idx >= 0) {
      project.tasks[idx] = { ...project.tasks[idx], ...task };
    } else {
      project.tasks.push(task);
    }
    if (this.currentProject && this.currentProject.id === projectId) {
      const cIdx = this.currentProject.tasks.findIndex(t => t.id === task.id);
      if (cIdx >= 0) {
        this.currentProject.tasks[cIdx] = { ...this.currentProject.tasks[cIdx], ...task };
      } else {
        this.currentProject.tasks.push(task);
      }
    }
  },

  updateLocalTaskProgress(projectId, taskId, progress, step, totalSteps, currentCommand) {
    const project = this.projects.find(p => p.id === projectId);
    if (project) {
      const task = project.tasks.find(t => t.id === taskId);
      if (task) {
        task.progress = progress;
        task._step = step;
        task._totalSteps = totalSteps;
        task._currentCommand = currentCommand;
      }
    }
    if (this.currentProject && this.currentProject.id === projectId) {
      const task = this.currentProject.tasks.find(t => t.id === taskId);
      if (task) {
        task.progress = progress;
        task._step = step;
        task._totalSteps = totalSteps;
        task._currentCommand = currentCommand;
      }
    }
  },

  updateLocalTaskOutput(projectId, taskId, output) {
    const update = (project) => {
      if (!project) return;
      const task = project.tasks.find(t => t.id === taskId);
      if (task) task.output = output;
    };
    update(this.projects.find(p => p.id === projectId));
    if (this.currentProject && this.currentProject.id === projectId) {
      update(this.currentProject);
    }
  },

  updateLocalTaskStatus(projectId, taskId, status, progress) {
    const update = (project) => {
      if (!project) return;
      const task = project.tasks.find(t => t.id === taskId);
      if (task) {
        task.status = status;
        task.progress = progress;
      }
      // Update project status
      const statuses = project.tasks.map(t => t.status);
      if (statuses.every(s => s === 'completed')) project.status = 'completed';
      else if (statuses.some(s => s === 'running')) project.status = 'running';
      else if (statuses.some(s => s === 'failed' || s === 'timeout')) project.status = 'failed';
      else project.status = 'created';

      if (project.tasks.length > 0) {
        project.progress = Math.round(project.tasks.reduce((s, t) => s + t.progress, 0) / project.tasks.length);
      }
    };
    update(this.projects.find(p => p.id === projectId));
    if (this.currentProject && this.currentProject.id === projectId) {
      update(this.currentProject);
    }
  },

  // ─── API Calls ───
  api(method, path, body) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Key': this.key
      }
    };
    if (body) opts.body = JSON.stringify(body);
    return fetch(`/api${path}`, opts).then(r => r.json());
  },

  loadProjects() {
    this.api('GET', '/projects').then(projects => {
      this.projects = projects;
      this.renderDashboard();
    }).catch(() => {});
  },

  // ─── Views ───
  showView(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    this.currentView = view;

    if (view === 'dashboard') {
      this.renderDashboard();
      this.loadProjects(); // refresh
    }
  },

  // ─── Dashboard ───
  renderDashboard() {
    // Stats
    const totalTasks = this.projects.reduce((s, p) => s + p.tasks.length, 0);
    const completedTasks = this.projects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'completed').length, 0);
    const runningTasks = this.projects.reduce((s, p) => s + p.tasks.filter(t => t.status === 'running').length, 0);

    document.getElementById('stat-projects').textContent = this.projects.length;
    document.getElementById('stat-tasks').textContent = totalTasks;
    document.getElementById('stat-completed').textContent = completedTasks;
    document.getElementById('stat-running').textContent = runningTasks;

    // Projects grid
    const container = document.getElementById('projects-list');
    if (this.projects.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">🚀</span>
          <p>No projects yet. Create one to get started!</p>
        </div>`;
      return;
    }

    container.innerHTML = this.projects.map(p => `
      <div class="project-card" onclick="App.openProject('${p.id}')">
        <div class="project-card-title">${this.escape(p.name)}</div>
        <div class="project-card-desc">${this.escape(p.description || 'No description')}</div>
        <div class="project-card-meta">
          <span class="status-badge status-${p.status}">${p.status}</span>
          <span class="task-count">${p.tasks.length} task${p.tasks.length !== 1 ? 's' : ''}</span>
        </div>
        ${p.tasks.length > 0 ? `
          <div class="progress-bar-container" style="margin-top:0.6rem">
            <div class="progress-bar" style="width:${p.progress}%"></div>
          </div>
        ` : ''}
      </div>
    `).join('');
  },

  // ─── Question Generation ───
  _questionDebounce: null,

  onDescriptionChange() {
    clearTimeout(this._questionDebounce);
    this._questionDebounce = setTimeout(() => {
      const desc = document.getElementById('project-desc').value.trim();
      if (desc.length < 10) {
        document.getElementById('questions-section').style.display = 'none';
        return;
      }
      this.generateQuestions(desc);
    }, 800);
  },

  generateQuestions(description) {
    this.api('POST', '/generate-questions', { description }).then(data => {
      if (data.questions && data.questions.length > 0) {
        this.renderQuestions(data.questions);
        document.getElementById('questions-section').style.display = 'block';
      }
    });
  },

  renderQuestions(questions) {
    const container = document.getElementById('questions-container');
    container.innerHTML = questions.map((q, i) => `
      <div class="question-group">
        <h4>${q.title}</h4>
        <div class="checkbox-list">
          ${q.options.map((opt, j) => `
            <div class="checkbox-item">
              <input type="checkbox" id="q${i}_o${j}" value="${this.escape(opt)}">
              <label for="q${i}_o${j}">${this.escape(opt)}</label>
            </div>
          `).join('')}
        </div>
        ${q.timeLimit ? `
          <div class="time-limit-input">
            <label style="font-size:0.85rem;color:var(--text-secondary)">⏱ Suggested time: ${q.timeLimit} min</label>
            <input type="number" placeholder="Minutes" min="1">
          </div>
        ` : ''}
      </div>
    `).join('');
  },

  // ─── Create Project ───
  createProject() {
    const name = document.getElementById('project-name').value.trim();
    const description = document.getElementById('project-desc').value.trim();
    const timeLimit = document.getElementById('project-time').value;

    if (!name) {
      this.toast('Project name is required', 'error');
      return;
    }

    // Collect checkbox answers
    const questions = [];
    document.querySelectorAll('.question-group').forEach(group => {
      const qTitle = group.querySelector('h4')?.textContent || '';
      const checked = [];
      group.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        checked.push(cb.value);
      });
      const timeInput = group.querySelector('.time-limit-input input');
      const timeLimit = timeInput ? timeInput.value : null;
      if (checked.length > 0 || timeLimit) {
        questions.push({ question: qTitle, answers: checked, timeLimit: timeLimit ? parseInt(timeLimit) : null });
      }
    });

    this.api('POST', '/projects', {
      name,
      description,
      timeLimit: timeLimit ? parseInt(timeLimit) : null,
      questions
    }).then(project => {
      document.getElementById('project-name').value = '';
      document.getElementById('project-desc').value = '';
      document.getElementById('project-time').value = '';
      document.getElementById('questions-section').style.display = 'none';
      this.openProject(project.id);
    }).catch(err => {
      this.toast('Failed to create project', 'error');
    });
  },

  // ─── Project Detail ───
  openProject(projectId) {
    this.api('GET', `/projects/${projectId}`).then(project => {
      this.currentProject = project;
      document.getElementById('project-title').textContent = project.name;
      document.getElementById('project-description').textContent = project.description || 'No description';
      document.getElementById('project-progress').style.width = project.progress + '%';
      document.getElementById('project-progress-text').textContent = project.progress + '%';
      this.hideAddTask();
      this.renderProjectDetail();
      this.showView('project');
    });
  },

  renderProjectDetail() {
    if (!this.currentProject) return;

    const project = this.currentProject;
    document.getElementById('project-progress').style.width = project.progress + '%';
    document.getElementById('project-progress-text').textContent = project.progress + '%';

    const container = document.getElementById('tasks-list');
    const noTasks = document.getElementById('no-tasks');

    if (project.tasks.length === 0) {
      container.innerHTML = '';
      container.appendChild(noTasks);
      noTasks.style.display = 'block';
      return;
    }

    noTasks.style.display = 'none';
    container.innerHTML = project.tasks.map(t => this.renderTaskCard(t, project.id)).join('');
  },

  renderTaskCard(task, projectId) {
    const isRunning = task.status === 'running';
    const isPending = task.status === 'pending';
    const timeInfo = task.timeLimit ? `⏱ ${task.timeLimit}m limit` : '';
    const elapsed = task.startTime ? this.formatElapsed(task.startTime) : '';
    const stepInfo = task._step ? `Step ${task._step}/${task._totalSteps}` : '';
    const currentCmd = task._currentCommand ? `<div class="output-line command">Running: ${this.escape(task._currentCommand)}</div>` : '';

    const outputHtml = (task.output && task.output.length > 0) ? `
      <div class="task-output">
        ${task.output.map(o => `<div class="output-line ${o.type}">${this.escape(o.text)}</div>`).join('')}
        ${currentCmd}
      </div>
    ` : '';

    return `
      <div class="task-card">
        <div class="task-header">
          <span class="task-name">${this.escape(task.name)}</span>
          <div class="task-actions">
            ${isPending ? `<button class="btn-success btn-sm" onclick="App.runTask('${projectId}','${task.id}')">▶ EXECUTE</button>` : ''}
            ${isRunning ? `<button class="btn-danger btn-sm" onclick="App.stopTask('${projectId}','${task.id}')">⏹ ABORT</button>` : ''}
            <span class="status-badge status-${task.status}">${task.status}</span>
          </div>
        </div>
        ${isRunning || task.progress > 0 ? `
          <div class="task-progress">
            <div class="progress-bar-container">
              <div class="progress-bar" style="width:${task.progress}%"></div>
              <span class="progress-text">${task.progress}%${stepInfo ? ' | ' + stepInfo : ''}</span>
            </div>
          </div>
        ` : ''}
        <div class="task-meta">
          ${timeInfo ? `<span>${timeInfo}</span>` : ''}
          ${elapsed ? `<span>Elapsed: ${elapsed}</span>` : ''}
          <span>${task.commands ? task.commands.length : 0} command${(task.commands && task.commands.length !== 1) ? 's' : ''}</span>
        </div>
        ${outputHtml}
      </div>
    `;
  },

  formatElapsed(startTime) {
    const ms = Date.now() - new Date(startTime).getTime();
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    if (mins > 60) {
      const hrs = Math.floor(mins / 60);
      return `${hrs}h ${mins % 60}m`;
    }
    return `${mins}m ${secs}s`;
  },

  // ─── Tasks ───
  showAddTask() {
    document.getElementById('add-task-form').style.display = 'block';
    document.getElementById('task-name').focus();
  },

  hideAddTask() {
    document.getElementById('add-task-form').style.display = 'none';
    document.getElementById('task-name').value = '';
    document.getElementById('task-commands').value = '';
    document.getElementById('task-time').value = '';
  },

  addTask() {
    if (!this.currentProject) return;
    const name = document.getElementById('task-name').value.trim();
    const commandsText = document.getElementById('task-commands').value.trim();
    const timeLimit = document.getElementById('task-time').value;

    if (!commandsText) {
      this.toast('Commands are required', 'error');
      return;
    }

    const commands = commandsText.split('\n').filter(c => c.trim());

    this.api('POST', `/projects/${this.currentProject.id}/tasks`, {
      name: name || 'Unnamed Task',
      commands,
      timeLimit: timeLimit ? parseInt(timeLimit) : null
    }).then(task => {
      this.hideAddTask();
      this.openProject(this.currentProject.id);
    }).catch(() => {
      this.toast('Failed to add task', 'error');
    });
  },

  runTask(projectId, taskId) {
    this.api('POST', `/projects/${projectId}/tasks/${taskId}/run`).then(data => {
      if (data.error) this.toast(data.error, 'error');
      else this.toast('Task started! ▶', 'info');
    });
  },

  stopTask(projectId, taskId) {
    this.api('POST', `/projects/${projectId}/tasks/${taskId}/stop`).then(data => {
      if (data.error) this.toast(data.error, 'error');
      else this.toast('Task stopped ⏹', 'warning');
    });
  },

  deleteProject() {
    if (!this.currentProject) return;
    if (!confirm(`Delete project "${this.currentProject.name}"? This cannot be undone.`)) return;

    this.api('DELETE', `/projects/${this.currentProject.id}`).then(() => {
      this.toast('Project deleted', 'info');
      this.currentProject = null;
      this.showView('dashboard');
    });
  },

  // ─── School Mode ───
  toggleSchoolMode() {
    const enabled = document.getElementById('school-mode-check').checked;
    this.api('POST', '/school-mode', { enabled }).then(data => {
      this.toast(enabled ? '🏫 School mode ENABLED' : '🏫 School mode DISABLED',
        enabled ? 'success' : 'info');
    });
  },

  // ─── Notifications ───
  requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  },

  showNotification(data) {
    const { taskName, progress, step, totalSteps, elapsed, remaining } = data;
    const content = `
      <div style="margin-top:0.4rem">
        <strong>${this.escape(taskName)}</strong><br>
        <span style="color:var(--accent)">Progress: ${progress}%</span> | Step ${step}/${totalSteps}<br>
        <span style="color:var(--text-muted)">Elapsed: ${elapsed} | Remaining: ${remaining}</span>
      </div>
    `;

    // Show in-app popup
    document.getElementById('notification-content').innerHTML = content;
    document.getElementById('notification-popup').style.display = 'block';
    setTimeout(() => {
      document.getElementById('notification-popup').style.display = 'none';
    }, 15000);

    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('📊 Stardance Progress', {
        body: `${taskName} - ${progress}% complete (${step}/${totalSteps})`,
        icon: '🌟'
      });
    }

    this.toast(`📊 ${taskName}: ${progress}% complete`, 'info');
  },

  closeNotification() {
    document.getElementById('notification-popup').style.display = 'none';
  },

  // ─── Connection Status ───
  updateConnectionStatus(connected) {
    const el = document.getElementById('connection-status');
    if (connected) {
      el.textContent = '● Connected';
      el.classList.remove('disconnected');
    } else {
      el.textContent = '● Disconnected';
      el.classList.add('disconnected');
    }
  },

  // ─── Utilities ───
  escape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
};

// ─── Keyboard shortcuts ───
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('auth-screen').style.display !== 'none') {
    App.login();
  }
});

// ─── Auto-refresh elapsed times ───
setInterval(() => {
  if (App.currentView === 'project' && App.currentProject) {
    App.renderProjectDetail();
  }
}, 1000);
