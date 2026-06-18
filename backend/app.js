const express = require('express');
const path = require('path');
const config = require('../config.json');
const imagesRouter = require('./routes/images');
const previewRouter = require('./routes/preview');

const app = express();
const PORT = process.env.PORT || 3456;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes
app.use('/api', imagesRouter);
app.use('/api/preview', previewRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'ok', targetDir: config.targetDir });
});

// Serve index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Image Compressor Web running at http://localhost:${PORT}`);
  console.log(`Target directory: ${config.targetDir}`);
  console.log(`Strategy: ${config.strategy}, maxFileSizeKB: ${config.maxFileSizeKB}, minQuality: ${config.minQuality}`);
});
