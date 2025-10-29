import express, { Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Paths
const projectRoot = path.resolve(__dirname, '../..');
const agentDir = path.join(projectRoot, 'agent');
const problemsDir = path.join(agentDir, 'problems');

// Ensure directories exist
if (!fs.existsSync(agentDir)) {
  fs.mkdirSync(agentDir, { recursive: true });
}
if (!fs.existsSync(problemsDir)) {
  fs.mkdirSync(problemsDir, { recursive: true });
}

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Query endpoint with SSE streaming
app.post(
  '/api/query',
  upload.array('files'),
  async (req: Request, res: Response) => {
    const { content } = req.body;
    const files = req.files as Express.Multer.File[];

    console.log('Received query:', content);
    console.log('Files:', files?.length || 0);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const abortController = new AbortController();

    // Track initial output files
    let initialOutputFiles: string[] = [];
    try {
      if (fs.existsSync(agentDir)) {
        initialOutputFiles = fs.readdirSync(agentDir).filter((file) => {
          const filePath = path.join(agentDir, file);
          const ext = path.extname(file).toLowerCase();
          return (
            fs.statSync(filePath).isFile() &&
            (ext === '.xlsx' || ext === '.csv')
          );
        });
      }
    } catch (error) {
      console.warn('Could not read initial output directory:', error);
    }

    const BASE_PROMPT = '';
    let prompt = BASE_PROMPT + content;

    try {
      // Handle uploaded files
      if (files && files.length > 0) {
        for (const file of files) {
          try {
            // Validate file size
            if (file.size > 10 * 1024 * 1024) {
              console.warn(
                `File ${file.originalname} is too large (${Math.round(file.size / 1024 / 1024)}MB), skipping`
              );
              const errorData = {
                type: 'error',
                message: `File ${file.originalname} is too large. Maximum size is 10MB.`,
              };
              res.write(`data: ${JSON.stringify(errorData)}\n\n`);
              continue;
            }

            // Generate unique filename
            const timestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 8);
            const ext = path.extname(file.originalname);
            const baseName = path.basename(file.originalname, ext);
            const uniqueFileName = `${baseName}_${timestamp}_${randomSuffix}${ext}`;
            const filePath = path.join(problemsDir, uniqueFileName);

            // Save file
            await fs.promises.writeFile(filePath, file.buffer);
            console.log(`Saved file: ${uniqueFileName} to ${problemsDir}`);

            // Append file information to prompt
            prompt += `\n\nUploaded file: ${uniqueFileName} (saved to ${filePath})`;
          } catch (fileError) {
            console.error(`Error processing file ${file.originalname}:`, fileError);
            const errorData = {
              type: 'error',
              message: `Failed to save file ${file.originalname}`,
            };
            res.write(`data: ${JSON.stringify(errorData)}\n\n`);
          }
        }
      }

      // Run Claude Agent SDK query
      const queryIterator = query({
        prompt,
        options: {
          cwd: agentDir,
          abortController,
          maxTurns: 100,
          settingSources: ['local', 'project'],
          allowedTools: [
            'Bash',
            'Create',
            'Edit',
            'Read',
            'Write',
            'MultiEdit',
            'WebSearch',
            'GrepTool',
            'Skill',
            'TodoWrite',
            'TodoEdit',
          ],
        },
      });

      // Stream responses
      for await (const message of queryIterator) {
        console.log('Streaming message:', JSON.stringify(message));
        const data = { type: 'message', data: message };
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }

      // Check for new output files
      try {
        if (fs.existsSync(agentDir)) {
          const finalOutputFiles = fs.readdirSync(agentDir);
          const newFiles = finalOutputFiles.filter((file) => {
            if (initialOutputFiles.includes(file)) {
              return false;
            }
            const filePath = path.join(agentDir, file);
            const ext = path.extname(file).toLowerCase();
            return (
              fs.statSync(filePath).isFile() &&
              (ext === '.xlsx' || ext === '.csv')
            );
          });

          if (newFiles.length > 0) {
            const outputFiles = newFiles.map((fileName) => ({
              name: fileName,
              path: path.join(agentDir, fileName),
              size: fs.statSync(path.join(agentDir, fileName)).size,
              created: fs.statSync(path.join(agentDir, fileName)).mtime,
            }));

            console.log('New output files detected:', outputFiles);
            const outputData = { type: 'output-files', data: outputFiles };
            res.write(`data: ${JSON.stringify(outputData)}\n\n`);
          }
        }
      } catch (error) {
        console.warn('Error checking for output files:', error);
      }

      // Send completion message
      const completeData = { type: 'complete' };
      res.write(`data: ${JSON.stringify(completeData)}\n\n`);
      res.end();

      console.log('Query completed successfully');
    } catch (error) {
      console.error('Claude Code SDK error:', error);
      const errorData = {
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
      res.write(`data: ${JSON.stringify(errorData)}\n\n`);
      res.end();
    }

    // Clean up on client disconnect
    req.on('close', () => {
      console.log('Client disconnected, aborting query');
      abortController.abort();
    });
  }
);

// Download file endpoint
app.get('/api/download/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(agentDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Security check: ensure file is within agent directory
    const resolvedPath = path.resolve(filePath);
    const resolvedAgentDir = path.resolve(agentDir);
    if (!resolvedPath.startsWith(resolvedAgentDir)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.download(filePath, filename);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// List output files endpoint
app.get('/api/files', (req: Request, res: Response) => {
  try {
    if (!fs.existsSync(agentDir)) {
      return res.json([]);
    }

    const files = fs
      .readdirSync(agentDir)
      .filter((file) => {
        const filePath = path.join(agentDir, file);
        const ext = path.extname(file).toLowerCase();
        return (
          fs.statSync(filePath).isFile() &&
          (ext === '.xlsx' || ext === '.csv')
        );
      })
      .map((fileName) => ({
        name: fileName,
        path: path.join(agentDir, fileName),
        size: fs.statSync(path.join(agentDir, fileName)).size,
        created: fs.statSync(path.join(agentDir, fileName)).mtime,
      }));

    res.json(files);
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Agent directory: ${agentDir}`);
  console.log(`Problems directory: ${problemsDir}`);
});
