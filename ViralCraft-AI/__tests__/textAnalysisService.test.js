const textAnalysis = require('../services/textAnalysisService');

describe('textAnalysisService', () => {
  describe('countWords', () => {
    it('counts whitespace-separated tokens, ignoring empties', () => {
      expect(textAnalysis.countWords('hello world')).toBe(2);
      expect(textAnalysis.countWords('  spaced   out   ')).toBe(2);
      expect(textAnalysis.countWords('')).toBe(0);
    });
  });

  describe('calculateReadTime', () => {
    it('returns ceil(words / wpm)', () => {
      const text = Array(401).fill('w').join(' ');
      expect(textAnalysis.calculateReadTime(text)).toBe(3); // 401/200 → ceil = 3
    });

    it('respects custom words-per-minute', () => {
      const text = Array(100).fill('w').join(' ');
      expect(textAnalysis.calculateReadTime(text, 50)).toBe(2);
    });
  });

  describe('analyzeSentiment', () => {
    it('detects positive sentiment', () => {
      expect(textAnalysis.analyzeSentiment('isso é excelente e fantástico')).toBe('positive');
    });

    it('detects negative sentiment', () => {
      expect(textAnalysis.analyzeSentiment('isso é péssimo, um fracasso')).toBe('negative');
    });

    it('defaults to neutral', () => {
      expect(textAnalysis.analyzeSentiment('apenas um texto comum')).toBe('neutral');
    });
  });

  describe('calculateViralScore', () => {
    it('returns a number between 0 and 100', () => {
      const score = textAnalysis.calculateViralScore('texto comum sem nada especial', 'instagram');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('boosts score for emotional triggers, emojis, questions and CTAs', () => {
      const baseline = textAnalysis.calculateViralScore('um texto neutro qualquer', 'instagram');
      const enriched = textAnalysis.calculateViralScore(
        'descobrir o segredo incrível! 🚀 #viral compartilhe agora?',
        'instagram'
      );
      expect(enriched).toBeGreaterThan(baseline);
    });
  });

  describe('analyzeContent', () => {
    it('returns a structured object with all expected keys', () => {
      const result = textAnalysis.analyzeContent('Texto de teste com algumas palavras.', 'twitter');
      expect(result).toEqual(
        expect.objectContaining({
          wordCount: expect.any(Number),
          characterCount: expect.any(Number),
          estimatedReadTime: expect.any(Number),
          viralScore: expect.any(Number),
          sentiment: expect.stringMatching(/positive|negative|neutral/),
          suggestions: expect.any(Array)
        })
      );
    });
  });
});
