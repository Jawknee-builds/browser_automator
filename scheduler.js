import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { runAgent } from './agent.js';

const TASKS_FILE = path.resolve('./tasks.json');

// Memory store for active cron jobs
const activeJobs = new Map();

export function initScheduler() {
  console.log('[Scheduler] Initializing...');
  const tasks = loadTasks();
  tasks.forEach(task => {
    if (new Date(task.scheduledAt) > new Date()) {
      scheduleTask(task);
    }
  });
}

function loadTasks() {
  if (!fs.existsSync(TASKS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function saveTasks(tasks) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

export function scheduleTask(task) {
  const { id, prompt, scheduledAt } = task;
  const date = new Date(scheduledAt);
  
  // Convert date to cron expression (once at this time)
  const cronTime = `${date.getMinutes()} ${date.getHours()} ${date.getDate()} ${date.getMonth() + 1} *`;
  
  console.log(`[Scheduler] Scheduling task ${id} for ${date.toLocaleString()}`);
  
  const job = cron.schedule(cronTime, async () => {
    console.log(`[Scheduler] Executing scheduled task ${id}: "${prompt}"`);
    try {
      await runAgent(prompt);
      console.log(`[Scheduler] Task ${id} completed.`);
    } catch (err) {
      console.error(`[Scheduler] Task ${id} failed:`, err);
    } finally {
      removeTask(id);
    }
  }, {
    scheduled: true,
    timezone: "UTC" // Or system timezone
  });

  activeJobs.set(id, job);
  
  // Save to persistence if new
  const tasks = loadTasks();
  if (!tasks.find(t => t.id === id)) {
    tasks.push(task);
    saveTasks(tasks);
  }
}

export function removeTask(id) {
  const job = activeJobs.get(id);
  if (job) {
    job.stop();
    activeJobs.delete(id);
  }
  const tasks = loadTasks().filter(t => t.id !== id);
  saveTasks(tasks);
}

export function getAllTasks() {
  return loadTasks();
}
