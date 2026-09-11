const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

class Database {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    } catch {
      const fresh = { projects: [], settings: { authKey: 'keshu@4567', schoolMode: false, notificationInterval: 20 } };
      fs.writeFileSync(DB_PATH, JSON.stringify(fresh, null, 2));
      return fresh;
    }
  }

  save() {
    fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2));
  }

  // --- Projects ---
  getProjects() { return this.data.projects; }

  getProject(id) { return this.data.projects.find(p => p.id === id); }

  createProject({ name, description, timeLimit, questions }) {
    const project = {
      id: 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name,
      description,
      timeLimit: timeLimit || null,
      questions: questions || [],
      status: 'created', // created | running | completed | failed
      progress: 0,
      tasks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.data.projects.unshift(project);
    this.save();
    return project;
  }

  updateProject(id, updates) {
    const project = this.getProject(id);
    if (!project) return null;
    Object.assign(project, updates, { updatedAt: new Date().toISOString() });
    this.save();
    return project;
  }

  deleteProject(id) {
    this.data.projects = this.data.projects.filter(p => p.id !== id);
    this.save();
  }

  // --- Tasks ---
  getTasks(projectId) {
    const project = this.getProject(projectId);
    return project ? project.tasks : [];
  }

  getTask(projectId, taskId) {
    const project = this.getProject(projectId);
    if (!project) return null;
    return project.tasks.find(t => t.id === taskId);
  }

  createTask(projectId, { name, commands, timeLimit }) {
    const project = this.getProject(projectId);
    if (!project) return null;

    const task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: name || 'Untitled Task',
      status: 'pending', // pending | running | completed | failed | timeout
      progress: 0,
      commands: commands || [],
      output: [],
      startTime: null,
      endTime: null,
      timeLimit: timeLimit || null,
      createdAt: new Date().toISOString()
    };

    project.tasks.push(task);
    project.status = 'created';
    this.save();
    return task;
  }

  updateTask(projectId, taskId, updates) {
    const project = this.getProject(projectId);
    if (!project) return null;
    const task = project.tasks.find(t => t.id === taskId);
    if (!task) return null;
    Object.assign(task, updates);

    // Update project progress based on tasks
    if (project.tasks.length > 0) {
      const totalProgress = project.tasks.reduce((sum, t) => sum + t.progress, 0);
      project.progress = Math.round(totalProgress / project.tasks.length);
    }

    // Update project status based on task statuses
    const statuses = project.tasks.map(t => t.status);
    if (statuses.every(s => s === 'completed')) project.status = 'completed';
    else if (statuses.some(s => s === 'running')) project.status = 'running';
    else if (statuses.some(s => s === 'failed' || s === 'timeout')) project.status = 'failed';
    else project.status = 'created';

    project.updatedAt = new Date().toISOString();
    this.save();
    return task;
  }

  // --- Settings ---
  getSettings() { return this.data.settings; }

  updateSettings(updates) {
    Object.assign(this.data.settings, updates);
    this.save();
    return this.data.settings;
  }
}

module.exports = new Database();
