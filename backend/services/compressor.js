const path = require('path');
const fs = require('fs-extra');
const sharp = require('sharp');
const { getFileHash, getStringHash } = require('../utils/hash');
const config = require('../../config.json');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CACHE_DIR = path.join(PROJECT_ROOT, 'cache');

const QUALITY_STEP = 5;
const THUMBNAIL_WIDTH = 200;
const THUMBNAIL_QUALITY = 75;

/**
 * Ensure cache directory exists.
 */
async function ensureCacheDir() {
  await fs.ensureDir(CACHE_DIR);
}

/**
 * Build a cache key from file content + compression config.
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function getCacheKey(filePath) {
  const fileHash = getFileHash(filePath);
  const configStr = JSON.stringify({
    maxFileSizeKB: config.maxFileSizeKB,
    minQuality: config.minQuality,
    strategy: config.strategy,
    formatSettings: config.outputFormats
  });
  return `${fileHash}_${getStringHash(configStr)}`;
}

/**
 * Get cache path for an image.
 * @param {string} filePath
 * @returns {Promise<{cacheKey: string, cacheFilePath: string}>}
 */
async function getCachePath(filePath) {
  const cacheKey = await getCacheKey(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);
  const cacheFilePath = path.join(CACHE_DIR, cacheKey, `${baseName}${ext}`);
  return { cacheKey, cacheFilePath };
}

/**
 * Get image metadata using Sharp.
 * @param {string} inputPath
 */
async function getMetadata(inputPath) {
  return sharp(inputPath).metadata();
}

/**
 * Compress an image according to the configured strategy.
 * @param {string} inputPath
 * @returns {Promise<{success: boolean, cachePath: string|null, compressedSize: number, quality: number, error: string|null}>}
 */
async function compressImage(inputPath) {
  await ensureCacheDir();

  const ext = path.extname(inputPath).toLowerCase();
  const format = ext.slice(1);

  // Skip GIF and SVG
  if (format === 'gif' || format === 'svg') {
    return {
      success: false,
      cachePath: null,
      compressedSize: 0,
      quality: 0,
      error: `Format '${format}' is not compressed by this tool.`
    };
  }

  const { cacheKey, cacheFilePath } = await getCachePath(inputPath);
  const cacheMetaPath = path.join(CACHE_DIR, cacheKey, 'meta.json');
  const thumbnailPath = path.join(CACHE_DIR, cacheKey, 'thumb.jpg');

  // Check cache hit
  if (await fs.pathExists(cacheFilePath)) {
    const stats = await fs.stat(cacheFilePath);
    const meta = await fs.readJson(cacheMetaPath).catch(() => ({}));

    // Generate thumbnail if missing (e.g. cached before thumbnail feature existed)
    if (!await fs.pathExists(thumbnailPath)) {
      try {
        await sharp(cacheFilePath)
          .resize(THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
          .jpeg({ quality: THUMBNAIL_QUALITY, progressive: true })
          .toFile(thumbnailPath);
      } catch (thumbErr) {
        console.warn(`Failed to generate thumbnail for ${inputPath}:`, thumbErr.message);
      }
    }

    return {
      success: true,
      cachePath: cacheFilePath,
      thumbnailPath: (await fs.pathExists(thumbnailPath)) ? thumbnailPath : null,
      compressedSize: stats.size,
      quality: meta.quality || 0,
      error: null
    };
  }

  await fs.ensureDir(path.dirname(cacheFilePath));

  try {
    const originalSize = (await fs.stat(inputPath)).size;
    const maxSizeBytes = config.maxFileSizeKB * 1024;
    const metadata = await getMetadata(inputPath);
    const actualFormat = (metadata.format || format).toLowerCase();

    let quality;
    let compressedSize;

    if (config.strategy === 'quality_first') {
      quality = getInitialQuality(actualFormat);
      compressedSize = await tryCompress(inputPath, cacheFilePath, actualFormat, quality);
      if (compressedSize > maxSizeBytes) {
        // In quality_first, we don't reduce below minQuality
        quality = config.minQuality;
        compressedSize = await tryCompress(inputPath, cacheFilePath, actualFormat, quality);
      }
    } else if (config.strategy === 'size_first') {
      const result = await compressToSize(inputPath, cacheFilePath, actualFormat, maxSizeBytes, config.minQuality);
      quality = result.quality;
      compressedSize = result.size;
    } else if (config.strategy === 'balanced') {
      const initialQuality = getInitialQuality(actualFormat);
      const result = await compressToSize(inputPath, cacheFilePath, actualFormat, maxSizeBytes, Math.max(config.minQuality, initialQuality - 20));
      quality = result.quality;
      compressedSize = result.size;
    } else {
      throw new Error(`Unknown strategy: ${config.strategy}`);
    }

    // Generate thumbnail for the list view
    try {
      await sharp(cacheFilePath)
        .resize(THUMBNAIL_WIDTH, null, { withoutEnlargement: true })
        .jpeg({ quality: THUMBNAIL_QUALITY, progressive: true })
        .toFile(thumbnailPath);
    } catch (thumbErr) {
      console.warn(`Failed to generate thumbnail for ${inputPath}:`, thumbErr.message);
    }

    // Save metadata
    await fs.writeJson(cacheMetaPath, {
      originalPath: inputPath,
      originalSize,
      compressedSize,
      quality,
      format: actualFormat,
      createdAt: new Date().toISOString()
    });

    return {
      success: true,
      cachePath: cacheFilePath,
      thumbnailPath: (await fs.pathExists(thumbnailPath)) ? thumbnailPath : null,
      compressedSize,
      quality,
      error: null
    };
  } catch (err) {
    console.error(`Compression failed for ${inputPath}:`, err);
    return {
      success: false,
      cachePath: null,
      compressedSize: 0,
      quality: 0,
      error: err.message
    };
  }
}

/**
 * Get initial quality for a format from config.
 * @param {string} format
 * @returns {number}
 */
function getInitialQuality(format) {
  const settings = config.outputFormats[format] || config.outputFormats[format === 'jpeg' ? 'jpg' : 'jpeg'];
  return settings?.quality ?? 85;
}

/**
 * Try compressing with a specific quality and return file size.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {string} format
 * @param {number} quality
 * @returns {Promise<number>}
 */
async function tryCompress(inputPath, outputPath, format, quality) {
  const settings = config.outputFormats[format] || config.outputFormats[format === 'jpeg' ? 'jpg' : 'jpeg'] || {};
  let pipeline = sharp(inputPath);

  switch (format) {
    case 'jpeg':
    case 'jpg':
      pipeline = pipeline.jpeg({
        quality,
        progressive: settings.progressive ?? true,
        mozjpeg: settings.mozjpeg ?? true
      });
      break;
    case 'png':
      pipeline = pipeline.png({
        quality,
        compressionLevel: settings.compressionLevel ?? 9,
        palette: quality < 90 || (settings.palette ?? true),
        effort: 10
      });
      break;
    case 'webp':
      pipeline = pipeline.webp({
        quality,
        effort: 6
      });
      break;
    case 'avif':
      pipeline = pipeline.avif({
        quality,
        effort: 4
      });
      break;
    default:
      // Fallback to jpeg
      pipeline = pipeline.jpeg({ quality, progressive: true });
  }

  await pipeline.toFile(outputPath);
  return (await fs.stat(outputPath)).size;
}

/**
 * Iteratively reduce quality until file size is below threshold or minQuality reached.
 * @param {string} inputPath
 * @param {string} outputPath
 * @param {string} format
 * @param {number} maxSizeBytes
 * @param {number} minQuality
 * @returns {Promise<{quality: number, size: number}>}
 */
async function compressToSize(inputPath, outputPath, format, maxSizeBytes, minQuality) {
  let quality = getInitialQuality(format);

  while (quality >= minQuality) {
    const size = await tryCompress(inputPath, outputPath, format, quality);
    if (size <= maxSizeBytes) {
      return { quality, size };
    }
    quality -= QUALITY_STEP;
  }

  // Final attempt at minQuality
  const size = await tryCompress(inputPath, outputPath, format, minQuality);
  return { quality: minQuality, size };
}

module.exports = {
  compressImage,
  getCachePath,
  ensureCacheDir,
  CACHE_DIR
};
