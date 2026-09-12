const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class AIFreeAgent {
  constructor(db, executor) {
    this.db = db;
    this.executor = executor;
    this.apiKey = null;
    this.activeProject = null;
    this.pendingTasks = [];
  }

  setAPIKey(key) {
    this.apiKey = key;
    // Store in settings if provided
    if (key) {
      this.db.updateSettings({ aiApiKey: key });
    }
  }

  // ─── Start AI Agent for a project ───
  async start(projectId, apiKey) {
    const project = this.db.getProject(projectId);
    if (!project) return { error: 'Project not found' };

    if (!apiKey) apiKey = this.db.getSettings().aiApiKey;
    if (!apiKey) {
      // Auto-detect key from .env or environment
      apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    }
    this.setAPIKey(apiKey);

    this.activeProject = project;
    console.log(`🤖 AI Agent starting for project: ${project.name}`);

    // Phase 1: Analyze project and generate task plan
    const plan = await this._generatePlan(project);
    if (plan.error) {
      return { error: 'Failed to generate plan: ' + plan.error };
    }

    // Save tasks to database
    for (const task of plan.tasks) {
      this.db.createTask(projectId, {
        name: task.name,
        commands: task.commands,
        timeLimit: task.timeLimit || null
      });
    }

    // Phase 2: Execute tasks with AI supervision
    await this._executePlan(projectId, plan);

    return { success: true, plan };
  }

  // ─── Generate Plan using AI ───
  async _generatePlan(project) {
    const prompt = `You are an elite autonomous AI developer. You have been given a project goal and must break it down into a detailed, executable plan using shell commands.

PROJECT GOAL:
"${project.description}"

PROJECT NAME: ${project.name}

INSTRUCTIONS:
- Create a COMPLETE, PRODUCTION-READY implementation plan
- Each task should have 1-3 focused shell commands
- Use 'cat > file << 'EOF'' heredocs to write actual code files
- Write REAL, WORKING code in the heredocs — not placeholder text
- Tasks should cover: directory setup, all source files, styling, scripts, config files
- Make the code impressive and complete — this is for a hackathon demo
- Each heredoc should contain full, functional code
- The final output should be a fully working project

Return a JSON array. Each task:
{
  "name": "Task description",
  "commands": ["shell command 1", "shell command 2"],
  "timeLimit": minutes
}

IMPORTANT: Write actual code. Make it look professional. Include animations, styling, proper structure.

Return ONLY valid JSON. No markdown, no explanation.`;

    try {
      const response = await this._callAI(prompt);
      const parsed = JSON.parse(response);
      if (!Array.isArray(parsed)) throw new Error('Expected array');
      return { tasks: parsed };
    } catch (err) {
      console.error('AI plan generation error:', err.message);
      // Fallback: generate basic plan from description keywords
      return this._generateFallbackPlan(project);
    }
  }

  async _callAI(prompt) {
    const apiKey = this.apiKey;

    // Try OpenAI first
    if (apiKey && apiKey.startsWith('sk-')) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 2000,
            temperature: 0.3
          })
        });
        if (response.ok) {
          const data = await response.json();
          return data.choices[0].message.content;
        }
      } catch (err) {}
    }

    // Try Anthropic
    if (apiKey && apiKey.startsWith('sk-ant-')) {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-3-5-haiku-20241022',
            max_tokens: 2000,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if (response.ok) {
          const data = await response.json();
          return data.content[0].text;
        }
      } catch (err) {}
    }

    throw new Error('No AI API key configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable, or enter key in the dashboard.');
  }

  _generateFallbackPlan(project) {
    const desc = (project.description || '').toLowerCase();
    const name = project.name.toLowerCase();

    const tasks = [];

    // Detect project type and create appropriate plans
    if (desc.match(/web|site|portfolio|blog|html|css|react|next|vue|svelte/) ||
        name.match(/web|site|portfolio|blog|app/)) {
      tasks.push({
        name: 'Create project directory structure',
        commands: [
          'mkdir -p public/css public/js public/img src',
          'touch public/index.html public/style.css public/app.js src/main.js'
        ],
        timeLimit: 5
      });
      tasks.push({
        name: 'Create HTML boilerplate',
        commands: [
          'cat > public/index.html << \'HTMLEOF\'',
          '<!DOCTYPE html>',
          '<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">',
          '<title>' + project.name + '</title><link rel="stylesheet" href="style.css">',
          '</head><body><h1>' + project.name + '</h1><script src="app.js"><\/script></body></html>',
          'HTMLEOF'
        ],
        timeLimit: 5
      });
      tasks.push({
        name: 'Create CSS foundation',
        commands: [
          'cat > public/style.css << \'CSSEOF\'',
          '* { margin: 0; padding: 0; box-sizing: border-box; }',
          'body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; background: #0a0a1a; color: #e8e8f0; }',
          'h1 { color: #6c5ce7; }',
          'CSSEOF'
        ],
        timeLimit: 5
      });
      tasks.push({
        name: 'Create JavaScript entry point',
        commands: [
          'cat > public/app.js << \'JSEOF\'',
          'console.log("' + project.name + ' loaded successfully");',
          'document.addEventListener("DOMContentLoaded", () => {',
          '  console.log("DOM ready");',
          '});',
          'JSEOF'
        ],
        timeLimit: 5
      });
      tasks.push({
        name: 'Initialize npm project',
        commands: ['npm init -y'],
        timeLimit: 3
      });
    }

    if (desc.match(/game|unity|godot|phaser|play|pixel|2d|3d|engine/) ||
        name.match(/game/)) {
      tasks.push({
        name: 'Set up game project folder',
        commands: ['mkdir -p game/assets/images game/assets/sounds game/src game/build'],
        timeLimit: 3
      });
      tasks.push({
        name: 'Create game config',
        commands: [
          'cat > game/config.json << EOF',
          '{"name": "' + project.name + '", "version": "1.0.0", "width": 800, "height": 600}',
          'EOF'
        ],
        timeLimit: 2
      });
      tasks.push({
        name: 'Create main game loop shell',
        commands: [
          'cat > game/src/main.js << EOF',
          '// Game entry point',
          'console.log("Game initialized");',
          'const CONFIG = require("../config.json");',
          'EOF'
        ],
        timeLimit: 3
      });
    }

    if (desc.match(/ai|ml|model|neural|train|llm|chatbot|gpt|machine learning/) ||
        name.match(/ai|bot|model|brain/)) {
      tasks.push({
        name: 'Set up Python AI project',
        commands: ['mkdir -p ai/src ai/data ai/models ai/training'],
        timeLimit: 3
      });
      tasks.push({
        name: 'Create requirements.txt',
        commands: [
          'cat > ai/requirements.txt << EOF',
          'openai==1.0.0',
          'numpy==1.24.0',
          'requests==2.31.0',
          'EOF'
        ],
        timeLimit: 2
      });
      tasks.push({
        name: 'Create main agent script skeleton',
        commands: [
          'cat > ai/src/agent.py << PYEOF',
          '#!/usr/bin/env python3',
          '"""AI Agent for ' + project.name + '"""',
          'import os, sys, json, time',
          '',
          'class Agent:',
          '    def __init__(self):',
          '        self.name = "' + project.name + '"',
          '        self.running = False',
          '',
          '    def start(self):',
          '        self.running = True',
          '        print(f"{self.name} agent started")',
          '',
          '    def process(self, input_data):',
          '        return {"result": "processed", "data": input_data}',
          '',
          'if __name__ == "__main__":',
          '    agent = Agent()',
          '    agent.start()',
          'PYEOF'
        ],
        timeLimit: 5
      });
    }

    if (desc.match(/hardware|arduino|raspberry|rpi|iot|sensor|circuit|esp|robot/) ||
        name.match(/hardware|sensor|robot|device|iot/)) {
      tasks.push({
        name: 'Create hardware project structure',
        commands: ['mkdir -p hardware/firmware hardware/docs hardware/schematics hardware/tests'],
        timeLimit: 3
      });
      tasks.push({
        name: 'Create firmware skeleton',
        commands: [
          'cat > hardware/firmware/main.cpp << CPPEOF',
          '#include <Arduino.h>',
          '// ' + project.name + ' Firmware',
          'void setup() {',
          '  Serial.begin(115200);',
          '  Serial.println("' + project.name + ' initialized");',
          '}',
          'void loop() {',
          '  delay(1000);',
          '}',
          'CPPEOF'
        ],
        timeLimit: 3
      });
      tasks.push({
        name: 'Create project README',
        commands: [
          'cat > hardware/README.md << EOF',
          '# ' + project.name + ' Hardware Project',
          '',
          '## Overview',
          'This project implements ' + (project.description || 'hardware functionality') + ' using embedded systems.',
          '',
          '## Folder Structure',
          '- firmware/ - Microcontroller code',
          '- docs/ - Documentation',
          '- schematics/ - Circuit diagrams',
          '- tests/ - Hardware tests',
          'EOF'
        ],
        timeLimit: 3
      });
    }

    // Generic fallback tasks
    if (tasks.length === 0) {
      tasks.push({
        name: 'Initialize project',
        commands: ['mkdir -p src docs tests', 'touch src/main.js README.md .gitignore'],
        timeLimit: 5
      });
      tasks.push({
        name: 'Create README',
        commands: [
          'cat > README.md << EOF',
          '# ' + project.name + ' (Stardance Project)',
          '',
          '## Description',
          '' + (project.description || 'A project built during the Stardance Challenge') + '',
          '',
          '## Getting Started',
          '1. Clone the repository',
          '2. Install dependencies (npm install)',
          '3. Run the application',
          '',
          '## Built with',
          '- Stardance Remote Control',
          '- AI Autonomous Agent',
          'EOF'
        ],
        timeLimit: 3
      });
      tasks.push({
        name: 'Create main source file',
        commands: [
          'cat > src/main.js << EOF',
          '// ' + project.name + ' - Main Entry Point',
          'console.log("Initializing ' + project.name + '...");',
          '',
          'const app = {',
          '  name: "' + project.name + '",',
          '  version: "1.0.0",',
          '  start() {',
          '    console.log("App started successfully");',
          '    return true;',
          '  }',
          '};',
          '',
          'if (require.main === module) {',
          '  app.start();',
          '}',
          'module.exports = app;',
          'EOF'
        ],
        timeLimit: 5
      });
    }

    return { tasks };
  }

  // ─── Execute Plan with Supervision ───
  async _executePlan(projectId, plan) {
    const project = this.db.getProject(projectId);
    if (!project) return;

    console.log(`\n🤖 Executing ${plan.tasks.length} tasks for ${project.name}...\n`);

    for (let i = 0; i < plan.tasks.length; i++) {
      const taskDef = plan.tasks[i];
      const tasks = this.db.getTasks(projectId);
      const task = tasks.find(t => t.name === taskDef.name);

      if (!task) {
        console.log(`[Task ${i+1}/${plan.tasks.length}] SKIPPED: ${taskDef.name} - not found in DB`);
        continue;
      }

      console.log(`[Task ${i+1}/${plan.tasks.length}] EXECUTING: ${taskDef.name}`);

      // Run the task
      await this.executor.executeTask(projectId, task.id);

      // Check result
      const result = this.db.getTask(projectId, task.id);
      if (result.status === 'failed' || result.status === 'timeout') {
        console.log(`[Task ${i+1}/${plan.tasks.length}] FAILED: ${taskDef.name} - attempting fix...`);

        // Try to fix: re-run with adjusted commands if possible
        const fixAttempt = await this._attemptFix(projectId, task.id, result);
        if (!fixAttempt.success) {
          console.log(`[Task ${i+1}/${plan.tasks.length}] Could not fix: ${taskDef.name}`);
        }
      } else {
        console.log(`[Task ${i+1}/${plan.tasks.length}] COMPLETED: ${taskDef.name} (${result.progress}%)`);
      }
    }

    console.log(`\n🤖 AI Agent finished for project: ${project.name}`);
  }

  async _attemptFix(projectId, taskId, taskResult) {
    // Simple retry for now
    console.log(`  → Retrying task...`);

    // Retry once
    await this.executor.executeTask(projectId, taskId);

    const retryResult = this.db.getTask(projectId, taskId);
    if (retryResult.status === 'completed') {
      console.log(`  → Fix successful on retry!`);
      return { success: true };
    }

    return { success: false, reason: 'Retry also failed' };
  }

  // ─── Stop Agent ───
  stop() {
    this.activeProject = null;
    this.pendingTasks = [];
    console.log('🤖 AI Agent stopped');
  }

  // ─── Get Status ───
  getStatus() {
    return {
      active: !!this.activeProject,
      project: this.activeProject ? { id: this.activeProject.id, name: this.activeProject.name } : null,
      pendingTasks: this.pendingTasks.length,
      apiKey: this.apiKey ? '(configured)' : '(not set)'
    };
  }
}

module.exports = AIFreeAgent;
