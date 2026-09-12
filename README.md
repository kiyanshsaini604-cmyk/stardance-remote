# 🤖 AI Autonomous Task System

**Stardance Challenge Project** — An autonomous AI agent that plans, executes, and self-corrects on software development tasks.

---

## Overview

This system is a **remote-controlled AI developer** that runs on your machine. You give it a project goal, and it:

1. **Plans** — Uses AI (GPT-4 / Claude) to break the project into executable tasks
2. **Executes** — Runs shell commands to create files, install dependencies, write code
3. **Supervises** — Monitors progress in real-time via WebSocket
4. **Self-corrects** — Retries failed tasks automatically
5. **Notifies** — Sends progress reports every 20 minutes

It works in **School Mode** — tasks run in the background even when you're not at your computer.

---

## How It Works

```
User gives project idea
  → AI generates task plan (via OpenAI/Claude API)
  → Tasks saved to database
  → School Mode scheduler auto-runs pending tasks
  → Executor runs shell commands with progress tracking
  → WebSocket dashboard shows real-time updates
  → Notifications every 20 minutes
  → Failed tasks auto-retried
```

---

## Architecture

| Component | Purpose |
|-----------|---------|
| `server.js` | Express.js backend with WebSocket, REST API, auth |
| `agent.js` | AI agent that plans and supervises task execution |
| `executor.js` | Command runner with progress tracking and timeout |
| `scheduler.js` | School mode — auto-runs pending tasks in background |
| `database.js` | JSON file persistence for projects/tasks/settings |
| `devlog.js` | Auto-generates Stardance submission devlogs |

---

## Features

### 🎯 AI Task Planning
Describe any project idea and the AI generates a concrete plan of shell commands. Supports OpenAI and Anthropic APIs.

### 🏫 School Mode
Toggle school mode ON and tasks auto-execute in the background every 30 seconds. Works offline. No internet required for execution.

### 📊 Real-Time Dashboard
Jarvis HUD-style interface with:
- Live progress bars
- Real-time WebSocket updates
- Task status badges (pending/running/completed/failed)
- Terminal output streaming

### 🔔 Progress Notifications
Browser and system notifications every 20 minutes with progress reports. Works in the background.

### 📝 Auto Devlog Generation
One-click generation of formatted Stardance submission devlogs in Markdown.

### 🔐 Secure Access
Auth key authentication. Accessible from any device on the same network.

---

## Tech Stack

- **Backend:** Node.js, Express.js, WebSocket
- **AI:** OpenAI GPT-4o-mini / Anthropic Claude (configurable)
- **Frontend:** HTML5, CSS3 (custom Jarvis HUD theme), Vanilla JS
- **Persistence:** JSON file storage
- **Notifications:** node-notifier, browserNotification API

---

## How to Use

### Starting the System

```bash
node server.js
```

Open `http://localhost:3000` and enter auth key: `keshu@4567`

### Creating a Project

1. Click **+ NEW PROJECT**
2. Enter a project name and description (e.g., "Build a personal portfolio website")
3. Answer the auto-generated clarifying questions (tech stack, features, design)
4. Set a time limit if needed

### Running the AI Agent

1. Open your project
2. Click **▶ START AGENT**
3. Enter your OpenAI or Anthropic API key when prompted
4. The agent will generate a plan, create tasks, and start executing

### School Mode

1. Toggle **SCHOOL MODE** on the dashboard
2. Add tasks to your project (or let the AI agent create them)
3. Turn off your computer — tasks run in the background
4. Come back and check progress

### Generating a Devlog

1. Open your project page
2. Click **📝 GENERATE DEVLOG**
3. Copy the Markdown and paste it on your Stardance project page
4. Add a screenshot of the dashboard

---

## Stardance Submission

This project is built as part of the **Stardance Challenge** by Hack Club ( partnered with NASA and AMD).

- **Project Type:** Software / AI / Systems
- **Hours Invested:** Tracked via Stardance dashboard
- **Skills Used:** Node.js, Express, WebSocket, AI API integration, system design, UI/UX

---

## Future Improvements

- [ ] Multi-model AI fallback (auto-switch if one model fails)
- [ ] Task dependency tracking (run tasks in order)
- [ ] Code review step (AI reviews generated code)
- [ ] Remote deployment (deploy built projects to hosting)
- [ ] Team collaboration (multiple users on same project)
- [ ] Persistent session history (resume after reboot)

---

*Built during the Stardance Challenge — Summer 2026*
