const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const config = require('../../config.json');
const { scanImages } = require('../services/scanner');
const { compressImage } = require('../services/compressor');
const cacheManager = require('../services/cacheManager');
const { replaceOriginals, revertOriginals } = require('../services/replacer');

const router = express.Router();

/**
 * POST /api/scan
 * Scan target directory for images and compress them into cache.
 */
router.post('/scan', async (req, res) => {
  try {
    const targetDir = req.body.targetDir || config.targetDir;

    if (!await fs.pathExists(targetDir)) {
      return res.status(400).json({ success: false, error: `Directory does not exist: ${targetDir}` });
    }

    const images = await scanImages(targetDir);
    cacheManager.setImages(images);

    // Compress all images with a concurrency limit
    const concurrency = 4;

    async function processOne(image) {
      const result = await compressImage(image.path);
      cacheManager.updateCompressionResult(image.id, result);
    }

    async function runPool(tasks, limit) {
      const results = [];
      const executing = [];

      for (const task of tasks) {
        const promise = Promise.resolve().then(() => processOne(task));
        results.push(promise);

        if (tasks.length >= limit) {
          const cleanup = promise.then(() => {
            executing.splice(executing.indexOf(cleanup), 1);
          });
          executing.push(cleanup);
          if (executing.length >= limit) {
            await Promise.race(executing);
          }
        }
      }

      await Promise.all(results);
    }

    await runPool(images, concurrency);

    return res.json({
      success: true,
      data: cacheManager.getAllImages()
    });
  } catch (err) {
    console.error('Scan error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/images
 * Return all scanned/compressed images.
 */
router.get('/images', (req, res) => {
  return res.json({
    success: true,
    data: cacheManager.getAllImages()
  });
});

/**
 * POST /api/replace
 * Replace selected original images with compressed versions.
 */
router.post('/replace', async (req, res) => {
  try {
    const ids = req.body.ids || [];
    if (ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No image IDs provided' });
    }

    const result = await replaceOriginals(ids);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Replace error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/revert
 * Revert selected images to their original backups.
 */
router.post('/revert', async (req, res) => {
  try {
    const ids = req.body.ids || [];
    if (ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No image IDs provided' });
    }

    const result = await revertOriginals(ids);
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('Revert error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
