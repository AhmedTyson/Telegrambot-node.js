/**
 * Google Drive URL Parser Utility
 * Handles various Google Drive link formats and extracts file IDs
 */

/**
 * Regular expressions for different Google Drive URL formats
 */
const GOOGLE_DRIVE_PATTERNS = {
  // https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  standardView: /(?:https?:\/\/)?(?:www\.)?drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)(?:\/view)?/,
  
  // https://drive.google.com/open?id=FILE_ID
  openFormat: /(?:https?:\/\/)?(?:www\.)?drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
  
  // https://docs.google.com/document/d/FILE_ID/edit
  docsFormat: /(?:https?:\/\/)?(?:www\.)?docs\.google\.com\/(?:document|spreadsheets|presentation)\/d\/([a-zA-Z0-9_-]+)/,
  
  // https://drive.google.com/uc?id=FILE_ID&export=download
  directDownload: /(?:https?:\/\/)?(?:www\.)?drive\.google\.com\/uc\?.*[&?]id=([a-zA-Z0-9_-]+)/,
  
  // https://drive.google.com/file/d/FILE_ID/edit
  editFormat: /(?:https?:\/\/)?(?:www\.)?drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)\/edit/
};

/**
 * Check if a given URL is a valid Google Drive URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if the URL matches any Google Drive pattern
 */
export function isValidGoogleDriveUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Check if URL contains any Google Drive patterns
  return Object.values(GOOGLE_DRIVE_PATTERNS).some(pattern => pattern.test(url));
}

/**
 * Extract file ID from a Google Drive URL
 * @param {string} url - Google Drive URL
 * @returns {string|null} Extracted file ID or null if not found
 */
export function parseGoogleDriveUrl(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  // Try each pattern until we find a match
  for (const [formatName, pattern] of Object.entries(GOOGLE_DRIVE_PATTERNS)) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Extract multiple file IDs from text containing multiple Google Drive URLs
 * @param {string} text - Text that may contain multiple URLs
 * @returns {Array<{url: string, fileId: string, format: string}>} Array of extracted file information
 */
export function extractMultipleGoogleDriveUrls(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const results = [];
  const processedFileIds = new Set();

  // Check each pattern against the entire text
  for (const [formatName, pattern] of Object.entries(GOOGLE_DRIVE_PATTERNS)) {
    const globalPattern = new RegExp(pattern.source, 'gi');
    let match;

    while ((match = globalPattern.exec(text)) !== null) {
      const fileId = match[1];
      
      // Avoid duplicates
      if (!processedFileIds.has(fileId)) {
        processedFileIds.add(fileId);
        results.push({
          url: match[0],
          fileId: fileId,
          format: formatName
        });
      }
    }
  }

  return results;
}

/**
 * Validate file ID format
 * @param {string} fileId - File ID to validate
 * @returns {boolean} True if file ID format is valid
 */
export function isValidFileId(fileId) {
  if (!fileId || typeof fileId !== 'string') {
    return false;
  }

  // Google Drive file IDs are typically 28-44 characters long
  // and contain alphanumeric characters, hyphens, and underscores
  const fileIdPattern = /^[a-zA-Z0-9_-]{25,50}$/;
  return fileIdPattern.test(fileId);
}

/**
 * Generate a direct download URL from a file ID
 * @param {string} fileId - Google Drive file ID
 * @returns {string} Direct download URL
 */
export function generateDownloadUrl(fileId) {
  if (!isValidFileId(fileId)) {
    throw new Error('Invalid file ID provided');
  }

  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

/**
 * Generate a confirmation download URL (for large files that require virus scan confirmation)
 * @param {string} fileId - Google Drive file ID
 * @param {string} confirmToken - Confirmation token from the virus scan page
 * @returns {string} Confirmation download URL
 */
export function generateConfirmationUrl(fileId, confirmToken) {
  if (!isValidFileId(fileId)) {
    throw new Error('Invalid file ID provided');
  }

  return `https://drive.google.com/uc?export=download&confirm=${confirmToken}&id=${fileId}`;
}

/**
 * Parse the format type from a Google Drive URL
 * @param {string} url - Google Drive URL
 * @returns {string|null} Format type name or null if not recognized
 */
export function getUrlFormat(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }

  for (const [formatName, pattern] of Object.entries(GOOGLE_DRIVE_PATTERNS)) {
    if (pattern.test(url)) {
      return formatName;
    }
  }

  return null;
}

/**
 * Convert any Google Drive URL to a standardized sharing URL format
 * @param {string} url - Original Google Drive URL
 * @returns {string|null} Standardized sharing URL or null if invalid
 */
export function normalizeGoogleDriveUrl(url) {
  const fileId = parseGoogleDriveUrl(url);
  if (!fileId) {
    return null;
  }

  return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
}

/**
 * Get information about a Google Drive URL
 * @param {string} url - Google Drive URL to analyze
 * @returns {Object|null} URL information object or null if invalid
 */
export function analyzeGoogleDriveUrl(url) {
  if (!isValidGoogleDriveUrl(url)) {
    return null;
  }

  const fileId = parseGoogleDriveUrl(url);
  const format = getUrlFormat(url);

  if (!fileId) {
    return null;
  }

  return {
    originalUrl: url,
    fileId: fileId,
    format: format,
    downloadUrl: generateDownloadUrl(fileId),
    sharingUrl: normalizeGoogleDriveUrl(url),
    isValidFileId: isValidFileId(fileId)
  };
}

/**
 * Extract confirmation token from Google Drive virus scan warning page
 * @param {string} htmlContent - HTML content of the virus scan page
 * @returns {string|null} Confirmation token or null if not found
 */
export function extractConfirmationToken(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return null;
  }

  // Look for confirmation token in various possible formats
  const patterns = [
    /confirm=([a-zA-Z0-9_-]+)/,
    /name="confirm"\s+value="([^"]+)"/,
    /\&confirm=([a-zA-Z0-9_-]+)/,
    /"confirm":"([^"]+)"/
  ];

  for (const pattern of patterns) {
    const match = htmlContent.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Utility function to clean and prepare URLs for processing
 * @param {string} input - Raw input that may contain URLs
 * @returns {Array<string>} Array of cleaned URLs
 */
export function extractUrlsFromText(input) {
  if (!input || typeof input !== 'string') {
    return [];
  }

  // Basic URL extraction pattern
  const urlPattern = /https?:\/\/[^\s<>"'{}|\\^`\[\]]+/gi;
  const urls = input.match(urlPattern) || [];

  // Clean and filter URLs
  return urls
    .map(url => url.trim())
    .filter(url => url.length > 0)
    .map(url => {
      // Remove trailing punctuation that might not be part of the URL
      return url.replace(/[.,;:!?)\]}]+$/, '');
    });
}

// Export all patterns for external use if needed
export { GOOGLE_DRIVE_PATTERNS };