const ytdl = require('ytdl-core');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');

// Convert fs functions to promise-based
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const mkdirAsync = promisify(fs.mkdir);
const readdirAsync = promisify(fs.readdir);

/**
 * YouTube video analyzer utility
 * Extracts metadata, transcript, and comments from YouTube videos
 */
class YouTubeAnalyzer {
  /**
   * Analyze a YouTube video and extract information
   * @param {string} videoUrl - The YouTube video URL
   * @returns {Promise<Object>} - Video analysis data
   */
  static async analyzeVideo(videoUrl) {
    try {
      // Validate YouTube URL
      if (!ytdl.validateURL(videoUrl)) {
        throw new Error('Invalid YouTube URL');
      }

      console.log(`📊 Getting video info for: ${videoUrl}`);

      // Get video info
      const videoInfo = await ytdl.getInfo(videoUrl);

      // Extract basic metadata
      const metadata = {
        title: videoInfo.videoDetails.title,
        description: videoInfo.videoDetails.description,
        author: videoInfo.videoDetails.author.name,
        channelUrl: videoInfo.videoDetails.author.channel_url,
        channelId: videoInfo.videoDetails.channelId,
        lengthSeconds: parseInt(videoInfo.videoDetails.lengthSeconds),
        viewCount: parseInt(videoInfo.videoDetails.viewCount),
        uploadDate: videoInfo.videoDetails.uploadDate,
        publishDate: videoInfo.videoDetails.publishDate,
        keywords: videoInfo.videoDetails.keywords || [],
        thumbnailUrl: videoInfo.videoDetails.thumbnails[0]?.url,
        category: videoInfo.videoDetails.category,
        isLiveContent: videoInfo.videoDetails.isLiveContent,
      };

      // Extract engagement metrics
      const engagement = {
        likeCount: parseInt(videoInfo.videoDetails.likes) || 0,
        dislikeCount: parseInt(videoInfo.videoDetails.dislikes) || 0,
        commentCount: parseInt(videoInfo.videoDetails.comments) || 0,
      };

      // Create the analysis object
      const analysis = {
        id: uuidv4(),
        videoId: videoInfo.videoDetails.videoId,
        url: videoUrl,
        metadata,
        engagement,
        formats: videoInfo.formats.slice(0, 5).map(format => ({
          quality: format.qualityLabel,
          mimeType: format.mimeType,
          container: format.container,
          hasAudio: format.hasAudio,
          hasVideo: format.hasVideo,
          bitrate: format.bitrate,
        })),
        analysisDate: new Date().toISOString(),
        timestamp: new Date().toISOString(),
      };

      return analysis;
    } catch (error) {
      console.error('YouTube analysis error:', error.message);
      throw error;
    }
  }

  /**
   * Save video analysis to a JSON file
   * @param {Object} analysis - The video analysis data
   * @param {string} outputPath - Optional custom output path
   * @returns {Promise<string>} - Path to the saved file
   */
  static async saveAnalysisToJson(analysis, outputPath = null) {
    try {
      // Ensure data directory exists
      const dataDir = path.join(__dirname, '..', 'data');
      if (!fs.existsSync(dataDir)) {
        await mkdirAsync(dataDir, { recursive: true });
      }

      // Create a subdirectory for YouTube analyses
      const youtubeDir = path.join(dataDir, 'youtube');
      if (!fs.existsSync(youtubeDir)) {
        await mkdirAsync(youtubeDir, { recursive: true });
      }

      // Create filename from video ID and timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${analysis.videoId || 'video'}_${timestamp}.json`;
      const filePath = outputPath || path.join(youtubeDir, fileName);

      // Write the analysis to a file
      await writeFileAsync(filePath, JSON.stringify(analysis, null, 2), 'utf8');

      return filePath;
    } catch (error) {
      console.error('Failed to save analysis:', error.message);
      throw error;
    }
  }

  /**
   * Get all saved analyses
   * @returns {Array} All saved analyses
   */
  static async getAllAnalyses() {
    try {
      const youtubeDir = path.join(__dirname, '..', 'data', 'youtube');

      // Check if directory exists
      if (!fs.existsSync(youtubeDir)) {
        return [];
      }

      const files = await readdirAsync(youtubeDir);
      const analyses = [];

      for (const file of files) {
        if (file.endsWith('.json')) {
          const filePath = path.join(youtubeDir, file);
          const content = await readFileAsync(filePath, 'utf8');
          analyses.push(JSON.parse(content));
        }
      }

      return analyses.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    } catch (error) {
      console.error('Error getting analyses:', error);
      throw error;
    }
  }

  /**
   * Get a specific analysis by ID
   * @param {string} id - The analysis ID
   * @returns {object|null} The analysis object or null if not found
   */
  static async getAnalysisById(id) {
    try {
      const analyses = await this.getAllAnalyses();
      return analyses.find(analysis => analysis.id === id) || null;
    } catch (error) {
      console.error('Error getting analysis by ID:', error);
      throw error;
    }
  }
}

module.exports = YouTubeAnalyzer;