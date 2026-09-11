const { notifier } = require('node-notifier');

class Scheduler {
  constructor() {
    this.db = null;
    this.executor = null;
    this.checkInterval = null;
    this.notificationTimers = new Map(); // taskId -> last notification time
  }

  setDB(db) { this.db = db; }
  setExecutor(executor) { this.executor = executor; }

  start() {
    // Check for pending tasks every 30 seconds
    this.checkInterval = setInterval(() => this._checkPendingTasks(), 30 * 1000);
    console.log('⏰ Scheduler started (checking every 30s)');
  }

  stop() {
    if (this.checkInterval) clearInterval(this.checkInterval);
    this.notificationTimers.clear();
    console.log('⏰ Scheduler stopped');
  }

  _checkPendingTasks() {
    const settings = this.db.getSettings();
    if (!settings.schoolMode) return;

    const projects = this.db.getProjects();
    for (const project of projects) {
      // Skip completed/failed projects
      if (project.status === 'completed' || project.status === 'failed') continue;

      for (const task of project.tasks) {
        // Only auto-run pending tasks that aren't already running
        if (task.status === 'pending' && !this.executor.isTaskRunning(task.id)) {
          console.log(`🏫 School mode: Auto-starting task "${task.name}" in project "${project.name}"`);
          this.executor.executeTask(project.id, task.id);

          // Send notification
          this._sendSystemNotification(
            `School Mode: Task Started`,
            `Starting "${task.name}" in project "${project.name}"`
          );
        }
      }
    }
  }

  _sendSystemNotification(title, message) {
    try {
      notifier.notify({
        title: `🌟 ${title}`,
        message: message,
        sound: true,
        wait: false,
        icon: null
      });
    } catch (err) {
      // Fallback: just log
      console.log(`🔔 ${title}: ${message}`);
    }
  }

  sendProgressNotification(notification) {
    const { taskId, taskName, progress, step, totalSteps, elapsed, remaining } = notification;

    const title = `📊 Progress: ${taskName}`;
    const message = `Progress: ${progress}% | Step ${step}/${totalSteps}\nElapsed: ${elapsed} | Remaining: ${remaining}`;

    this._sendSystemNotification(title, message);
    console.log(`📊 ${title} - ${message}`);
  }

  // Get notification timer status for a task
  getNotificationStatus(taskId) {
    return this.notificationTimers.has(taskId);
  }
}

module.exports = new Scheduler();
