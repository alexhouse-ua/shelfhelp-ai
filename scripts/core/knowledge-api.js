const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

const router = express.Router();

// Security: Validate filename to prevent directory traversal
const isValidFilename = (filename) => {
  return filename && filename.match(/^[a-zA-Z0-9_-]+\.(md|yaml|json)$/);
};

// Get knowledge file for AI assistant
router.get('/knowledge/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!isValidFilename(filename)) {
      logger.warn('Invalid knowledge filename requested', { 
        filename,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      return res.status(400).json({
        error: 'Invalid filename',
        message: 'Filename must be alphanumeric with .md, .yaml, or .json extension',
        pattern: '^[a-zA-Z0-9_-]+\\.(md|yaml|json)$'
      });
    }
    
    const knowledgePath = path.join(__dirname, '../_knowledge', filename);
    
    // Check if file exists and is within knowledge directory
    try {
      const resolvedPath = path.resolve(knowledgePath);
      const knowledgeDir = path.resolve(__dirname, '../_knowledge');
      
      if (!resolvedPath.startsWith(knowledgeDir)) {
        throw new Error('Path traversal attempt detected');
      }
      
      const content = await fs.readFile(resolvedPath, 'utf8');
      const stats = await fs.stat(resolvedPath);
      
      logger.info('AI assistant knowledge file accessed', { 
        filename,
        size: stats.size,
        userAgent: req.headers['user-agent']
      });
      
      res.json({
        filename,
        content,
        lastModified: stats.mtime,
        size: stats.size,
        encoding: 'utf8'
      });
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.status(404).json({
          error: 'File not found',
          message: `Knowledge file ${filename} does not exist`,
          availableFiles: 'Use GET /api/knowledge to list available files'
        });
      }
      throw error;
    }
    
  } catch (error) {
    logger.error('Knowledge file read error', { 
      filename: req.params.filename,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Read failed',
      message: 'Could not read knowledge file',
      timestamp: new Date().toISOString()
    });
  }
});

// Update knowledge file for AI assistant
router.put('/knowledge/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const { content } = req.body;
    
    if (!content || typeof content !== 'string') {
      return res.status(400).json({
        error: 'Invalid content',
        message: 'Content must be a non-empty string',
        received: typeof content
      });
    }
    
    if (!isValidFilename(filename)) {
      logger.warn('Invalid knowledge filename for update', { 
        filename,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      return res.status(400).json({
        error: 'Invalid filename',
        message: 'Filename must be alphanumeric with .md, .yaml, or .json extension',
        pattern: '^[a-zA-Z0-9_-]+\\.(md|yaml|json)$'
      });
    }
    
    const knowledgePath = path.join(__dirname, '../_knowledge', filename);
    const resolvedPath = path.resolve(knowledgePath);
    const knowledgeDir = path.resolve(__dirname, '../_knowledge');
    
    // Security: Prevent path traversal
    if (!resolvedPath.startsWith(knowledgeDir)) {
      logger.security('Path traversal attempt in knowledge update', {
        filename,
        attemptedPath: resolvedPath,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      return res.status(403).json({
        error: 'Access denied',
        message: 'Invalid file path'
      });
    }
    
    // Content validation based on file type
    const extension = path.extname(filename).toLowerCase();
    if (extension === '.json') {
      try {
        JSON.parse(content);
      } catch (jsonError) {
        return res.status(400).json({
          error: 'Invalid JSON content',
          message: 'Content must be valid JSON for .json files',
          details: jsonError.message
        });
      }
    }
    
    // Audit trail before writing
    logger.info('AI assistant updating knowledge file', {
      filename,
      contentLength: content.length,
      extension,
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });
    
    // Write file atomically
    const tempPath = `${resolvedPath}.tmp`;
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, resolvedPath);
    
    // Get final file stats
    const stats = await fs.stat(resolvedPath);
    
    res.json({
      success: true,
      message: `Knowledge file ${filename} updated successfully`,
      filename,
      size: stats.size,
      lastModified: stats.mtime,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Knowledge file update error', { 
      filename: req.params.filename,
      error: error.message,
      stack: error.stack,
      userAgent: req.headers['user-agent']
    });
    res.status(500).json({
      error: 'Update failed',
      message: 'Could not update knowledge file',
      timestamp: new Date().toISOString()
    });
  }
});

// List available knowledge files
router.get('/knowledge', async (req, res) => {
  try {
    const knowledgeDir = path.join(__dirname, '../_knowledge');
    const files = await fs.readdir(knowledgeDir);
    
    const knowledgeFiles = [];
    for (const file of files) {
      if (isValidFilename(file)) {
        const filePath = path.join(knowledgeDir, file);
        const stats = await fs.stat(filePath);
        knowledgeFiles.push({
          filename: file,
          size: stats.size,
          lastModified: stats.mtime,
          extension: path.extname(file)
        });
      }
    }
    
    logger.info('AI assistant listed knowledge files', {
      fileCount: knowledgeFiles.length,
      userAgent: req.headers['user-agent']
    });
    
    res.json({
      files: knowledgeFiles,
      totalFiles: knowledgeFiles.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Knowledge directory listing error', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Listing failed',
      message: 'Could not list knowledge files'
    });
  }
});

module.exports = router;