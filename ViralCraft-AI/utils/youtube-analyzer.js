
const ytdl = require('ytdl-core');
const axios = require('axios');
const path = require('path');

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

      // Get video info
      const videoInfo = await ytdl.getInfo(videoUrl);
      
      // Extract basic metadata
      const metadata = {
        title: videoInfo.videoDetails.title,
        description: videoInfo.videoDetails.description,
        author: videoInfo.videoDetails.author.name,
        channelUrl: videoInfo.videoDetails.author.channel_url,
        lengthSeconds: parseInt(videoInfo.videoDetails.lengthSeconds),
        viewCount: parseInt(videoInfo.videoDetails.viewCount),
        uploadDate: videoInfo.videoDetails.uploadDate,
        keywords: videoInfo.videoDetails.keywords || [],
        thumbnailUrl: videoInfo.videoDetails.thumbnails[0].url,
        category: videoInfo.videoDetails.category,
        isLiveContent: videoInfo.videoDetails.isLiveContent,
      };

      // Get top comments (limited to 50)
      const comments = videoInfo.comments ? 
        videoInfo.comments.slice(0, 50).map(comment => ({
          author: comment.author.name,
          text: comment.text,
          likes: comment.likes,
          publishedAt: comment.publishedAt,
        })) : [];

      // Create the analysis object
      const analysis = {
        videoId: videoInfo.videoDetails.videoId,
        url: videoUrl,
        metadata,
        comments,
        analysisDate: new Date().toISOString(),
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
      const fileName = `youtube_${analysis.videoId}_${Date.now()}.json`;
      const filePath = outputPath || path.join(__dirname, '../data', fileName);
      
      // Ensure the directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Write the analysis to a file
      fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2));
      
      return filePath;
    } catch (error) {
      console.error('Failed to save analysis:', error.message);
      throw error;
    }
  }
}

module.exports = YouTubeAnalyzer;
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');

// Convert fs functions to promise-based
const writeFileAsync = promisify(fs.writeFile);
const readFileAsync = promisify(fs.readFile);
const mkdirAsync = promisify(fs.mkdir);
const readdirAsync = promisify(fs.readdir);

class YouTubeAnalyzer {
  /**
   * Analyze a YouTube video
   * @param {string} url - The YouTube video URL
   * @returns {object} Analysis results
   */
  static async analyzeVideo(url) {
    try {
      // Validate the YouTube URL
      if (!ytdl.validateURL(url)) {
        throw new Error('Invalid YouTube URL');
      }

      console.log(`Getting info for: ${url}`);
      
      // Get video information
      const info = await ytdl.getInfo(url);
      
      // Extract metadata
      const metadata = {
        title: info.videoDetails.title,
        author: info.videoDetails.author.name,
        channelId: info.videoDetails.channelId,
        viewCount: parseInt(info.videoDetails.viewCount, 10),
        lengthSeconds: parseInt(info.videoDetails.lengthSeconds, 10),
        publishDate: info.videoDetails.publishDate,
        description: info.videoDetails.description,
        category: info.videoDetails.category,
        thumbnailUrl: info.videoDetails.thumbnails[0]?.url,
        keywords: info.videoDetails.keywords || [],
        isLiveContent: info.videoDetails.isLiveContent,
      };

      // Extract engagement metrics
      const engagement = {
        likeCount: info.videoDetails.likes || 0,
        dislikeCount: info.videoDetails.dislikes || 0,
        commentCount: info.videoDetails.comments || 0,
      };

      // Build the analysis object
      const analysis = {
        id: uuidv4(),
        url,
        metadata,
        engagement,
        videoId: info.videoDetails.videoId,
        formats: info.formats.map(format => ({
          quality: format.qualityLabel,
          mimeType: format.mimeType,
          container: format.container,
          hasAudio: format.hasAudio,
          hasVideo: format.hasVideo,
          bitrate: format.bitrate,
        })),
        timestamp: new Date().toISOString(),
      };

      return analysis;
    } catch (error) {
      console.error('YouTube analysis error:', error.message);
      throw error;
    }
  }

  /**
   * Save analysis to JSON file
   * @param {object} analysis - The analysis object
   * @returns {string} The file path where analysis was saved
   */
  static async saveAnalysisToJson(analysis) {
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
      const filename = `${analysis.videoId || 'video'}_${timestamp}.json`;
      const filePath = path.join(youtubeDir, filename);

      // Write the analysis to file
      await writeFileAsync(filePath, JSON.stringify(analysis, null, 2), 'utf8');
      
      return filePath;
    } catch (error) {
      console.error('Error saving analysis:', error);
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

      return analyses;
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
