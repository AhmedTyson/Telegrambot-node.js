import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import { URL } from 'url';
import config from '../config/index.js';
import logger from '../logger/index.js';
import { generateDownloadUrl, generateConfirmationUrl, extractConfirmationToken } from './urlParser.js';

/**
 * Google Drive File Downloader Utility
 * Handles downloading files from Google Drive with proper error handling and retry logic
 */

/**
 * Download a file from Google Drive
 * @param {string} fileId - Google Drive file ID
 * @param {Object} options - Download options
 * @returns {Promise<Object>} Download result with file path and metadata
 */
export async function downloadGoogleDriveFile(fileId, options = {}) {
  const startTime = Date.now();
  
  try {
    logger.debug('Starting Google Drive file download', { fileId: fileId.substring(0, 10) + '...' });

    // Validate file ID
    if (!fileId || typeof fileId !== 'string') {
      throw new Error('Invalid file ID provided');
    }

    // Generate initial download URL
    const downloadUrl = generateDownloadUrl(fileId);
    
    // Attempt initial download
    const result = await attemptDownload(downloadUrl, fileId, options);
    
    // Log performance metrics
    const duration = Date.now() - startTime;
    logger.logPerformance('Google Drive download', duration, {
      fileId: fileId.substring(0, 10) + '...',
      fileSize: result.fileSize,
      fileName: result.fileName
    });

    return result;

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Google Drive download failed', {
      fileId: fileId.substring(0, 10) + '...',
      error: error.message,
      duration
    });
    
    return {
      success: false,
      error: error.message,
      duration
    };
  }
}

/**
 * Attempt to download a file from the given URL
 * @param {string} url - Download URL
 * @param {string} fileId - File ID for fallback operations
 * @param {Object} options - Download options
 * @returns {Promise<Object>} Download result
 */
async function attemptDownload(url, fileId, options = {}) {
  const maxRetries = options.maxRetries || 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Download attempt ${attempt}/${maxRetries}`, { url: url.substring(0, 50) + '...' });
      
      // Create axios request with proper configuration
      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: config.DOWNLOAD_TIMEOUT_MS,
        maxRedirects: 5,
        headers: {
          ...config.REQUEST_HEADERS,
          'Referer': 'https://drive.google.com/'
        }
      });

      // Check if we hit the virus scan warning page
      if (response.headers['content-type']?.includes('text/html')) {
        logger.debug('Detected virus scan page, attempting to extract confirmation token');
        return await handleVirusScanPage(response, fileId, options);
      }

      // Validate file size before downloading
      const contentLength = parseInt(response.headers['content-length'] || '0');
      if (contentLength > config.MAX_FILE_SIZE_BYTES) {
        throw new Error(`File size (${Math.round(contentLength / 1024 / 1024)}MB) exceeds the limit of ${config.MAX_FILE_SIZE_MB}MB`);
      }

      // Extract filename from response headers
      const fileName = extractFileName(response.headers) || `file_${fileId}.bin`;
      
      // Generate unique file path
      const filePath = await generateUniqueFilePath(fileName);
      
      // Download the file
      const fileSize = await streamToFile(response.data, filePath);
      
      logger.info('File downloaded successfully', {
        fileName,
        fileSize,
        filePath: path.basename(filePath)
      });

      return {
        success: true,
        filePath,
        fileName,
        fileSize,
        contentType: response.headers['content-type'] || 'application/octet-stream'
      };

    } catch (error) {
      lastError = error;
      logger.warn(`Download attempt ${attempt} failed`, {
        error: error.message,
        attempt,
        maxRetries
      });

      // If it's not the last attempt, wait before retrying
      if (attempt < maxRetries) {
        const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError || new Error('Download failed after all retry attempts');
}

/**
 * Handle Google Drive virus scan warning page
 * @param {Object} response - Axios response containing HTML
 * @param {string} fileId - File ID
 * @param {Object} options - Download options
 * @returns {Promise<Object>} Download result after confirmation
 */
async function handleVirusScanPage(response, fileId, options) {
  try {
    // Convert stream to string to parse HTML
    const htmlContent = await streamToString(response.data);
    
    // Extract confirmation token
    const confirmToken = extractConfirmationToken(htmlContent);
    
    if (!confirmToken) {
      throw new Error('Could not extract confirmation token from virus scan page');
    }

    logger.debug('Extracted confirmation token, retrying download');
    
    // Generate confirmation URL and retry download
    const confirmUrl = generateConfirmationUrl(fileId, confirmToken);
    return await attemptDownload(confirmUrl, fileId, { ...options, maxRetries: 1 });

  } catch (error) {
    throw new Error(`Failed to handle virus scan page: ${error.message}`);
  }
}

/**
 * Extract filename from response headers
 * @param {Object} headers - HTTP response headers
 * @returns {string|null} Extracted filename or null
 */
function extractFileName(headers) {
  const contentDisposition = headers['content-disposition'];
  
  if (!contentDisposition) {
    return null;
  }

  // Try to extract filename from content-disposition header
  const filenamePatterns = [
    /filename\*=UTF-8''([^;]+)/i,
    /filename="([^"]+)"/i,
    /filename=([^;]+)/i
  ];

  for (const pattern of filenamePatterns) {
    const match = contentDisposition.match(pattern);
    if (match && match[1]) {
      // Decode URI component if needed
      try {
        return decodeURIComponent(match[1].replace(/['"]/g, ''));
      } catch (e) {
        return match[1].replace(/['"]/g, '');
      }
    }
  }

  return null;
}

/**
 * Generate a unique file path to avoid conflicts
 * @param {string} fileName - Original filename
 * @returns {Promise<string>} Unique file path
 */
async function generateUniqueFilePath(fileName) {
  // Ensure temp directory exists
  await fs.ensureDir(config.TEMP_DIR);
  
  // Clean filename (remove dangerous characters)
  const cleanFileName = fileName.replace(/[<>:"/\\|?*]/g, '_');
  
  let filePath = path.join(config.TEMP_DIR, cleanFileName);
  let counter = 1;

  // If file exists, append counter until we find a unique name
  while (await fs.pathExists(filePath)) {
    const ext = path.extname(cleanFileName);
    const name = path.basename(cleanFileName, ext);
    const newFileName = `${name}_${counter}${ext}`;
    filePath = path.join(config.TEMP_DIR, newFileName);
    counter++;
  }

  return filePath;
}

/**
 * Stream response data to a file
 * @param {Stream} stream - Response data stream
 * @param {string} filePath - Destination file path
 * @returns {Promise<number>} File size in bytes
 */
function streamToFile(stream, filePath) {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    let fileSize = 0;

    stream.on('data', (chunk) => {
      fileSize += chunk.length;
      
      // Check file size limit during download
      if (fileSize > config.MAX_FILE_SIZE_BYTES) {
        writeStream.destroy();
        fs.unlink(filePath).catch(() => {}); // Clean up partial file
        reject(new Error(`File size exceeds the limit of ${config.MAX_FILE_SIZE_MB}MB`));
        return;
      }
    });

    stream.on('end', () => {
      writeStream.end();
      resolve(fileSize);
    });

    stream.on('error', (error) => {
      writeStream.destroy();
      fs.unlink(filePath).catch(() => {}); // Clean up partial file
      reject(error);
    });

    writeStream.on('error', (error) => {
      fs.unlink(filePath).catch(() => {}); // Clean up partial file
      reject(error);
    });

    stream.pipe(writeStream);
  });
}

/**
 * Convert a stream to string
 * @param {Stream} stream - Input stream
 * @returns {Promise<string>} Stream content as string
 */
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    
    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });
    
    stream.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    
    stream.on('error', reject);
  });
}

/**
 * Get file information without downloading
 * @param {string} fileId - Google Drive file ID
 * @returns {Promise<Object>} File information
 */
export async function getFileInfo(fileId) {
  try {
    const url = generateDownloadUrl(fileId);
    
    const response = await axios({
      method: 'HEAD',
      url: url,
      timeout: 10000,
      maxRedirects: 5,
      headers: config.REQUEST_HEADERS
    });

    const contentLength = parseInt(response.headers['content-length'] || '0');
    const fileName = extractFileName(response.headers) || `file_${fileId}`;
    const contentType = response.headers['content-type'] || 'application/octet-stream';

    return {
      success: true,
      fileName,
      fileSize: contentLength,
      contentType,
      isOverSizeLimit: contentLength > config.MAX_FILE_SIZE_BYTES
    };

  } catch (error) {
    logger.debug('Failed to get file info', { fileId, error: error.message });
    
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clean up temporary files older than specified age
 * @param {number} maxAgeHours - Maximum age in hours (default: 1 hour)
 */
export async function cleanupTempFiles(maxAgeHours = 1) {
  try {
    const tempDir = config.TEMP_DIR;
    
    if (!(await fs.pathExists(tempDir))) {
      return;
    }

    const files = await fs.readdir(tempDir);
    const maxAge = maxAgeHours * 60 * 60 * 1000; // Convert to milliseconds
    const now = Date.now();
    let cleanedCount = 0;

    for (const file of files) {
      const filePath = path.join(tempDir, file);
      const stats = await fs.stat(filePath);
      
      if (now - stats.mtime.getTime() > maxAge) {
        await fs.remove(filePath);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} temporary files`, {
        tempDir,
        maxAgeHours,
        cleanedCount
      });
    }

  } catch (error) {
    logger.error('Error during temp file cleanup', {
      error: error.message,
      tempDir: config.TEMP_DIR
    });
  }
}

// Schedule periodic cleanup of temp files
setInterval(() => {
  cleanupTempFiles(1); // Clean files older than 1 hour
}, 30 * 60 * 1000); // Run every 30 minutes