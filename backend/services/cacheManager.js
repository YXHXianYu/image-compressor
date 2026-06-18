const { getFileHash } = require('../utils/hash');

/**
 * In-memory store for scanned images and their compression status.
 */
class CacheManager {
  constructor() {
    this.images = new Map();
  }

  /**
   * Store scanned images and assign stable IDs.
   * @param {Array<Object>} images
   */
  setImages(images) {
    this.images.clear();
    for (const image of images) {
      const id = getFileHash(image.path);
      image.id = id;
      this.images.set(id, image);
    }
  }

  /**
   * Get all images as an array.
   * @returns {Array<Object>}
   */
  getAllImages() {
    return Array.from(this.images.values());
  }

  /**
   * Get a single image by ID.
   * @param {string} id
   * @returns {Object|undefined}
   */
  getImage(id) {
    return this.images.get(id);
  }

  /**
   * Update compression result for an image.
   * @param {string} id
   * @param {Object} result
   */
  updateCompressionResult(id, result) {
    const image = this.images.get(id);
    if (!image) return;

    image.compressed = result.success;
    image.compressedSize = result.compressedSize;
    image.cachePath = result.cachePath;
    image.thumbnailPath = result.thumbnailPath;
    image.quality = result.quality;
    image.error = result.error;

    if (image.originalSize > 0 && image.compressedSize > 0) {
      image.savingRatio = (image.originalSize - image.compressedSize) / image.originalSize;
    } else {
      image.savingRatio = 0;
    }
  }

  /**
   * Clear all stored images.
   */
  clear() {
    this.images.clear();
  }
}

module.exports = new CacheManager();
