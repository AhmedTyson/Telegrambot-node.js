import { fileTypeFromFile, fileTypeFromBuffer } from 'file-type';
import mime from 'mime';
import fs from 'fs-extra';
import path from 'path';
import config from '../config/index.js';
import logger from '../logger/index.js';

/**
 * File Handler Utility
 * Provides file type detection, validation, and utility functions
 */

/**
 * Get detailed file type information
 * @param {string} filePath - Path to the file
 * @returns {Promise<Object>} File type information
 */
export async function getFileType(filePath) {
  try {
    // First, try to detect using file-type library (magic numbers)
    const detectedType = await fileTypeFromFile(filePath);
    
    if (detectedType) {
      logger.debug('File type detected via magic numbers', {
        fileName: path.basename(filePath),
        ext: detectedType.ext,
        mime: detectedType.mime
      });
      
      return {
        ext: detectedType.ext,
        mime: detectedType.mime,
        method: 'magic-numbers',
        confidence: 'high'
      };
    }

    // If magic number detection fails, try MIME type from extension
    const extension = path.extname(filePath).toLowerCase();
    if (extension) {
      const mimeType = mime.getType(extension);
      if (mimeType) {
        logger.debug('File type detected via extension', {
          fileName: path.basename(filePath),
          ext: extension.substring(1),
          mime: mimeType
        });
        
        return {
          ext: extension.substring(1),
          mime: mimeType,
          method: 'extension',
          confidence: 'medium'
        };
      }
    }

    // If both methods fail, try reading first few bytes
    const buffer = await fs.readFile(filePath, { start: 0, end: 4100 });
    const bufferType = await fileTypeFromBuffer(buffer);
    
    if (bufferType) {
      logger.debug('File type detected via buffer', {
        fileName: path.basename(filePath),
        ext: bufferType.ext,
        mime: bufferType.mime
      });
      
      return {
        ext: bufferType.ext,
        mime: bufferType.mime,
        method: 'buffer-analysis',
        confidence: 'high'
      };
    }

    // Last resort: return generic binary type
    logger.warn('Could not determine file type, using default', {
      fileName: path.basename(filePath)
    });
    
    return {
      ext: 'bin',
      mime: 'application/octet-stream',
      method: 'default',
      confidence: 'low'
    };

  } catch (error) {
    logger.error('Error detecting file type', {
      filePath: path.basename(filePath),
      error: error.message
    });
    
    return {
      ext: 'bin',
      mime: 'application/octet-stream',
      method: 'error-fallback',
      confidence: 'low',
      error: error.message
    };
  }
}

/**
 * Determine the most appropriate Telegram send method based on file type
 * @param {Object} fileType - File type information from getFileType()
 * @param {string} fileName - Original file name
 * @returns {Object} Send method recommendation
 */
export function determineSendMethod(fileType, fileName = '') {
  const mimeType = fileType?.mime || 'application/octet-stream';
  
  // Video files
  if (config.SUPPORTED_VIDEO_TYPES.includes(mimeType)) {
    return {
      method: 'sendVideo',
      reason: 'Video file detected',
      options: {
        supports_streaming: true,
        parse_mode: 'Markdown'
      }
    };
  }
  
  // Image files
  if (config.SUPPORTED_IMAGE_TYPES.includes(mimeType)) {
    return {
      method: 'sendPhoto',
      reason: 'Image file detected',
      options: {
        parse_mode: 'Markdown'
      }
    };
  }
  
  // Audio files
  if (mimeType.startsWith('audio/')) {
    return {
      method: 'sendAudio',
      reason: 'Audio file detected',
      options: {
        parse_mode: 'Markdown'
      }
    };
  }
  
  // Animation/GIF files
  if (mimeType === 'image/gif' || fileName.toLowerCase().endsWith('.gif')) {
    return {
      method: 'sendAnimation',
      reason: 'Animation/GIF file detected',
      options: {
        parse_mode: 'Markdown'
      }
    };
  }
  
  // Default to document for everything else (PDFs, office docs, etc.)
  return {
    method: 'sendDocument',
    reason: 'Document or unknown file type',
    options: {
      parse_mode: 'Markdown'
    }
  };
}

/**
 * Validate file size against Telegram limits
 * @param {number} fileSizeBytes - File size in bytes
 * @param {number} maxSizeMB - Maximum allowed size in MB
 * @returns {boolean} True if file size is valid
 */
export function validateFileSize(fileSizeBytes, maxSizeMB = config.MAX_FILE_SIZE_MB) {
  const maxBytes = maxSizeMB * 1024 * 1024;
  return fileSizeBytes <= maxBytes;
}

/**
 * Get human-readable file size
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get file statistics
 * @param {string} filePath - Path to the file
 * @returns {Promise<Object>} File statistics
 */
export async function getFileStats(filePath) {
  try {
    const stats = await fs.stat(filePath);
    const fileType = await getFileType(filePath);
    
    return {
      fileName: path.basename(filePath),
      filePath: filePath,
      fileSize: stats.size,
      fileSizeFormatted: formatFileSize(stats.size),
      created: stats.birthtime,
      modified: stats.mtime,
      fileType: fileType,
      isValidSize: validateFileSize(stats.size),
      sendMethod: determineSendMethod(fileType, path.basename(filePath))
    };
  } catch (error) {
    logger.error('Error getting file stats', {
      filePath: path.basename(filePath),
      error: error.message
    });
    throw error;
  }
}

/**
 * Validate file extension against a list of allowed extensions
 * @param {string} fileName - File name
 * @param {Array<string>} allowedExtensions - Array of allowed extensions (without dots)
 * @returns {boolean} True if extension is allowed
 */
export function validateFileExtension(fileName, allowedExtensions = []) {
  if (!allowedExtensions || allowedExtensions.length === 0) {
    return true; // No restrictions
  }
  
  const extension = path.extname(fileName).toLowerCase().substring(1);
  return allowedExtensions.map(ext => ext.toLowerCase()).includes(extension);
}

/**
 * Check if file is a potentially dangerous type
 * @param {string} fileName - File name
 * @param {Object} fileType - File type information
 * @returns {Object} Security check result
 */
export function performSecurityCheck(fileName, fileType) {
  const dangerousExtensions = [
    'exe', 'bat', 'cmd', 'com', 'pif', 'scr', 'vbs', 'js', 'jar',
    'msi', 'dll', 'scf', 'lnk', 'inf', 'reg'
  ];
  
  const suspiciousMimeTypes = [
    'application/x-msdownload',
    'application/x-executable',
    'application/x-msdos-program',
    'application/javascript'
  ];
  
  const extension = path.extname(fileName).toLowerCase().substring(1);
  const mimeType = fileType?.mime || '';
  
  const isDangerousExtension = dangerousExtensions.includes(extension);
  const isSuspiciousMime = suspiciousMimeTypes.includes(mimeType);
  
  const result = {
    isSafe: !isDangerousExtension && !isSuspiciousMime,
    warnings: []
  };
  
  if (isDangerousExtension) {
    result.warnings.push(`Potentially dangerous file extension: .${extension}`);
  }
  
  if (isSuspiciousMime) {
    result.warnings.push(`Suspicious MIME type: ${mimeType}`);
  }
  
  // Check for extension spoofing
  if (fileType?.ext && extension !== fileType.ext) {
    result.warnings.push(`Extension mismatch: filename has .${extension} but content suggests .${fileType.ext}`);
  }
  
  return result;
}

/**
 * Generate a safe filename by removing/replacing problematic characters
 * @param {string} fileName - Original filename
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized filename
 */
export function sanitizeFileName(fileName, options = {}) {
  const {
    replacement = '_',
    maxLength = 255,
    preserveExtension = true
  } = options;
  
  if (!fileName) {
    return 'untitled';
  }
  
  let sanitized = fileName;
  
  // Remove or replace dangerous characters
  const dangerousChars = /[<>:"/\\|?*\x00-\x1f]/g;
  sanitized = sanitized.replace(dangerousChars, replacement);
  
  // Remove leading/trailing spaces and dots
  sanitized = sanitized.trim().replace(/^\.+|\.+$/g, '');
  
  // Handle reserved Windows names
  const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedNames.test(sanitized)) {
    sanitized = `${sanitized}_file`;
  }
  
  // Truncate if too long
  if (sanitized.length > maxLength) {
    if (preserveExtension) {
      const ext = path.extname(sanitized);
      const name = path.basename(sanitized, ext);
      const maxNameLength = maxLength - ext.length;
      sanitized = name.substring(0, maxNameLength) + ext;
    } else {
      sanitized = sanitized.substring(0, maxLength);
    }
  }
  
  // Ensure we have a filename
  if (!sanitized) {
    sanitized = 'untitled';
  }
  
  return sanitized;
}

/**
 * Create a comprehensive file analysis report
 * @param {string} filePath - Path to the file
 * @returns {Promise<Object>} Comprehensive file analysis
 */
export async function analyzeFile(filePath) {
  try {
    const stats = await getFileStats(filePath);
    const securityCheck = performSecurityCheck(stats.fileName, stats.fileType);
    
    return {
      ...stats,
      security: securityCheck,
      recommendations: {
        shouldSend: securityCheck.isSafe && stats.isValidSize,
        sendMethod: stats.sendMethod,
        warnings: securityCheck.warnings,
        fileTypeConfidence: stats.fileType.confidence
      }
    };
  } catch (error) {
    logger.error('Error analyzing file', {
      filePath: path.basename(filePath),
      error: error.message
    });
    throw error;
  }
}

/**
 * Check if file exists and is readable
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} True if file exists and is readable
 */
export async function isFileAccessible(filePath) {
  try {
    await fs.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get MIME type mapping for common file extensions
 * @returns {Object} Extension to MIME type mapping
 */
export function getCommonMimeTypes() {
  return {
    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    
    // Videos
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'mkv': 'video/x-matroska',
    'webm': 'video/webm',
    
    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'm4a': 'audio/mp4'
  };
}