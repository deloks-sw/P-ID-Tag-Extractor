/**
 * Regex pattern generator from sample inputs
 * This module provides rule-based regex generation from P&ID sample data
 */

interface GeneratedPatterns {
  line?: string;
  instrument?: {
    func: string;
    num: string;
  };
  drawing?: string;
}

// Note: escapeRegex function kept for potential future use
// function escapeRegex(str: string): string {
//   return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// }

/**
 * Analyzes a line number sample and generates regex pattern
 * Examples:
 * - "42"-7300-P-037-11051XR-PP" -> pattern for size-number-service-number format
 * - "8"-PL-30001-C1C" -> pattern for size-service-number-suffix format
 */
function analyzeLineSample(sample: string): string {
  if (!sample) return '';

  // Common P&ID line patterns
  // Pattern 1: Size"-ServiceCode-Number-Suffix (e.g., 8"-PL-30001-C1C)
  const pattern1 = /^(\d+(?:\/\d+)?)"?-([A-Z]{1,4})-(\d{3,})(?:-([A-Z0-9]+))?$/i;

  // Pattern 2: Size"-Number-Service-Number-Details (e.g., 42"-7300-P-037-11051XR-PP)
  const pattern2 = /^(\d+)"?-(\d{4})-([A-Z])-(\d{3})-([A-Z0-9-]+)$/i;

  // Pattern 3: Size"-ServiceCode-Number (simple format)
  const pattern3 = /^(\d+(?:\/\d+)?)"?-([A-Z]{2,})-(\d+)$/i;

  if (pattern1.test(sample)) {
    // Build regex for pattern 1
    return '\\d+(?:[/\\d]+)?"?-[A-Z]{1,4}-\\d{3,}(?:-[A-Z0-9]+)?';
  } else if (pattern2.test(sample)) {
    // Build regex for pattern 2
    return '\\d+"?-\\d{4}-[A-Z]-\\d{3}-[A-Z0-9-]+';
  } else if (pattern3.test(sample)) {
    // Build regex for pattern 3
    return '\\d+(?:[/\\d]+)?"?-[A-Z]{2,}-\\d+';
  }

  // Fallback: create a flexible pattern based on the sample structure
  const parts = sample.split(/[-"]/);
  let pattern = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;

    if (i > 0) pattern += '-';

    if (/^\d+$/.test(part)) {
      // Pure numbers
      pattern += `\\d{${part.length}}`;
    } else if (/^\d+\/\d+$/.test(part)) {
      // Fractions (e.g., 1/2)
      pattern += '\\d+/\\d+';
    } else if (/^[A-Z]+$/i.test(part)) {
      // Letters only
      pattern += `[A-Z]{${part.length}}`;
    } else if (/^[A-Z0-9]+$/i.test(part)) {
      // Alphanumeric
      pattern += '[A-Z0-9]+';
    } else {
      // Mixed content - be flexible
      pattern += '[A-Z0-9-]+';
    }
  }

  // Add optional quote after size
  if (sample.includes('"')) {
    pattern = pattern.replace(/^(\\d[^-]*)/, '$1"?');
  }

  return pattern || '\\d+(?:[/\\d]+)?"?-[A-Z]{1,4}-\\d{3,}';
}

/**
 * Analyzes instrument tag samples and generates regex patterns
 * Examples:
 * - "FT 101" -> { func: "FT", num: "101" }
 * - "PCV-2001A" -> { func: "PCV", num: "2001A" }
 */
function analyzeInstrumentSample(sample: string): { func: string; num: string } {
  if (!sample) return { func: '', num: '' };

  // Remove extra spaces and normalize
  const normalized = sample.trim().replace(/\s+/g, ' ');

  // Common instrument tag patterns
  // Pattern 1: Function-Number (e.g., FT-101, PCV-2001A)
  const pattern1 = /^([A-Z]{2,5})[-\s]?(\d{3,4}[A-Z]?)$/i;

  // Pattern 2: Function Number with space (e.g., FT 101)
  const pattern2 = /^([A-Z]{2,5})\s+(\d{3,4}[A-Z]?)$/i;

  // Pattern 3: Complex function codes (e.g., FICA 1001)
  const pattern3 = /^([A-Z]{2,6})[-\s]?(\d{3,4}[A-Z]?)$/i;

  const match = normalized.match(pattern1) || normalized.match(pattern2) || normalized.match(pattern3);

  if (match) {
    const funcPart = match[1];
    const numPart = match[2];

    // Generate patterns based on detected parts
    const funcPattern = funcPart.length <= 3
      ? '[A-Z]{2,3}'
      : `[A-Z]{${Math.min(funcPart.length - 1, 2)},${Math.min(funcPart.length + 1, 6)}}`;

    const hasLetterSuffix = /[A-Z]$/.test(numPart);
    const numDigits = numPart.replace(/[A-Z]/g, '').length;
    const numPattern = hasLetterSuffix
      ? `\\d{${numDigits}}[A-Z]?`
      : `\\d{${Math.max(3, numDigits)},${Math.max(4, numDigits)}}`;

    return { func: funcPattern, num: numPattern };
  }

  // Fallback to default patterns
  return { func: '[A-Z]{2,4}', num: '\\d{3,4}(?:\\s?[A-Z])?' };
}

/**
 * Analyzes drawing number samples and generates regex pattern
 * Examples:
 * - "00342GS-7300-PRP-D-105" -> complex drawing number
 * - "P&ID-001-REV-A" -> P&ID specific format
 */
function analyzeDrawingSample(sample: string): string {
  if (!sample) return '';

  // Common drawing number patterns
  // Pattern 1: Alphanumeric with dashes (most common)
  const pattern1 = /^[A-Z0-9]+(-[A-Z0-9]+){2,}$/i;

  // Pattern 2: Special P&ID format
  const pattern2 = /^P&ID-\d+-REV-[A-Z]$/i;

  // Pattern 3: Complex format with multiple sections
  const pattern3 = /^[0-9]{3,}[A-Z]{2,}-[0-9]{4}-[A-Z]{2,}-[A-Z]-[0-9]{3,}$/i;

  if (pattern2.test(sample)) {
    return 'P&ID-\\d+-REV-[A-Z]';
  } else if (pattern3.test(sample)) {
    return '\\d{3,}[A-Z]{2,}-\\d{4}-[A-Z]{2,}-[A-Z]-\\d{3,}';
  } else if (pattern1.test(sample)) {
    // Count minimum sections
    const sections = sample.split('-');
    const minSections = Math.max(3, sections.length - 1);
    const maxSections = sections.length + 2;

    // Check if predominantly numeric or alphanumeric
    const hasLetters = /[A-Z]/i.test(sample);
    const pattern = hasLetters ? '[A-Z0-9]+' : '\\d+';

    // Build pattern with variable sections
    let result = pattern;
    for (let i = 1; i < minSections; i++) {
      result += `(-${pattern})`;
    }
    for (let i = minSections; i < maxSections; i++) {
      result += `(-${pattern})?`;
    }

    return result;
  }

  // Fallback: flexible pattern for drawing numbers
  // Must be at least 10 characters with hyphens
  return '[A-Z0-9][A-Z0-9\\-]{10,}';
}

/**
 * Generate regex patterns from sample P&ID data
 * This is the main function that will be imported and used
 */
export function generateRegexFromSamples(
  lineSample: string,
  instrumentSample: string,
  drawingSample: string
): GeneratedPatterns {
  const patterns: GeneratedPatterns = {};

  // Process line sample
  if (lineSample) {
    // Support multiple samples separated by comma
    const samples = lineSample.split(',').map(s => s.trim()).filter(Boolean);
    if (samples.length === 1) {
      patterns.line = analyzeLineSample(samples[0]);
    } else if (samples.length > 1) {
      // Generate pattern that matches all samples
      const generatedPatterns = samples.map(analyzeLineSample).filter(Boolean);
      if (generatedPatterns.length > 0) {
        // Combine patterns with OR operator
        patterns.line = generatedPatterns.length === 1
          ? generatedPatterns[0]
          : `(${generatedPatterns.join('|')})`;
      }
    }
  }

  // Process instrument sample
  if (instrumentSample) {
    // Support multiple samples
    const samples = instrumentSample.split(',').map(s => s.trim()).filter(Boolean);
    if (samples.length > 0) {
      const instrumentPatterns = samples.map(analyzeInstrumentSample);

      // Combine function patterns
      const funcPatterns = [...new Set(instrumentPatterns.map(p => p.func).filter(Boolean))];
      const numPatterns = [...new Set(instrumentPatterns.map(p => p.num).filter(Boolean))];

      patterns.instrument = {
        func: funcPatterns.length === 1 ? funcPatterns[0] : `(${funcPatterns.join('|')})`,
        num: numPatterns.length === 1 ? numPatterns[0] : `(${numPatterns.join('|')})`
      };
    }
  }

  // Process drawing sample
  if (drawingSample) {
    // Support multiple samples
    const samples = drawingSample.split(',').map(s => s.trim()).filter(Boolean);
    if (samples.length === 1) {
      patterns.drawing = analyzeDrawingSample(samples[0]);
    } else if (samples.length > 1) {
      const generatedPatterns = samples.map(analyzeDrawingSample).filter(Boolean);
      if (generatedPatterns.length > 0) {
        patterns.drawing = generatedPatterns.length === 1
          ? generatedPatterns[0]
          : `(${generatedPatterns.join('|')})`;
      }
    }
  }

  return patterns;
}

/**
 * Mock function for Claude API integration
 * This would be replaced with actual API call in production
 */
export async function generateRegexWithClaude(samples: {
  lineSample: string;
  instrumentSample: string;
  drawingSample: string;
}): Promise<GeneratedPatterns> {
  // Mock delay to simulate API call
  await new Promise(resolve => setTimeout(resolve, 1000));

  // In production, this would:
  // 1. Format the samples with context about P&ID patterns
  // 2. Send request to Claude API with specific instructions
  // 3. Parse the response and extract regex patterns
  // 4. Validate the patterns before returning

  // For now, use the rule-based generator
  return generateRegexFromSamples(
    samples.lineSample,
    samples.instrumentSample,
    samples.drawingSample
  );
}