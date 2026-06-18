const path = require('path');
const fs = require('fs-extra');
const cacheManager = require('./cacheManager');

/**
 * Replace original images with their compressed cached versions.
 * Backups the original to cache/<hash>/backup/.
 * @param {Array<string>} ids
 * @returns {Promise<{replaced: Array<string>, failed: Array<Object>}>}
 */
async function replaceOriginals(ids) {
  const replaced = [];
  const failed = [];

  for (const id of ids) {
    const image = cacheManager.getImage(id);
    if (!image) {
      failed.push({ id, error: 'Image not found' });
      continue;
    }

    if (!image.compressed || !image.cachePath) {
      failed.push({ id, error: 'Image not compressed or cache missing' });
      continue;
    }

    try {
      const originalPath = image.path;
      const cacheDir = path.dirname(image.cachePath);
      const backupDir = path.join(cacheDir, 'backup');
      const backupPath = path.join(backupDir, path.basename(originalPath));

      await fs.ensureDir(backupDir);

      // Backup original if not already backed up
      if (!await fs.pathExists(backupPath)) {
        await fs.copy(originalPath, backupPath);
      }

      // Replace original with compressed version
      await fs.copy(image.cachePath, originalPath, { overwrite: true });

      replaced.push(id);
    } catch (err) {
      console.error(`Failed to replace ${image.path}:`, err);
      failed.push({ id, error: err.message });
    }
  }

  return { replaced, failed };
}

/**
 * Revert replaced images to their original backups.
 * @param {Array<string>} ids
 * @returns {Promise<{reverted: Array<string>, failed: Array<Object>}>}
 */
async function revertOriginals(ids) {
  const reverted = [];
  const failed = [];

  for (const id of ids) {
    const image = cacheManager.getImage(id);
    if (!image) {
      failed.push({ id, error: 'Image not found' });
      continue;
    }

    try {
      const originalPath = image.path;
      const cacheDir = path.dirname(image.cachePath || '');
      const backupPath = path.join(cacheDir, 'backup', path.basename(originalPath));

      if (!await fs.pathExists(backupPath)) {
        failed.push({ id, error: 'Backup not found' });
        continue;
      }

      await fs.copy(backupPath, originalPath, { overwrite: true });
      reverted.push(id);
    } catch (err) {
      console.error(`Failed to revert ${image.path}:`, err);
      failed.push({ id, error: err.message });
    }
  }

  return { reverted, failed };
}

module.exports = { replaceOriginals, revertOriginals };
