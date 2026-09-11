const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class TaskExecutor {
  constructor() {
    this.runningTasks = new Map(); // taskId -> { process, startTime, ... }
    this.wsClients = new Set();
    this.db = null;
    this.onProgress = null; // callback for notification system
  }

  setDB(db) { this.db = db; }

  addClient(ws) { this.wsClients.add(ws); }
  removeClient(ws) { this.wsClients.delete(ws); }

  broadcast(type, data) {
    const msg = JSON.stringify({ type, ...data });
    for (const ws of this.wsClients) {
      try { ws.send(msg); } catch {}
    }
  }

  isTaskRunning(taskId) {
    return this.runningTasks.has(taskId);
  }

  async executeTask(projectId, taskId) {
    if (this.runningTasks.has(taskId)) {
      return { error: 'Task is already running' };
    }

    const task = this.db.getTask(projectId, taskId);
    if (!task) return { error: 'Task not found' };

    const project = this.db.getProject(projectId);
    if (!project) return { error: 'Project not found' };

    // Mark as running
    this.db.updateTask(projectId, taskId, {
      status: 'running',
      startTime: new Date().toISOString(),
      progress: 0,
      output: []
    });

    this.broadcast('task_started', { projectId, taskId, task: this.db.getTask(projectId, taskId) });

    const taskState = {
      projectId,
      taskId,
      startTime: Date.now(),
      timeLimit: task.timeLimit ? task.timeLimit * 60 * 1000 : null, // convert minutes to ms
      output: [],
      step: 0,
      totalSteps: task.commands.length,
      killed: false,
      notificationTimer: null
    };

    this.runningTasks.set(taskId, taskState);

    try {
      await this._runCommands(taskState);
    } catch (err) {
      this.db.updateTask(projectId, taskId, {
        status: 'failed',
        output: [...taskState.output, { type: 'error', text: err.message }],
        endTime: new Date().toISOString()
      });
      this.broadcast('task_failed', { projectId, taskId, error: err.message });
    } finally {
      if (taskState.notificationTimer) clearInterval(taskState.notificationTimer);
      this.runningTasks.delete(taskId);
    }

    return { success: true };
  }

  async _runCommands(taskState) {
    const { projectId, taskId, timeLimit } = taskState;
    const task = this.db.getTask(projectId, taskId);

    // Set up timeout
    let timeoutId = null;
    if (timeLimit) {
      timeoutId = setTimeout(() => {
        this._killTask(taskState, 'timeout');
      }, timeLimit);
    }

    // Set up notification timer (every 20 minutes)
    taskState.notificationTimer = setInterval(() => {
      this._sendProgressNotification(taskState);
    }, 20 * 60 * 1000);

    for (let i = 0; i < task.commands.length; i++) {
      // Check if killed
      if (taskState.killed) break;

      taskState.step = i;
      const cmd = task.commands[i];
      const progress = Math.round(((i) / task.commands.length) * 100);

      this.db.updateTask(projectId, taskId, { progress });
      this.broadcast('task_progress', {
        projectId, taskId,
        progress,
        step: i + 1,
        totalSteps: task.commands.length,
        currentCommand: cmd
      });

      try {
        const result = await this._runCommand(cmd, taskState);
        taskState.output.push({ type: 'command', text: `> ${cmd}` });
        if (result.stdout) taskState.output.push({ type: 'stdout', text: result.stdout });
        if (result.stderr) taskState.output.push({ type: 'stderr', text: result.stderr });
        taskState.output.push({ type: 'success', text: `✓ Command ${i + 1}/${task.commands.length} completed` });

        this.db.updateTask(projectId, taskId, { output: [...taskState.output] });
        this.broadcast('task_output', {
          projectId, taskId,
          output: taskState.output.slice(-5) // last 5 lines
        });
      } catch (err) {
        taskState.output.push({ type: 'command', text: `> ${cmd}` });
        taskState.output.push({ type: 'error', text: `✗ Error: ${err.message}` });

        this.db.updateTask(projectId, taskId, { output: [...taskState.output] });
        this.broadcast('task_output', {
          projectId, taskId,
          output: taskState.output.slice(-5)
        });

        // Continue to next command even if one fails
      }
    }

    // Complete
    if (timeoutId) clearTimeout(timeoutId);

    const finalProgress = taskState.killed ? taskState.progress : 100;
    const finalStatus = taskState.killed
      ? (taskState.killed === 'timeout' ? 'timeout' : 'failed')
      : 'completed';

    this.db.updateTask(projectId, taskId, {
      status: finalStatus,
      progress: finalProgress,
      endTime: new Date().toISOString(),
      output: [...taskState.output, {
        type: finalStatus === 'completed' ? 'success' : 'error',
        text: finalStatus === 'completed'
          ? '✅ Task completed successfully!'
          : `❌ Task ${finalStatus === 'timeout' ? 'timed out' : 'failed'}`
      }]
    });

    this.broadcast('task_completed', {
      projectId, taskId,
      status: finalStatus,
      progress: finalProgress
    });
  }

  _runCommand(cmd, taskState) {
    return new Promise((resolve, reject) => {
      const timeout = 5 * 60 * 1000; // 5 min per command

      const child = exec(cmd, {
        cwd: process.cwd(),
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
        shell: true,
        env: { ...process.env, FORCE_COLOR: '0' }
      }, (error, stdout, stderr) => {
        if (error && error.killed) {
          reject(new Error('Command timed out (5 min limit per command)'));
        } else if (error) {
          resolve({ stdout: stdout || '', stderr: stderr || error.message });
        } else {
          resolve({ stdout: stdout || '', stderr: stderr || '' });
        }
      });

      // Store reference for killing
      taskState.process = child;
    });
  }

  _killTask(taskState, reason) {
    taskState.killed = reason;
    if (taskState.process) {
      try {
        taskState.process.kill('SIGTERM');
        setTimeout(() => {
          try { taskState.process.kill('SIGKILL'); } catch {}
        }, 3000);
      } catch {}
    }
  }

  _sendProgressNotification(taskState) {
    const task = this.db.getTask(taskState.projectId, taskState.taskId);
    if (!task) return;

    const elapsed = Math.round((Date.now() - taskState.startTime) / 60000);
    const remaining = taskState.timeLimit
      ? Math.round((taskState.timeLimit - (Date.now() - taskState.startTime)) / 60000)
      : null;

    const notification = {
      taskId: taskState.taskId,
      taskName: task.name,
      progress: task.progress,
      step: taskState.step + 1,
      totalSteps: taskState.totalSteps,
      elapsed: `${elapsed}m`,
      remaining: remaining !== null ? `${remaining}m` : 'N/A'
    };

    this.broadcast('notification', notification);
    if (this.onProgress) this.onProgress(notification);
  }

  stopTask(projectId, taskId) {
    const taskState = this.runningTasks.get(taskId);
    if (taskState) {
      this._killTask(taskState, 'stopped');
      return true;
    }
    return false;
  }

  getRunningTasks() {
    return Array.from(this.runningTasks.entries()).map(([id, state]) => ({
      taskId: id,
      projectId: state.projectId,
      elapsed: Date.now() - state.startTime,
      progress: state.step / state.totalSteps * 100
    }));
  }
}

module.exports = new TaskExecutor();
