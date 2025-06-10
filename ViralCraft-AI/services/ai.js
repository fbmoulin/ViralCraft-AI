/**
 * AI Service for content generation
 */

class AIService {
  constructor() {
    this.cache = new Map();
  }

  async generateContent(prompt, options = {}) {
    const cacheKey = `ai_${Buffer.from(prompt).toString('base64').slice(0, 32)}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      let result = null;

      // Use Claude if available
      if (global.anthropic) {
        const response = await global.anthropic.messages.create({
          model: options.model || "claude-3-sonnet-20240229",
          messages: [{ role: "user", content: prompt }],
          max_tokens: options.maxTokens || 4000
        });
        result = response.content[0].text;
      } 
      // Fallback to OpenAI
      else if (global.openai) {
        const response = await global.openai.chat.completions.create({
          model: options.model || "gpt-4",
          messages: [{ role: "user", content: prompt }],
          max_tokens: options.maxTokens || 3000
        });
        result = response.choices[0].message.content;
      } 
      // Demo mode
      else {
        result = `Demo content for: ${prompt.slice(0, 100)}...`;
      }

      // Cache result
      this.cache.set(cacheKey, result);

      // Simple cache cleanup
      if (this.cache.size > 100) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      return result;
    } catch (error) {
      console.error('AI generation error:', error);
      throw error;
    }
  }

  async analyzeContent(content) {
    const prompt = `Analyze this content for viral potential and suggest improvements: ${content}`;
    return await this.generateContent(prompt, { maxTokens: 1000 });
  }
}

module.exports = new AIService();