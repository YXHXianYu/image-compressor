const path = require('path');
const fs = require('fs-extra');
const { glob } = require('glob');
const sharp = require('sharp');
const config = require('../../config.json');

const SUPPORTED_FORMATS = new Set(config.supportedFormats.map(f => f.toLowerCase()));
const IGNORED_DIRS = new Set(config.ignoredDirs);

/**
 * Check if a path should be ignored.
 * @param {string} filePath
 * @returns {boolean}
 */
function isIgnored(filePath) {
  const parts = filePath.split(/[\\/]/);
  return parts.some(part => IGNORED_DIRS.has(part));
}

/**
 * Get image dimensions and format using Sharp.
 * @param {string} filePath
 * @returns {Promise<{width: number, height: number, format: string}>}
 */
async function getImageMetadata(filePath) {
  try {
    const metadata = await sharp(filePath).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0,
      format: (metadata.format || path.extname(filePath).slice(1)).toLowerCase()
    };
  } catch (err) {
    console.warn(`Failed to read metadata for ${filePath}:`, err.message);
    return { width: 0, height: 0, format: path.extname(filePath).slice(1).toLowerCase() };
  }
}

/**
 * Scan target directory for images.
 * @param {string} targetDir
 * @returns {Promise<Array<Object>>}
 */
async function scanImages(targetDir) {
  if (!await fs.pathExists(targetDir)) {
    throw new Error(`Target directory does not exist: ${targetDir}`);
  }

  const patterns = config.supportedFormats.map(ext => path.posix.join(targetDir.replace(/\\/g, '/'), '**', `*.${ext}`));
  const matchedFiles = [];

  for (const pattern of patterns) {
    const files = await glob(pattern, { absolute: true, nocase: true });
    matchedFiles.push(...files);
  }

  const uniqueFiles = [...new Set(matchedFiles)].filter(file => !isIgnored(file));

  const results = [];
  for (const filePath of uniqueFiles) {
    const stats = await fs.stat(filePath);
    const metadata = await getImageMetadata(filePath);

    results.push({
      id: null, // Will be assigned by cache/compressor service
      path: filePath,
      name: path.basename(filePath),
      dir: path.dirname(filePath),
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      originalSize: stats.size,
      compressedSize: 0,
      savingRatio: 0,
      cachePath: null,
      compressed: false,
      error: null
    });
  }

  // Sort by original size descending (largest first)
  results.sort((a, b) => b.originalSize - a.originalSize);

  return results;
}

module.exports = { scanImages, SUPPORTED_FORMATS };
