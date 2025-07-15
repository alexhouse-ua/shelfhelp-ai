/**
 * Fuzzy Classification Matcher for ShelfHelp AI
 * Enables intelligent matching of genres, subgenres, and tropes
 * for AI agents doing book research and classification
 */

const yaml = require('yaml');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

class FuzzyClassificationMatcher {
  constructor() {
    this.genres = [];
    this.subgenres = [];
    this.tropes = [];
    this.spiceLevels = [];
    this.classifications = null;
  }

  async initialize(classificationsPath) {
    try {
      const data = await fs.readFile(classificationsPath, 'utf-8');
      this.classifications = yaml.parse(data);
      this._buildSearchableArrays();
      logger.info('Fuzzy matcher initialized successfully', {
        genres: this.genres.length,
        subgenres: this.subgenres.length,
        tropes: this.tropes.length,
        spiceLevels: this.spiceLevels.length,
        operation: 'fuzzy_matcher_init'
      });
    } catch (error) {
      logger.error('Failed to initialize fuzzy matcher', { 
        error: error.message,
        operation: 'fuzzy_matcher_init' 
      });
      throw error;
    }
  }

  _buildSearchableArrays() {
    // Extract all genres
    if (this.classifications.Genres) {
      this.genres = [...new Set(this.classifications.Genres.map(g => g.Genre))];
      this.subgenres = [...new Set(this.classifications.Genres.map(g => g.Subgenre).filter(Boolean))];
    }

    // Extract all tropes from all genre groups
    if (this.classifications.Tropes) {
      this.tropes = [];
      this.classifications.Tropes.forEach(genreGroup => {
        if (genreGroup.Tropes && Array.isArray(genreGroup.Tropes)) {
          this.tropes.push(...genreGroup.Tropes);
        }
      });
      this.tropes = [...new Set(this.tropes)]; // Remove duplicates
    }

    // Extract spice levels
    if (this.classifications.Spice_Levels) {
      this.spiceLevels = this.classifications.Spice_Levels.map(level => level.Label);
    }
  }

  /**
   * Calculate similarity between two strings using multiple algorithms
   */
  _calculateSimilarity(str1, str2) {
    if (!str1 || !str2) {return 0;}
    
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();
    
    // Exact match
    if (s1 === s2) {return 1.0;}
    
    // Contains match (high score for substring matches)
    if (s1.includes(s2) || s2.includes(s1)) {
      const longer = Math.max(s1.length, s2.length);
      const shorter = Math.min(s1.length, s2.length);
      return 0.8 + (shorter / longer) * 0.15; // 0.8 to 0.95
    }

    // Levenshtein distance
    const levenshteinSim = this._levenshteinSimilarity(s1, s2);
    
    // Jaccard similarity (for multi-word matches)
    const jaccardSim = this._jaccardSimilarity(s1, s2);
    
    // Token-based similarity (handles reordering)
    const tokenSim = this._tokenSimilarity(s1, s2);
    
    // Return the highest similarity score
    return Math.max(levenshteinSim, jaccardSim, tokenSim);
  }

  _levenshteinSimilarity(str1, str2) {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) {matrix[0][i] = i;}
    for (let j = 0; j <= str2.length; j++) {matrix[j][0] = j;}
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const substitutionCost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + substitutionCost // substitution
        );
      }
    }
    
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0 ? 1 : 1 - matrix[str2.length][str1.length] / maxLength;
  }

  _jaccardSimilarity(str1, str2) {
    const set1 = new Set(str1.toLowerCase().split(/\s+/));
    const set2 = new Set(str2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  _tokenSimilarity(str1, str2) {
    const tokens1 = str1.toLowerCase().split(/\s+/).sort();
    const tokens2 = str2.toLowerCase().split(/\s+/).sort();
    
    if (tokens1.join('') === tokens2.join('')) {return 0.9;} // Same words, different order
    
    let matches = 0;
    const checked = new Set();
    
    tokens1.forEach(token1 => {
      tokens2.forEach((token2, index) => {
        if (!checked.has(index) && this._levenshteinSimilarity(token1, token2) > 0.8) {
          matches++;
          checked.add(index);
        }
      });
    });
    
    const totalTokens = Math.max(tokens1.length, tokens2.length);
    return totalTokens === 0 ? 0 : matches / totalTokens;
  }

  /**
   * Find best matching genre with confidence score
   */
  matchGenre(input, threshold = 0.6) {
    if (!input) {return null;}
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const genre of this.genres) {
      const score = this._calculateSimilarity(input, genre);
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestMatch = {
          value: genre,
          confidence: score,
          input: input
        };
      }
    }
    
    return bestMatch;
  }

  /**
   * Find best matching subgenre with confidence score
   */
  matchSubgenre(input, threshold = 0.6) {
    if (!input) {return null;}
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const subgenre of this.subgenres) {
      const score = this._calculateSimilarity(input, subgenre);
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestMatch = {
          value: subgenre,
          confidence: score,
          input: input
        };
      }
    }
    
    return bestMatch;
  }

  /**
   * Find best matching tropes with confidence scores
   */
  matchTropes(inputTropes, threshold = 0.6, maxResults = 10) {
    if (!inputTropes || !Array.isArray(inputTropes)) {return [];}
    
    const matches = [];
    
    inputTropes.forEach(input => {
      if (!input) {return;}
      
      let bestMatch = null;
      let bestScore = 0;
      
      for (const trope of this.tropes) {
        const score = this._calculateSimilarity(input, trope);
        if (score > bestScore && score >= threshold) {
          bestScore = score;
          bestMatch = {
            value: trope,
            confidence: score,
            input: input
          };
        }
      }
      
      if (bestMatch) {
        matches.push(bestMatch);
      }
    });
    
    // Sort by confidence and return top results
    return matches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxResults);
  }

  /**
   * Intelligent spice level matching (handles various formats)
   */
  matchSpiceLevel(input) {
    if (!input) {return null;}
    
    const inputStr = String(input).toLowerCase().trim();
    
    // Direct numeric mapping
    if (/^[1-5]$/.test(inputStr)) {
      return {
        value: parseInt(inputStr),
        confidence: 1.0,
        input: input
      };
    }
    
    // Keyword mapping
    const spiceKeywords = {
      'clean': 1, 'sweet': 1, 'innocent': 1, 'closed door': 1,
      'kisses': 2, 'fade to black': 2, 'behind closed doors': 2,
      'steamy': 3, 'open door': 3, 'moderate heat': 3,
      'hot': 4, 'explicit': 4, 'very steamy': 4,
      'scorching': 5, 'erotic': 5, 'extremely hot': 5, 'graphic': 5
    };
    
    for (const [keyword, level] of Object.entries(spiceKeywords)) {
      if (inputStr.includes(keyword)) {
        return {
          value: level,
          confidence: 0.8,
          input: input,
          reason: `Matched keyword: "${keyword}"`
        };
      }
    }
    
    // Pepper emoji counting 🌶️
    const pepperCount = (inputStr.match(/🌶️/g) || []).length;
    if (pepperCount >= 1 && pepperCount <= 5) {
      return {
        value: pepperCount,
        confidence: 0.9,
        input: input,
        reason: `Counted ${pepperCount} pepper emoji(s)`
      };
    }
    
    return null;
  }

  /**
   * Comprehensive book classification
   * Takes raw AI research data and returns structured classifications
   */
  classifyBook(bookData) {
    const result = {
      original: bookData,
      matched: {},
      confidence: {},
      suggestions: {},
      errors: []
    };
    
    try {
      // Match genre
      if (bookData.genre) {
        const genreMatch = this.matchGenre(bookData.genre);
        if (genreMatch) {
          result.matched.genre = genreMatch.value;
          result.confidence.genre = genreMatch.confidence;
        } else {
          result.errors.push(`No genre match found for: "${bookData.genre}"`);
          result.suggestions.genre = this._suggestAlternatives(bookData.genre, this.genres, 3);
        }
      }
      
      // Match subgenre
      if (bookData.subgenre) {
        const subgenreMatch = this.matchSubgenre(bookData.subgenre);
        if (subgenreMatch) {
          result.matched.subgenre = subgenreMatch.value;
          result.confidence.subgenre = subgenreMatch.confidence;
        } else {
          result.errors.push(`No subgenre match found for: "${bookData.subgenre}"`);
          result.suggestions.subgenre = this._suggestAlternatives(bookData.subgenre, this.subgenres, 3);
        }
      }
      
      // Match tropes
      if (bookData.tropes) {
        const tropeMatches = this.matchTropes(bookData.tropes);
        if (tropeMatches.length > 0) {
          result.matched.tropes = tropeMatches.map(match => match.value);
          result.confidence.tropes = tropeMatches.map(match => ({
            trope: match.value,
            confidence: match.confidence,
            originalInput: match.input
          }));
        } else {
          result.errors.push(`No trope matches found for: ${bookData.tropes.join(', ')}`);
          result.suggestions.tropes = bookData.tropes.map(trope => 
            this._suggestAlternatives(trope, this.tropes, 3)
          ).flat();
        }
      }
      
      // Match spice level
      if (bookData.spice !== undefined) {
        const spiceMatch = this.matchSpiceLevel(bookData.spice);
        if (spiceMatch) {
          result.matched.spice = spiceMatch.value;
          result.confidence.spice = spiceMatch.confidence;
          if (spiceMatch.reason) {
            result.confidence.spiceReason = spiceMatch.reason;
          }
        } else {
          result.errors.push(`No spice level match found for: "${bookData.spice}"`);
        }
      }
      
      // Calculate overall confidence
      const confidenceValues = Object.values(result.confidence).filter(c => typeof c === 'number');
      result.overallConfidence = confidenceValues.length > 0 
        ? confidenceValues.reduce((sum, c) => sum + c, 0) / confidenceValues.length 
        : 0;
      
    } catch (error) {
      result.errors.push(`Classification error: ${error.message}`);
    }
    
    return result;
  }

  _suggestAlternatives(input, candidates, limit = 3) {
    return candidates
      .map(candidate => ({
        value: candidate,
        similarity: this._calculateSimilarity(input, candidate)
      }))
      .filter(item => item.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => item.value);
  }

  /**
   * Get all available classifications for AI agents
   */
  getAvailableClassifications() {
    return {
      genres: this.genres,
      subgenres: this.subgenres,
      tropes: this.tropes,
      spiceLevels: [1, 2, 3, 4, 5],
      spiceDescriptions: this.classifications?.Spice_Levels || []
    };
  }

  /**
   * Validate against fuzzy matches (replaces strict validation)
   */
  validateBookData(bookData, options = {}) {
    const { 
      genreThreshold = 0.7,
      subgenreThreshold = 0.7, 
      tropeThreshold = 0.6,
      allowSuggestions = true 
    } = options;
    
    const result = this.classifyBook(bookData);
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      suggestions: {},
      matched: result.matched
    };
    
    // Check if matches meet confidence thresholds
    if (bookData.genre && (!result.matched.genre || result.confidence.genre < genreThreshold)) {
      validation.isValid = false;
      validation.errors.push(`Genre "${bookData.genre}" confidence too low (${(result.confidence.genre || 0).toFixed(2)})`);
      if (allowSuggestions) {
        validation.suggestions.genre = result.suggestions.genre;
      }
    }
    
    if (bookData.subgenre && (!result.matched.subgenre || result.confidence.subgenre < subgenreThreshold)) {
      validation.warnings.push(`Subgenre "${bookData.subgenre}" confidence low (${(result.confidence.subgenre || 0).toFixed(2)})`);
      if (allowSuggestions) {
        validation.suggestions.subgenre = result.suggestions.subgenre;
      }
    }
    
    if (bookData.tropes && result.confidence.tropes) {
      const lowConfidenceTropes = result.confidence.tropes.filter(t => t.confidence < tropeThreshold);
      if (lowConfidenceTropes.length > 0) {
        validation.warnings.push(`Low confidence tropes: ${lowConfidenceTropes.map(t => t.originalInput).join(', ')}`);
      }
    }
    
    return validation;
  }
}

module.exports = FuzzyClassificationMatcher;
