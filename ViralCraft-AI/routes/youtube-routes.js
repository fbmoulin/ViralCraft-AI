const express = require('express');
const router = express.Router();
const YouTubeAnalyzer = require('../utils/youtube-analyzer');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('📁 Created data directory');
}

/**
 * POST /api/youtube/analyze
 * Analyze a YouTube video and store results
 */
router.post('/analyze', async (req, res) => {
  try {
    const { videoUrl } = req.body;

    if (!videoUrl) {
      return res.status(400).json({ 
        success: false, 
        error: 'Video URL is required' 
      });
    }

    console.log(`📊 Analyzing YouTube video: ${videoUrl}`);

    // Analyze the video
    const analysis = await YouTubeAnalyzer.analyzeVideo(videoUrl);

    // Save analysis to JSON file
    const filePath = await YouTubeAnalyzer.saveAnalysisToJson(analysis);

    // Return success response
    return res.status(200).json({
      success: true,
      message: 'YouTube video analyzed successfully',
      analysis,
      filePath: path.basename(filePath)
    });
  } catch (error) {
    console.error('YouTube analysis error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to analyze YouTube video' 
    });
  }
});

/**
 * GET /api/youtube/analyses
 * Get list of analyzed videos
 */
router.get('/analyses', async (req, res) => {
  try {
    const analyses = await YouTubeAnalyzer.getAllAnalyses();
    res.json({ success: true, analyses });
  } catch (error) {
    console.error('Error fetching analyses:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to retrieve analyzed videos'
    });
  }
});

/**
 * GET /api/youtube/analysis/:id
 * Get specific video analysis
 */
router.get('/analysis/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const analysis = await YouTubeAnalyzer.getAnalysisById(id);

    if (!analysis) {
      return res.status(404).json({ 
        success: false,
        error: 'Analysis not found' 
      });
    }

    res.json({ success: true, analysis });
  } catch (error) {
    console.error('Error fetching analysis:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to retrieve YouTube analysis' 
    });
  }
});

module.exports = router;