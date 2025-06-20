/**
 * Example usage and testing file for the Telegram Google Drive Bot
 * This file demonstrates how to use the various utility functions
 */

import { parseGoogleDriveUrl, isValidGoogleDriveUrl, analyzeGoogleDriveUrl } from './src/utils/urlParser.js';
import { downloadGoogleDriveFile, getFileInfo } from './src/utils/googleDrive.js';
import { getFileType, analyzeFile, formatFileSize } from './src/utils/fileHandler.js';
import logger from './src/logger/index.js';

// Example Google Drive URLs for testing
const testUrls = [
  'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view?usp=sharing',
  'https://drive.google.com/open?id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  'https://docs.google.com/document/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
  'https://drive.google.com/uc?export=download&id=1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'
];

/**
 * Example 1: URL Parsing and Validation
 */
async function exampleUrlParsing() {
  console.log('\\n=== URL Parsing Examples ===');
  
  for (const url of testUrls) {
    console.log(`\\nTesting URL: ${url}`);
    
    // Check if URL is valid
    const isValid = isValidGoogleDriveUrl(url);
    console.log(`Valid: ${isValid}`);
    
    if (isValid) {
      // Extract file ID
      const fileId = parseGoogleDriveUrl(url);
      console.log(`File ID: ${fileId}`);
      
      // Get detailed analysis
      const analysis = analyzeGoogleDriveUrl(url);
      console.log(`Format: ${analysis.format}`);
      console.log(`Download URL: ${analysis.downloadUrl}`);
    }
  }
}

/**
 * Example 2: File Information Retrieval
 */
async function exampleFileInfo() {
  console.log('\\n=== File Information Examples ===');
  
  const fileId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'; // Example public file
  
  try {
    const fileInfo = await getFileInfo(fileId);
    
    if (fileInfo.success) {
      console.log(`File Name: ${fileInfo.fileName}`);
      console.log(`File Size: ${formatFileSize(fileInfo.fileSize)}`);
      console.log(`Content Type: ${fileInfo.contentType}`);
      console.log(`Over Size Limit: ${fileInfo.isOverSizeLimit}`);
    } else {
      console.log(`Failed to get file info: ${fileInfo.error}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 3: File Download and Analysis
 */
async function exampleFileDownload() {
  console.log('\\n=== File Download Examples ===');
  
  const fileId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'; // Example public file
  
  try {
    console.log('Starting download...');
    const downloadResult = await downloadGoogleDriveFile(fileId);
    
    if (downloadResult.success) {
      console.log(`Downloaded: ${downloadResult.fileName}`);
      console.log(`Size: ${formatFileSize(downloadResult.fileSize)}`);
      console.log(`Path: ${downloadResult.filePath}`);
      
      // Analyze the downloaded file
      const analysis = await analyzeFile(downloadResult.filePath);
      console.log(`\\nFile Analysis:`);
      console.log(`MIME Type: ${analysis.fileType.mime}`);
      console.log(`Extension: ${analysis.fileType.ext}`);
      console.log(`Send Method: ${analysis.sendMethod.method}`);
      console.log(`Security Safe: ${analysis.security.isSafe}`);
      
      if (analysis.security.warnings.length > 0) {
        console.log('Security Warnings:');
        analysis.security.warnings.forEach(warning => {
          console.log(`- ${warning}`);
        });
      }
    } else {
      console.log(`Download failed: ${downloadResult.error}`);
    }
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * Example 4: Error Handling Demonstration
 */
async function exampleErrorHandling() {
  console.log('\\n=== Error Handling Examples ===');
  
  // Test with invalid file ID
  const invalidFileId = 'invalid_file_id_123';
  
  try {
    console.log('Testing with invalid file ID...');
    const result = await downloadGoogleDriveFile(invalidFileId);
    console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
    if (!result.success) {
      console.log(`Error: ${result.error}`);
    }
  } catch (error) {
    console.error('Caught error:', error.message);
  }
  
  // Test with invalid URL
  const invalidUrl = 'https://example.com/not-a-drive-link';
  console.log(`\\nTesting invalid URL: ${invalidUrl}`);
  console.log(`Valid: ${isValidGoogleDriveUrl(invalidUrl)}`);
}

/**
 * Example 5: Telegram Bot Context Simulation
 */
async function exampleBotWorkflow() {
  console.log('\\n=== Bot Workflow Simulation ===');
  
  const userMessage = 'https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view?usp=sharing';
  
  console.log(`User sent: ${userMessage}`);
  
  // Step 1: Validate URL
  if (!isValidGoogleDriveUrl(userMessage)) {
    console.log('❌ Invalid Google Drive URL');
    return;
  }
  
  // Step 2: Extract file ID
  const fileId = parseGoogleDriveUrl(userMessage);
  console.log(`✅ Extracted file ID: ${fileId}`);
  
  // Step 3: Get file info first (optional)
  try {
    const fileInfo = await getFileInfo(fileId);
    if (fileInfo.success) {
      console.log(`📄 File: ${fileInfo.fileName} (${formatFileSize(fileInfo.fileSize)})`);
      
      if (fileInfo.isOverSizeLimit) {
        console.log('❌ File too large for Telegram');
        return;
      }
    }
    
    // Step 4: Download file
    console.log('⬇️ Downloading file...');
    const downloadResult = await downloadGoogleDriveFile(fileId);
    
    if (downloadResult.success) {
      // Step 5: Analyze file
      const analysis = await analyzeFile(downloadResult.filePath);
      
      console.log(`✅ File ready for sending`);
      console.log(`📤 Send method: ${analysis.sendMethod.method}`);
      console.log(`🔒 Security check: ${analysis.security.isSafe ? 'Safe' : 'Warning'}`);
      
      // Simulate sending to Telegram
      console.log(`🤖 Sending file to Telegram using ${analysis.sendMethod.method}...`);
      console.log('✅ File sent successfully!');
      
      // Cleanup would happen here
      console.log('🧹 Cleaning up temporary file...');
    } else {
      console.log(`❌ Download failed: ${downloadResult.error}`);
    }
    
  } catch (error) {
    console.error('❌ Workflow error:', error.message);
  }
}

/**
 * Example 6: Logging Examples
 */
function exampleLogging() {
  console.log('\\n=== Logging Examples ===');
  
  // Different log levels
  logger.debug('This is a debug message', { component: 'example', data: { key: 'value' } });
  logger.info('File processing started', { fileId: 'abc123', chatId: '123456789' });
  logger.warn('File size is large', { fileSize: 45000000, limit: 52428800 });
  logger.error('Download failed', { error: 'Network timeout', retryCount: 3 });
  
  // Specialized logging methods
  logger.logUserAction('file_download_request', '123456789', { fileName: 'document.pdf' });
  logger.logFileOperation('download', 'document.pdf', 1024000);
  logger.logPerformance('file_download', 2500, { fileSize: 1024000 });
  logger.logSecurity('suspicious_file_type', 'User attempted to download .exe file');
}

/**
 * Main execution function
 */
async function runExamples() {
  console.log('🤖 Telegram Google Drive Bot - Example Usage\\n');
  
  try {
    await exampleUrlParsing();
    await exampleFileInfo();
    await exampleFileDownload();
    await exampleErrorHandling();
    await exampleBotWorkflow();
    exampleLogging();
    
    console.log('\\n✅ All examples completed!');
  } catch (error) {
    console.error('❌ Example execution failed:', error.message);
  }
}

// Export for use in other files
export {
  exampleUrlParsing,
  exampleFileInfo,
  exampleFileDownload,
  exampleErrorHandling,
  exampleBotWorkflow,
  exampleLogging
};

// Run examples if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
}