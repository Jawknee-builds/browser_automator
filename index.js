import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { runAgent, getPlanOnly, generateJobNote } from './agent.js';
import { initScheduler, scheduleTask, getAllTasks, removeTask } from './scheduler.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

initScheduler();

app.get('/api/ping', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), model: 'qwen2.5:1.5b' });
});

const PORT = process.env.PORT || 3001;

app.post('/api/generate-job-note', async (req, res) => {
  const { jobInfo, userBackground } = req.body;
  if (!jobInfo || !userBackground) {
    return res.status(400).json({ error: 'jobInfo and userBackground are required' });
  }

  try {
    const note = await generateJobNote(jobInfo, userBackground);
    res.json({ note });
  } catch (error) {
    console.error('[Server] Job Note error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/run', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
  try {
    const results = await runAgent(prompt);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/plan', async (req, res) => {
  const { prompt, context } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
  try {
    const { steps } = await getPlanOnly(prompt, context);
    res.json({ steps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/schedule', (req, res) => {
  const { prompt, scheduledAt } = req.body;
  if (!prompt || !scheduledAt) {
    return res.status(400).json({ error: 'Prompt and scheduledAt are required' });
  }
  const task = { id: Date.now().toString(), prompt, scheduledAt };
  scheduleTask(task);
  res.json({ message: 'Task scheduled', task });
});

app.get('/api/tasks', (req, res) => {
  res.json(getAllTasks());
});

app.delete('/api/tasks/:id', (req, res) => {
  removeTask(req.params.id);
  res.json({ message: 'Task removed' });
});

app.listen(PORT, () => {
  console.log(`Qwen Automator Server running on port ${PORT}`);
});
