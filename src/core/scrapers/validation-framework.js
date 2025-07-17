/**
 * Unified Validation Framework
 * Provides standardized confidence scoring and false positive reduction
 */

class ValidationFramework {
  constructor(config = {}) {
    this.config = {
      // Confidence thresholds
      minConfidenceThreshold: config.minConfidenceThreshold || 0.3,
      highConfidenceThreshold: config.highConfidenceThreshold || 0.7,
      
      // Content matching requirements
      titleMatchThreshold: config.titleMatchThreshold || 0.6,
      authorMatchThreshold: config.authorMatchThreshold || 0.7,
      
      // Cross-validation settings
      enableCrossValidation: config.enableCrossValidation !== false,
      maxAllowedFalsePositives: config.maxAllowedFalsePositives || 0.1,
      
      ...config
    };
  }

  /**
   * Standardized confidence calculation across all scrapers
   */
  calculateUnifiedConfidence(metrics) {
    const {
      strongIndicators = 0,
      mediumIndicators = 0,
      weakIndicators = 0,
      titleMatch = false,
      authorMatch = false,
      contentQuality = 1.0,
      sourceReliability = 1.0
    } = metrics;

    let confidence = 0.0;

    // Base confidence from indicators (weighted by reliability)
    confidence += (strongIndicators * 0.3 * sourceReliability);
    confidence += (mediumIndicators * 0.15 * sourceReliability);
    confidence += (weakIndicators * 0.05 * sourceReliability);

    // Content matching boost (primary validation)
    if (titleMatch && authorMatch) {
      confidence += 0.4 * contentQuality;
    } else if (titleMatch || authorMatch) {
      confidence += 0.2 * contentQuality;
    }

    // Penalty for missing critical matches
    if (!titleMatch && !authorMatch) {
      confidence = 0.0; // No confidence without content match
    }

    // Quality adjustments
    if (titleMatch && authorMatch && strongIndicators > 0) {
      confidence = Math.min(confidence + 0.1, 0.95); // Cap at 95%
    }

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Validate availability result against false positive patterns
   */
  validateAvailabilityResult(result, scraperType) {
    const validation = {
      isValid: false,
      confidence: result.confidence || 0,
      adjustedConfidence: 0,
      warnings: [],
      falsePositiveRisk: 'low'
    };

    // Check minimum confidence threshold
    if (validation.confidence < this.config.minConfidenceThreshold) {
      validation.warnings.push('Below minimum confidence threshold');
      validation.falsePositiveRisk = 'high';
    }

    // Scraper-specific validation
    switch (scraperType) {
      case 'kindle_unlimited':
        validation.adjustedConfidence = this.validateKUResult(result, validation);
        break;
      case 'hoopla':
        validation.adjustedConfidence = this.validateHooplaResult(result, validation);
        break;
      case 'library':
        validation.adjustedConfidence = this.validateLibraryResult(result, validation);
        break;
      default:
        validation.adjustedConfidence = validation.confidence;
    }

    // Final validation
    validation.isValid = validation.adjustedConfidence >= this.config.minConfidenceThreshold;
    
    if (validation.adjustedConfidence !== validation.confidence) {
      validation.warnings.push('Confidence adjusted for false positive reduction');
    }

    return validation;
  }

  /**
   * Kindle Unlimited specific validation
   */
  validateKUResult(result, validation) {
    let adjustedConfidence = validation.confidence;

    // Check for KU-specific false positive patterns
    if (result.ku_availability && validation.confidence > 0.8) {
      // High confidence claims need stronger validation
      if (!result.validation_details?.strong_indicators) {
        adjustedConfidence *= 0.7;
        validation.warnings.push('High confidence without strong KU indicators');
      }
      
      if (!result.validation_details?.title_match || !result.validation_details?.author_match) {
        adjustedConfidence *= 0.6;
        validation.warnings.push('Incomplete content matching for high confidence claim');
      }
    }

    // Penalize weak matching patterns
    if (result.ku_availability && !result.validation_details?.content_match) {
      adjustedConfidence = 0.0;
      validation.warnings.push('No content match - likely false positive');
      validation.falsePositiveRisk = 'very high';
    }

    return adjustedConfidence;
  }

  /**
   * Hoopla specific validation
   */
  validateHooplaResult(result, validation) {
    let adjustedConfidence = validation.confidence;

    // Check format-specific validation
    if (result.hoopla_ebook_available || result.hoopla_audio_available) {
      const formatDetails = result.format_details;
      
      if (formatDetails) {
        const ebookConf = formatDetails.ebook?.confidence || 0;
        const audioConf = formatDetails.audiobook?.confidence || 0;
        const maxFormatConf = Math.max(ebookConf, audioConf);
        
        if (maxFormatConf < this.config.minConfidenceThreshold) {
          adjustedConfidence = maxFormatConf;
          validation.warnings.push('Format-specific confidence below threshold');
        }
      }
    }

    return adjustedConfidence;
  }

  /**
   * Library specific validation
   */
  validateLibraryResult(result, validation) {
    let adjustedConfidence = validation.confidence;

    if (result.library_availability) {
      const systems = Object.values(result.library_availability);
      const availableSystems = systems.filter(system => 
        system.ebook_status === 'Available' || system.audio_status === 'Available'
      );

      // Validate confidence consistency across systems
      if (availableSystems.length > 0) {
        const confidences = availableSystems
          .map(system => system.confidence)
          .filter(conf => conf !== undefined);
        
        if (confidences.length > 0) {
          const avgSystemConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
          
          if (Math.abs(validation.confidence - avgSystemConfidence) > 0.3) {
            adjustedConfidence = Math.min(validation.confidence, avgSystemConfidence + 0.1);
            validation.warnings.push('Confidence inconsistency across library systems');
          }
        }
      }
    }

    return adjustedConfidence;
  }

  /**
   * Cross-validate results between scrapers
   */
  crossValidateResults(results) {
    const sources = Object.keys(results.sources || {});
    const availableResults = [];
    
    // Collect availability claims
    sources.forEach(source => {
      const result = results.sources[source];
      if (this.isAvailabilityClaimMade(result, source)) {
        availableResults.push({ source, result });
      }
    });

    // Apply cross-validation if enabled
    if (this.config.enableCrossValidation && availableResults.length > 1) {
      return this.performCrossValidation(availableResults, results);
    }

    return results;
  }

  /**
   * Check if scraper result claims availability
   */
  isAvailabilityClaimMade(result, source) {
    switch (source) {
      case 'kindle_unlimited':
        return result.ku_availability === true;
      case 'hoopla':
        return result.hoopla_ebook_available || result.hoopla_audio_available;
      case 'libraries':
        return Object.values(result.library_availability || {}).some(system =>
          system.ebook_status === 'Available' || system.audio_status === 'Available'
        );
      default:
        return false;
    }
  }

  /**
   * Perform cross-validation between multiple positive results
   */
  performCrossValidation(availableResults, originalResults) {
    // Calculate consensus confidence
    const confidences = availableResults
      .map(item => item.result.confidence || 0)
      .filter(conf => conf > 0);
    
    if (confidences.length === 0) {return originalResults;}

    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    const consensusThreshold = 0.6;

    // Apply consensus validation
    if (avgConfidence >= consensusThreshold) {
      // High consensus - boost confidence slightly
      availableResults.forEach(item => {
        const result = originalResults.sources[item.source];
        if (result.confidence) {
          result.confidence = Math.min(result.confidence * 1.1, 0.95);
          result.cross_validated = true;
        }
      });
    } else {
      // Low consensus - reduce confidence
      availableResults.forEach(item => {
        const result = originalResults.sources[item.source];
        if (result.confidence) {
          result.confidence = Math.max(result.confidence * 0.8, 0.1);
          result.cross_validation_warning = 'Low consensus with other sources';
        }
      });
    }

    return originalResults;
  }

  /**
   * Generate validation summary for debugging
   */
  generateValidationSummary(results) {
    const summary = {
      total_sources: Object.keys(results.sources || {}).length,
      validated_sources: 0,
      high_confidence_sources: 0,
      warnings: [],
      false_positive_risk: 'low'
    };

    Object.entries(results.sources || {}).forEach(([source, result]) => {
      const validation = this.validateAvailabilityResult(result, source);
      
      if (validation.isValid) {
        summary.validated_sources++;
      }
      
      if (validation.adjustedConfidence >= this.config.highConfidenceThreshold) {
        summary.high_confidence_sources++;
      }
      
      summary.warnings.push(...validation.warnings);
      
      if (validation.falsePositiveRisk === 'high' || validation.falsePositiveRisk === 'very high') {
        summary.false_positive_risk = validation.falsePositiveRisk;
      }
    });

    return summary;
  }
}

module.exports = ValidationFramework;