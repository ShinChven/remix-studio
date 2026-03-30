import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const IMAGES_DIR = path.join(DATA_DIR, 'images');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure directories exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR);
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ libraries: [], projects: [] }));

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get('/api/data', (req, res) => {
    try {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      
      // Migrate old 'batches' to 'projects'
      if (parsed.batches && !parsed.projects) {
        parsed.projects = parsed.batches;
        delete parsed.batches;
        fs.writeFileSync(DB_FILE, JSON.stringify(parsed, null, 2));
      }
      
      res.json(parsed);
    } catch (e) {
      res.status(500).json({ error: 'Failed to read data' });
    }
  });

  app.post('/api/data', (req, res) => {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to save data' });
    }
  });

  app.post('/api/images', (req, res) => {
    try {
      const { base64, projectId } = req.body;
      if (!base64) return res.status(400).json({ error: 'No image data' });

      const safeProjectId = projectId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const projectDir = path.join(IMAGES_DIR, safeProjectId);
      
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
      const filepath = path.join(projectDir, filename);
      
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, "");
      fs.writeFileSync(filepath, base64Data, 'base64');

      res.json({ url: `/images/${safeProjectId}/${filename}` });
    } catch (e) {
      res.status(500).json({ error: 'Failed to save image' });
    }
  });

  app.post('/api/projects/rename', (req, res) => {
    try {
      const { oldId, newId } = req.body;
      if (!oldId || !newId) return res.status(400).json({ error: 'Missing IDs' });

      const safeOldId = oldId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const safeNewId = newId.replace(/[^a-zA-Z0-9-_]/g, '_');
      
      const oldDir = path.join(IMAGES_DIR, safeOldId);
      const newDir = path.join(IMAGES_DIR, safeNewId);

      if (fs.existsSync(oldDir)) {
        if (!fs.existsSync(newDir)) {
          fs.renameSync(oldDir, newDir);
        } else {
          // If the new directory already exists, we might need to move files over
          // For simplicity, just rename if it doesn't exist, otherwise return error or merge
          // Let's just merge files
          const files = fs.readdirSync(oldDir);
          for (const file of files) {
            fs.renameSync(path.join(oldDir, file), path.join(newDir, file));
          }
          fs.rmdirSync(oldDir);
        }
      }

      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: 'Failed to rename project folder' });
    }
  });

  app.use('/images', express.static(IMAGES_DIR));

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
