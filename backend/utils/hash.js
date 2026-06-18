const crypto = require('crypto');
const fs = require('fs');

/**
 * Generate a short SHA-256 hash for a file.
 * @param {string} filePath
 * @returns {string}
 */
function getFileHash(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
}

/**
 * Generate a hash for a string (used for cache keys combining path + config).
 * @param {string} str
 * @returns {string}
 */
function getStringHash(str) {
  return crypto.createHash('sha256').update(str).digest('hex').slice(0, 16);
}

module.exports = { getFileHash, getStringHash };
