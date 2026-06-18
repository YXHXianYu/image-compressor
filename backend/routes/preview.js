const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const cacheManager = require('../services/cacheManager');

const router = express.Router();

/**
 * Serve an image file with proper content type.
 */
async function serveImage(res, filePath) {
  if (!await fs.pathExists(filePath)) {
    return res.status(404).json({ success: false, error: 'Image not found' });
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  };

  res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
  res.sendFile(path.resolve(filePath));
}

/**
 * GET /api/preview/:id/original
 * Serve the original image.
 */
router.get('/:id/original', async (req, res) => {
  try {
    const image = cacheManager.getImage(req.params.id);
    if (!image) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }
    return serveImage(res, image.path);
  } catch (err) {
    console.error('Preview original error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/preview/:id/compressed
 * Serve the compressed cached image.
 */
router.get('/:id/compressed', async (req, res) => {
  try {
    const image = cacheManager.getImage(req.params.id);
    if (!image) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    if (!image.cachePath) {
      return res.status(404).json({ success: false, error: 'Compressed image not available' });
    }

    return serveImage(res, image.cachePath);
  } catch (err) {
    console.error('Preview compressed error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/preview/:id/thumbnail
 * Serve a small thumbnail for the list view.
 */
router.get('/:id/thumbnail', async (req, res) => {
  try {
    const image = cacheManager.getImage(req.params.id);
    if (!image) {
      return res.status(404).json({ success: false, error: 'Image not found' });
    }

    if (image.thumbnailPath && await fs.pathExists(image.thumbnailPath)) {
      return serveImage(res, image.thumbnailPath);
    }

    // Fallback to compressed image if thumbnail not available
    if (image.cachePath) {
      return serveImage(res, image.cachePath);
    }

    return res.status(404).json({ success: false, error: 'Thumbnail not available' });
  } catch (err) {
    console.error('Preview thumbnail error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
