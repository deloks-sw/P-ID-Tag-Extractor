import { Category, PatternConfig, ToleranceConfig, Tag } from '../types';
import { extractTags } from './taggingService';

interface OptimizationResult {
  tolerances: ToleranceConfig;
  score: number;
  tagCount: number;
  details: {
    vertical: number;
    horizontal: number;
    autoLinkDistance: number;
    testedPages: number[];
    tagsByPage: Map<number, number>;
  };
}

interface OptimizationConfig {
  verticalRange: { min: number; max: number; step: number };
  horizontalRange: { min: number; max: number; step: number };
  autoLinkRange: { min: number; max: number; step: number };
  maxPagesToTest: number;
  minConfidenceScore: number;
}

const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  verticalRange: { min: 5, max: 30, step: 5 },
  horizontalRange: { min: 5, max: 40, step: 5 },
  autoLinkRange: { min: 20, max: 50, step: 10 },
  maxPagesToTest: 3,
  minConfidenceScore: 0.7,
};

/**
 * Calculate a quality score for detected tags
 * Higher score means better detection quality
 */
function calculateTagQuality(tags: Tag[]): number {
  const instrumentTags = tags.filter(t => t.category === Category.Instrument);

  if (instrumentTags.length === 0) return 0;

  // Factors for quality score:
  // 1. Number of tags (more is better, but with diminishing returns)
  const countScore = Math.log(instrumentTags.length + 1) * 10;

  // 2. Text pattern consistency (tags should follow expected format)
  const validPatternCount = instrumentTags.filter(tag => {
    // Check if tag follows expected pattern: 2-4 letters + number + optional letter
    return /^[A-Z]{2,4}[-\s]?\d{3,4}[A-Z]?$/i.test(tag.text);
  }).length;
  const patternScore = (validPatternCount / instrumentTags.length) * 30;

  // 3. Distribution across pages (better if tags are found on multiple pages)
  const pagesWithTags = new Set(instrumentTags.map(t => t.page)).size;
  const distributionScore = Math.min(pagesWithTags * 5, 20);

  // 4. Reasonable tag density (not too many tags per page - might indicate false positives)
  const avgTagsPerPage = instrumentTags.length / pagesWithTags;
  const densityScore = avgTagsPerPage > 100 ?
    Math.max(0, 20 - (avgTagsPerPage - 100) * 0.2) : 20;

  return countScore + patternScore + distributionScore + densityScore;
}

/**
 * Test a specific tolerance configuration
 */
async function testToleranceConfig(
  pdfDoc: any,
  pageNumbers: number[],
  patterns: PatternConfig,
  tolerances: ToleranceConfig,
  appSettings: any
): Promise<{ tags: Tag[], quality: number }> {
  const allTags: Tag[] = [];

  for (const pageNum of pageNumbers) {
    try {
      const { tags } = await extractTags(
        pdfDoc,
        pageNum,
        patterns,
        tolerances,
        appSettings
      );
      allTags.push(...tags);
    } catch (error) {
      // Error testing page
    }
  }

  const quality = calculateTagQuality(allTags);
  return { tags: allTags, quality };
}

/**
 * Automatically optimize tolerance parameters for instrument detection
 */
export async function optimizeTolerances(
  pdfDoc: any,
  patterns: PatternConfig,
  currentTolerances: ToleranceConfig,
  appSettings: any,
  config: Partial<OptimizationConfig> = {},
  onProgress?: (progress: number, message: string) => void
): Promise<OptimizationResult> {
  const optConfig = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };

  // Select pages to test from the middle of the document
  // Skip first few pages (often title, legend, symbol pages)
  const totalPages = pdfDoc.numPages;
  const pagesToTest: number[] = [];

  // Skip first 2-3 pages if document has more than 5 pages
  const skipInitialPages = totalPages > 5 ? 3 : 1;

  // Calculate the middle section of the document
  const effectiveStartPage = skipInitialPages + 1;
  const effectiveEndPage = Math.min(totalPages, Math.max(totalPages - 2, effectiveStartPage + 5));

  if (totalPages <= 3) {
    // For very short documents, just use all pages
    for (let i = 1; i <= totalPages; i++) {
      pagesToTest.push(i);
    }
  } else if (totalPages <= 10) {
    // For medium documents, sample from middle pages
    const midPoint = Math.floor(totalPages / 2);
    pagesToTest.push(midPoint);
    if (midPoint - 1 >= skipInitialPages) pagesToTest.push(midPoint - 1);
    if (midPoint + 1 <= totalPages) pagesToTest.push(midPoint + 1);
    pagesToTest.sort((a, b) => a - b);
  } else {
    // For larger documents, sample pages from the middle 60% of the document
    const startRange = Math.floor(totalPages * 0.2); // Start at 20% point
    const endRange = Math.floor(totalPages * 0.8);   // End at 80% point
    const rangeSize = endRange - startRange;
    const step = Math.max(1, Math.floor(rangeSize / optConfig.maxPagesToTest));

    for (let i = startRange; i <= endRange && pagesToTest.length < optConfig.maxPagesToTest; i += step) {
      if (i > skipInitialPages) {
        pagesToTest.push(i);
      }
    }
  }

  // Ensure we have at least one page to test
  if (pagesToTest.length === 0) {
    pagesToTest.push(Math.max(1, Math.floor(totalPages / 2)));
  }

  // Removed console.log

  // Calculate total iterations for progress tracking
  const verticalSteps = Math.floor((optConfig.verticalRange.max - optConfig.verticalRange.min) / optConfig.verticalRange.step) + 1;
  const horizontalSteps = Math.floor((optConfig.horizontalRange.max - optConfig.horizontalRange.min) / optConfig.horizontalRange.step) + 1;
  const autoLinkSteps = Math.floor((optConfig.autoLinkRange.max - optConfig.autoLinkRange.min) / optConfig.autoLinkRange.step) + 1;
  const totalIterations = verticalSteps * horizontalSteps * autoLinkSteps;
  let currentIteration = 0;

  let bestResult: OptimizationResult = {
    tolerances: currentTolerances,
    score: 0,
    tagCount: 0,
    details: {
      vertical: currentTolerances[Category.Instrument].vertical,
      horizontal: currentTolerances[Category.Instrument].horizontal,
      autoLinkDistance: currentTolerances[Category.Instrument].autoLinkDistance,
      testedPages: pagesToTest,
      tagsByPage: new Map(),
    },
  };

  // Grid search through tolerance combinations
  for (let vertical = optConfig.verticalRange.min;
       vertical <= optConfig.verticalRange.max;
       vertical += optConfig.verticalRange.step) {

    for (let horizontal = optConfig.horizontalRange.min;
         horizontal <= optConfig.horizontalRange.max;
         horizontal += optConfig.horizontalRange.step) {

      for (let autoLink = optConfig.autoLinkRange.min;
           autoLink <= optConfig.autoLinkRange.max;
           autoLink += optConfig.autoLinkRange.step) {

        currentIteration++;
        const progress = (currentIteration / totalIterations) * 100;

        if (onProgress) {
          onProgress(
            progress,
            `테스트 중: 수직:${vertical}px, 수평:${horizontal}px, 링크:${autoLink}px`
          );
        }

        const testTolerances: ToleranceConfig = {
          [Category.Instrument]: {
            vertical,
            horizontal,
            autoLinkDistance: autoLink,
          },
        };

        const { tags, quality } = await testToleranceConfig(
          pdfDoc,
          pagesToTest,
          patterns,
          testTolerances,
          appSettings
        );

        const instrumentTags = tags.filter(t => t.category === Category.Instrument);

        // Track tags by page for this configuration
        const tagsByPage = new Map<number, number>();
        pagesToTest.forEach(page => {
          const pageTagCount = instrumentTags.filter(t => t.page === page).length;
          tagsByPage.set(page, pageTagCount);
        });

        // 테스트 완료

        if (quality > bestResult.score) {
          bestResult = {
            tolerances: testTolerances,
            score: quality,
            tagCount: instrumentTags.length,
            details: {
              vertical,
              horizontal,
              autoLinkDistance: autoLink,
              testedPages: pagesToTest,
              tagsByPage,
            },
          };
        }
      }
    }
  }

  // Log optimization results
  // Removed console.log
  // Removed console.log
  // Removed console.log
  // Removed console.log

  return bestResult;
}

/**
 * Quick optimization using a smart search strategy
 */
export async function quickOptimizeTolerances(
  pdfDoc: any,
  patterns: PatternConfig,
  currentTolerances: ToleranceConfig,
  appSettings: any,
  onProgress?: (progress: number, message: string) => void
): Promise<OptimizationResult> {
  // Start with common good values and search nearby
  const commonGoodValues = [
    { vertical: 15, horizontal: 20, autoLinkDistance: 30 },
    { vertical: 10, horizontal: 15, autoLinkDistance: 25 },
    { vertical: 20, horizontal: 25, autoLinkDistance: 35 },
    { vertical: 12, horizontal: 18, autoLinkDistance: 30 },
  ];

  // Select a representative page from the middle of the document for initial testing
  const totalPages = pdfDoc.numPages;
  let testPage: number;

  if (totalPages <= 3) {
    testPage = Math.min(2, totalPages); // Use page 2 if available, otherwise last page
  } else if (totalPages <= 10) {
    testPage = Math.floor(totalPages / 2); // Use middle page
  } else {
    // For larger documents, pick a page from the middle third
    testPage = Math.floor(totalPages * 0.4); // 40% point, likely past title/legend pages
  }

  // Removed console.log

  // Test representative page with common values to find best starting point
  const firstPageResults = await Promise.all(
    commonGoodValues.map(async (values, index) => {
      if (onProgress) {
        onProgress((index / commonGoodValues.length) * 30, `사전 설정 테스트 ${index + 1}/${commonGoodValues.length}`);
      }

      const testTolerances: ToleranceConfig = {
        [Category.Instrument]: values,
      };

      const { tags, quality } = await testToleranceConfig(
        pdfDoc,
        [testPage],
        patterns,
        testTolerances,
        appSettings
      );

      return { values, quality, tags };
    })
  );

  // Find best starting point
  const bestStarting = firstPageResults.reduce((best, current) =>
    current.quality > best.quality ? current : best
  );

  // Removed console.log

  // Fine-tune around the best starting point
  const finetuneConfig: Partial<OptimizationConfig> = {
    verticalRange: {
      min: Math.max(5, bestStarting.values.vertical - 5),
      max: Math.min(30, bestStarting.values.vertical + 5),
      step: 2,
    },
    horizontalRange: {
      min: Math.max(5, bestStarting.values.horizontal - 5),
      max: Math.min(40, bestStarting.values.horizontal + 5),
      step: 2,
    },
    autoLinkRange: {
      min: Math.max(20, bestStarting.values.autoLinkDistance - 10),
      max: Math.min(50, bestStarting.values.autoLinkDistance + 10),
      step: 5,
    },
    maxPagesToTest: Math.min(3, Math.max(1, pdfDoc.numPages - 3)), // Sample from middle pages
  };

  // Update progress for fine-tuning phase
  if (onProgress) {
    onProgress(30, '파라미터 미세 조정 중...');
  }

  // Run fine-tuning with progress offset
  const wrappedProgress = onProgress ?
    (progress: number, message: string) => onProgress(30 + (progress * 0.7), message) :
    undefined;

  return optimizeTolerances(
    pdfDoc,
    patterns,
    currentTolerances,
    appSettings,
    finetuneConfig,
    wrappedProgress
  );
}