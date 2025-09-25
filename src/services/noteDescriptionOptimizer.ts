import { Tag, RawTextItem, Relationship, RelationshipType, Category } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface NoteDescriptionPattern {
  // Pattern for detecting numbered notes (e.g., "1.", "2.", etc.)
  numberPattern: RegExp;
  // Pattern for standalone numbers
  standaloneNumberPattern: RegExp;
  // Minimum X coordinate for right-side notes (as percentage of page width)
  minXPosition: number;
  // Maximum X distance variation for aligned notes
  alignmentTolerance: number;
  // Minimum number of aligned notes to consider a valid pattern
  minAlignedNotes: number;
  // Maximum Y distance between consecutive notes
  maxYGap: number;
  // Maximum horizontal distance to associate text with number
  maxHorizontalGap: number;
  // Maximum vertical distance for multi-line grouping
  maxLineGap: number;
}

interface NoteDescriptionResult {
  pattern: NoteDescriptionPattern;
  score: number;
  detectedNotes: Array<{
    number: string;
    text: string;
    bbox: { x1: number; y1: number; x2: number; y2: number };
    page: number;
    items?: RawTextItem[]; // Optional array of items for multi-line notes
  }>;
  alignmentGroups: Map<number, Array<RawTextItem>>; // Grouped by alignment position
}

interface OptimizationConfig {
  xPositionRange: { min: number; max: number; step: number };
  alignmentToleranceRange: { min: number; max: number; step: number };
  maxYGapRange: { min: number; max: number; step: number };
  samplesToTest: number;
  minConfidenceScore: number;
}

const DEFAULT_PATTERN: NoteDescriptionPattern = {
  numberPattern: /^(\d+)\s*[-.]?\s*(.*)$/,
  standaloneNumberPattern: /^(\d+)\s*[-.]?\s*$/,
  minXPosition: 0.35, // Start looking from 35% of page width (more inclusive)
  alignmentTolerance: 60, // 60px tolerance for alignment (more lenient for indented text)
  minAlignedNotes: 1, // Allow even single notes to be detected
  maxYGap: 400, // Increased for multi-paragraph notes with spacing
  maxHorizontalGap: 250, // Max distance between number and text (increased for wrapped lines)
  maxLineGap: 60, // Increased for better multi-line detection with paragraph breaks
};

const DEFAULT_OPTIMIZATION_CONFIG: OptimizationConfig = {
  xPositionRange: { min: 0.5, max: 0.8, step: 0.05 },
  alignmentToleranceRange: { min: 5, max: 30, step: 5 },
  maxYGapRange: { min: 50, max: 200, step: 25 },
  samplesToTest: 5,
  minConfidenceScore: 0.6,
};

/**
 * Group text items that form multi-line descriptions
 */
function groupMultiLineText(
  textItems: RawTextItem[],
  maxLineGap: number
): Array<{ items: RawTextItem[]; text: string; bbox: any }> {
  if (textItems.length === 0) return [];

  // Sort by vertical position
  const sorted = [...textItems].sort((a, b) => a.bbox.y1 - b.bbox.y1);
  const groups: Array<{ items: RawTextItem[]; text: string; bbox: any }> = [];

  let currentGroup: RawTextItem[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevItem = sorted[i - 1];
    const currItem = sorted[i];

    // Check if vertically adjacent
    const verticalGap = currItem.bbox.y1 - prevItem.bbox.y2;

    if (verticalGap <= maxLineGap) {
      currentGroup.push(currItem);
    } else {
      // Save current group and start new one
      if (currentGroup.length > 0) {
        const text = currentGroup.map(item => item.text).join(' ');
        const bbox = {
          x1: Math.min(...currentGroup.map(item => item.bbox.x1)),
          y1: Math.min(...currentGroup.map(item => item.bbox.y1)),
          x2: Math.max(...currentGroup.map(item => item.bbox.x2)),
          y2: Math.max(...currentGroup.map(item => item.bbox.y2))
        };
        groups.push({ items: currentGroup, text, bbox });
      }
      currentGroup = [currItem];
    }
  }

  // Save last group
  if (currentGroup.length > 0) {
    const text = currentGroup.map(item => item.text).join(' ');
    const bbox = {
      x1: Math.min(...currentGroup.map(item => item.bbox.x1)),
      y1: Math.min(...currentGroup.map(item => item.bbox.y1)),
      x2: Math.max(...currentGroup.map(item => item.bbox.x2)),
      y2: Math.max(...currentGroup.map(item => item.bbox.y2))
    };
    groups.push({ items: currentGroup, text, bbox });
  }

  return groups;
}

/**
 * Detect numbered note descriptions on a page
 *
 * Key principle: Any text between note N and note N+1 belongs to note N
 * Example:
 *   1. First note text
 *   continuation of first note    <- belongs to note 1
 *   more text here               <- belongs to note 1
 *   2. Second note text          <- starts note 2
 */
function detectNoteDescriptions(
  rawTextItems: RawTextItem[],
  pattern: NoteDescriptionPattern,
  pageWidth: number
): Array<{ number: string; text: string; bbox: any; items: RawTextItem[] }> {
  const notes: Array<{ number: string; text: string; bbox: any; items: RawTextItem[] }> = [];
  const minX = pageWidth * pattern.minXPosition;
  const processedItems = new Set<RawTextItem>();

  // Sort ALL items by Y position first
  // We'll filter by position later, but need all items to catch continuation lines
  const allItemsSorted = [...rawTextItems].sort((a, b) => a.bbox.y1 - b.bbox.y1);

  // Items that could be note STARTS (on the right side)
  const rightSideItems = allItemsSorted.filter(item => item.bbox.x1 >= minX);

  
  
  

  // Find all numbered note starts (from right-side items only)
  const noteStarts: { item: RawTextItem; number: string; index: number }[] = [];

  for (let i = 0; i < rightSideItems.length; i++) {
    const item = rightSideItems[i];

    // Check for various number patterns at the start of a line
    // Matches: "1 -", "1.", "1)", "(1)", "1", etc.
    const match = item.text.match(/^[\(\[]?(\d+)[\)\]]?\s*[-.:]?\s*(.*)$/);

    if (match) {
      const number = match[1];
      const remainingText = match[2];

      // Consider it a note start if:
      // 1. There's a separator (-, ., :) after the number
      // 2. It's just a number (possibly followed by text will be on next line)
      // 3. The number is in parentheses or brackets
      const hasSeparator = item.text.match(/^[\(\[]?\d+[\)\]]?\s*[-.:]/)
;
      const isStandaloneNumber = remainingText.trim().length === 0;
      const hasParentheses = item.text.match(/^[\(\[]?\d+[\)\]]/);

      if (hasSeparator || isStandaloneNumber || hasParentheses) {
        // Find the index in the allItemsSorted array (not rightSideItems)
        const globalIndex = allItemsSorted.findIndex(x => x === item);
        noteStarts.push({ item, number, index: globalIndex });
        
      }
    }
  }

  // Process each numbered note and collect all lines until the next note
  for (let noteIdx = 0; noteIdx < noteStarts.length; noteIdx++) {
    const currentNote = noteStarts[noteIdx];
    const nextNoteIndex = noteIdx < noteStarts.length - 1 ? noteStarts[noteIdx + 1].index : allItemsSorted.length;
    const nextNote = noteIdx < noteStarts.length - 1 ? noteStarts[noteIdx + 1] : null;

    
    
    
    if (nextNote) {
      
      
    } else {
      
    }

    const noteItems: RawTextItem[] = [currentNote.item];
    processedItems.add(currentNote.item);

    // Get initial text from the numbered line
    const initialMatch = currentNote.item.text.match(/^[\(\[]?\d+[\)\]]?\s*[-.:]?\s*(.*)$/);
    let noteText = initialMatch && initialMatch[1] && initialMatch[1].trim() ? initialMatch[1].trim() : '';

    // If the number is standalone (no text after it), the actual note text likely starts on the next line
    const isStandaloneNumber = noteText.length === 0;
    if (isStandaloneNumber) {
      
    }

    // IMPORTANT: Track the x-coordinate boundaries of the first line of text
    // This will constrain subsequent lines to stay within this horizontal range
    let firstLineXMin = currentNote.item.bbox.x1;
    let firstLineXMax = currentNote.item.bbox.x2;
    let firstTextLineFound = !isStandaloneNumber; // If note has text, we already have the first line

    // Collect all lines between this note and the next (or end)
    let consecutiveEmptyGaps = 0;
    const maxConsecutiveEmptyGaps = 3; // Allow up to 3 empty line gaps for multi-paragraph notes

    for (let i = currentNote.index + 1; i < nextNoteIndex; i++) {
      const item = allItemsSorted[i];

      // Skip if already processed
      if (processedItems.has(item)) continue;

      // Check vertical distance from previous item
      const prevItem = noteItems[noteItems.length - 1];
      const verticalGap = item.bbox.y1 - prevItem.bbox.y2;

      // IMPORTANT: Text between two numbered notes ALWAYS belongs to the preceding note
      // Only stop if we've exceeded the maximum vertical gap
      if (verticalGap > pattern.maxYGap) {
        
        break;
      }

      // Since we're between two notes, we should be more inclusive
      // The fact that this text appears BEFORE the next numbered note means it belongs to current note
      const isBeforeNextNote = i < nextNoteIndex;

      // If this is the first text line after a standalone number, capture its boundaries
      if (!firstTextLineFound && item.text.trim().length > 0) {
        firstLineXMin = Math.min(firstLineXMin, item.bbox.x1);
        firstLineXMax = Math.max(firstLineXMax, item.bbox.x2);
        firstTextLineFound = true;
        
      }

      // STRICT X-COORDINATE CHECK: Only include text within the first line's x-range
      // This prevents unrelated text from being included in multi-line notes
      const isWithinXBounds = firstTextLineFound ?
        (item.bbox.x1 >= firstLineXMin - 10 && item.bbox.x1 <= firstLineXMax + 10) : // Small tolerance of 10px
        true; // Until we find the first text line, don't restrict by x-bounds

      // Special case: text on same line as number but to the right
      const isSameLine = Math.abs(item.bbox.y1 - currentNote.item.bbox.y1) < 5 &&
                        item.bbox.x1 > currentNote.item.bbox.x2;

      // For standalone numbers, be more aggressive about collecting the first line
      const isFirstLineAfterNumber = isStandaloneNumber && noteText.length === 0 && i === currentNote.index + 1;

      // Check if this looks like a section header that should NOT be included
      const looksLikeHeader = item.text.match(/^[A-Z]{4,}[:\s]/) || // All caps header (4+ chars)
                              item.text.match(/^FIGURE\s+\d+/i) || // Figure reference
                              item.text.match(/^TABLE\s+\d+/i); // Table reference

      // KEY PRINCIPLE: Any text between two numbered notes belongs to the preceding note
      // We only exclude obvious headers and respect maximum gaps

      // Should we include this line?
      let shouldInclude = false;
      let reason = "";

      if (looksLikeHeader) {
        // Skip headers but continue looking
        
        continue;
      }

      // PRIMARY RULE: Text between two numbered notes belongs to the preceding note
      // BUT ONLY if it's within the x-coordinate bounds of the first line
      if (isBeforeNextNote && !looksLikeHeader && isWithinXBounds) {
        // Check if this line starts with a number (might be a mis-identified note start)
        const startsWithNumber = item.text.match(/^[\(\[]?\d+[\)\]]?\s*[-.:]?\s/);
        const isLastNote = !nextNote;  // Check if this is the last note

        // Check if text is roughly in the note area
        const isInGeneralNoteArea = item.bbox.x1 >= minX * 0.3;  // Only exclude far-left text

        if (!startsWithNumber) {
          // NON-NUMBERED text between notes should be included IF within x-bounds
          // This is critical for catching continuation lines while avoiding unrelated text
          shouldInclude = true;
          reason = isLastNote ? "after last note (within x-bounds)" : "between notes (within x-bounds)";

          // Only exclude if it's clearly unrelated (e.g., way off to the left side of page)
          if (item.bbox.x1 < minX * 0.2 && item.bbox.x1 < currentNote.item.bbox.x1 - 400) {
            shouldInclude = false;
            
          }
        } else {
          // Even numbered text between notes usually belongs to the current note
          // BUT ONLY if it's within x-bounds
          if (item.bbox.x1 >= minX * 0.5 && isWithinXBounds) {  // Must be within x-bounds
            shouldInclude = true;
            reason = isLastNote ? "after last note (within x-bounds)" : "between notes (within x-bounds)";
          }
        }
      }

      // Special cases that override the above - but still respect x-bounds after first line
      if (isSameLine) {
        shouldInclude = true;
        reason = "same line as note number";
      } else if (isFirstLineAfterNumber) {
        shouldInclude = true;
        reason = "first line after standalone number";
      } else if (!isWithinXBounds && firstTextLineFound) {
        // If we've found the first text line and this is outside x-bounds, exclude it
        shouldInclude = false;
        reason = "outside x-bounds of first line";
        
        
      }

      if (shouldInclude) {
        // Check for large gaps (but don't stop, just track them)
        // Be more tolerant of spacing in multi-line notes
        if (verticalGap > pattern.maxLineGap * 2.5 && !isSameLine && !isFirstLineAfterNumber) {
          consecutiveEmptyGaps++;
          if (consecutiveEmptyGaps > maxConsecutiveEmptyGaps) {
            
            break;
          }
        } else {
          consecutiveEmptyGaps = 0;
        }

        // Include this line
        noteItems.push(item);
        processedItems.add(item);

        // Add text with proper spacing
        if (noteText) noteText += ' ';
        noteText += item.text.trim();

        
        
      } else {
        // Only stop collection if the gap is truly excessive
        if (verticalGap > pattern.maxLineGap * 4) {
          
          break;
        }
        // Log why this item was skipped (should be rare now)
        if (!isBeforeNextNote) {
          
        } else if (looksLikeHeader) {
          // Already logged above
        } else {
          
          
          
        }
      }
      // Otherwise, continue looking for more lines
    }

    // Create the note entry if we have text
    if (noteText || noteItems.length > 1) {
      const combinedBbox = {
        x1: Math.min(...noteItems.map(i => i.bbox.x1)),
        y1: Math.min(...noteItems.map(i => i.bbox.y1)),
        x2: Math.max(...noteItems.map(i => i.bbox.x2)),
        y2: Math.max(...noteItems.map(i => i.bbox.y2))
      };

      notes.push({
        number: currentNote.number,
        text: noteText,
        bbox: combinedBbox,
        items: noteItems
      });

      const preview = noteText.length > 80 ? noteText.substring(0, 80) + '...' : noteText;
      
    } else {
      
    }
  }

  // Also try to catch inline patterns (number and text in same item)
  for (const item of rightSideItems) {
    if (processedItems.has(item)) continue;

    // Match various inline patterns:
    // "3. CONNECTION USED..."
    // "3) CONNECTION USED..."
    // "(3) CONNECTION USED..."
    // "3 - CONNECTION USED..."
    // "3: CONNECTION USED..."
    const inlineMatch = item.text.match(/^[\(\[]?(\d+)[\)\]]?\s*[-.:]?\s+(.+)$/);
    if (inlineMatch && inlineMatch[2].length > 3) { // Lowered threshold from 5 to 3
      processedItems.add(item);

      // Check if this number already exists in notes
      const existingNote = notes.find(n => n.number === inlineMatch[1]);
      if (!existingNote) {
        notes.push({
          number: inlineMatch[1],
          text: inlineMatch[2],
          bbox: item.bbox,
          items: [item]
        });
        
      }
    }
  }

  
  return notes;
}

/**
 * Find aligned groups of text items (same x-coordinate within tolerance)
 */
function findAlignmentGroups(
  items: Array<{ bbox: any; [key: string]: any }>,
  tolerance: number
): Map<number, typeof items> {
  const groups = new Map<number, typeof items>();

  for (const item of items) {
    const x = item.bbox.x1;
    let foundGroup = false;

    // Check existing groups
    for (const [groupX, groupItems] of groups.entries()) {
      if (Math.abs(x - groupX) <= tolerance) {
        groupItems.push(item);
        foundGroup = true;
        break;
      }
    }

    // Create new group if not found
    if (!foundGroup) {
      groups.set(x, [item]);
    }
  }

  return groups;
}

/**
 * Calculate quality score for detected note pattern
 */
function calculatePatternScore(
  detectedNotes: Array<{ number: string; text: string; bbox: any }>,
  alignmentGroups: Map<number, any[]>,
  pattern: NoteDescriptionPattern
): number {
  if (detectedNotes.length === 0) return 0;

  // 1. Number of notes detected
  const countScore = Math.min(detectedNotes.length * 10, 30);

  // 2. Alignment quality (how many notes are aligned)
  const largestGroup = Math.max(...Array.from(alignmentGroups.values()).map(g => g.length));
  const alignmentScore = (largestGroup / Math.max(1, detectedNotes.length)) * 30;

  // 3. Consecutive numbering bonus
  const numbers = detectedNotes.map(n => parseInt(n.number)).sort((a, b) => a - b);
  let consecutiveCount = 0;
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] === numbers[i - 1] + 1) consecutiveCount++;
  }
  const consecutiveScore = (consecutiveCount / Math.max(1, numbers.length - 1)) * 20;

  // 4. Vertical spacing consistency
  const sortedNotes = [...detectedNotes].sort((a, b) => a.bbox.y1 - b.bbox.y1);
  const gaps: number[] = [];
  for (let i = 1; i < sortedNotes.length; i++) {
    gaps.push(sortedNotes[i].bbox.y1 - sortedNotes[i - 1].bbox.y2);
  }

  let spacingScore = 0;
  if (gaps.length > 0) {
    const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const variance = gaps.reduce((sum, gap) => sum + Math.pow(gap - avgGap, 2), 0) / gaps.length;
    const stdDev = Math.sqrt(variance);
    spacingScore = Math.max(0, 20 - (stdDev / avgGap) * 20);
  }

  return countScore + alignmentScore + consecutiveScore + spacingScore;
}

/**
 * Test note detection with specific parameters
 */
async function testNotePattern(
  rawTextItems: RawTextItem[],
  pattern: NoteDescriptionPattern,
  pageWidth: number,
  pageNumbers: number[]
): Promise<{ notes: any[], score: number, alignmentGroups: Map<number, any[]> }> {
  const allNotes: any[] = [];
  const allAlignmentGroups = new Map<number, any[]>();

  for (const pageNum of pageNumbers) {
    const pageItems = rawTextItems.filter(item => item.page === pageNum);
    const detectedNotes = detectNoteDescriptions(pageItems, pattern, pageWidth);

    if (detectedNotes.length > 0) {
      const alignmentGroups = findAlignmentGroups(detectedNotes, pattern.alignmentTolerance);

      // Add all detected notes regardless of alignment group size
      allNotes.push(...detectedNotes.map(note => ({
        ...note,
        page: pageNum
      })));

      // Merge alignment groups
      for (const [x, items] of alignmentGroups.entries()) {
        const existing = Array.from(allAlignmentGroups.keys()).find(
          existingX => Math.abs(existingX - x) <= pattern.alignmentTolerance
        );

        if (existing !== undefined) {
          allAlignmentGroups.get(existing)!.push(...items);
        } else {
          allAlignmentGroups.set(x, items);
        }
      }
    }
  }

  const score = calculatePatternScore(allNotes, allAlignmentGroups, pattern);
  return { notes: allNotes, score, alignmentGroups: allAlignmentGroups };
}

/**
 * Optimize note description detection parameters
 */
export async function optimizeNoteDescriptionDetection(
  rawTextItems: RawTextItem[],
  pdfDoc: any,
  config: Partial<OptimizationConfig> = {},
  onProgress?: (progress: number, message: string) => void
): Promise<NoteDescriptionResult> {
  const optConfig = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };

  // Get page dimensions (assume all pages have same width)
  const firstPage = await pdfDoc.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });
  const pageWidth = viewport.width;

  // Select sample pages for testing
  const totalPages = pdfDoc.numPages;
  const pagesToTest: number[] = [];

  // Select middle section pages, avoiding title/legend pages
  const skipInitial = Math.min(3, Math.floor(totalPages * 0.1));
  const skipFinal = Math.min(2, Math.floor(totalPages * 0.05));

  for (let i = 0; i < optConfig.samplesToTest && i < totalPages - skipInitial - skipFinal; i++) {
    const pageIndex = skipInitial + Math.floor(i * (totalPages - skipInitial - skipFinal) / optConfig.samplesToTest);
    pagesToTest.push(Math.min(pageIndex + 1, totalPages));
  }

  

  let bestResult: NoteDescriptionResult = {
    pattern: DEFAULT_PATTERN,
    score: 0,
    detectedNotes: [],
    alignmentGroups: new Map()
  };

  const totalIterations =
    ((optConfig.xPositionRange.max - optConfig.xPositionRange.min) / optConfig.xPositionRange.step + 1) *
    ((optConfig.alignmentToleranceRange.max - optConfig.alignmentToleranceRange.min) / optConfig.alignmentToleranceRange.step + 1) *
    ((optConfig.maxYGapRange.max - optConfig.maxYGapRange.min) / optConfig.maxYGapRange.step + 1);

  let currentIteration = 0;

  // Test different parameter combinations
  for (let xPos = optConfig.xPositionRange.min; xPos <= optConfig.xPositionRange.max; xPos += optConfig.xPositionRange.step) {
    for (let alignTol = optConfig.alignmentToleranceRange.min; alignTol <= optConfig.alignmentToleranceRange.max; alignTol += optConfig.alignmentToleranceRange.step) {
      for (let yGap = optConfig.maxYGapRange.min; yGap <= optConfig.maxYGapRange.max; yGap += optConfig.maxYGapRange.step) {
        currentIteration++;
        const progress = (currentIteration / totalIterations) * 100;

        if (onProgress) {
          onProgress(progress, `테스트 중: X위치 ${(xPos * 100).toFixed(0)}%, 정렬 허용치 ${alignTol}px, Y간격 ${yGap}px`);
        }

        const testPattern: NoteDescriptionPattern = {
          ...DEFAULT_PATTERN,
          minXPosition: xPos,
          alignmentTolerance: alignTol,
          maxYGap: yGap,
          maxHorizontalGap: 100 + alignTol, // Adjust horizontal gap based on alignment tolerance
          maxLineGap: Math.min(yGap / 4, 35) // Line gap proportional to Y gap
        };

        const { notes, score, alignmentGroups } = await testNotePattern(
          rawTextItems,
          testPattern,
          pageWidth,
          pagesToTest
        );

        const avgLinesPerNote = notes.length > 0 ?
          notes.reduce((sum, n: any) => sum + (n.items ? n.items.length : 1), 0) / notes.length : 0;

        // 패턴 테스트 - 노트 감지, 점수

        if (score > bestResult.score) {
          bestResult = {
            pattern: testPattern,
            score,
            detectedNotes: notes.map(n => ({
              number: n.number,
              text: n.text,
              bbox: n.bbox,
              page: n.page
            })),
            alignmentGroups
          };
        }
      }
    }
  }

  const avgLinesPerNote = bestResult.detectedNotes.length > 0 ?
    bestResult.detectedNotes.reduce((sum, n: any) => sum + (n.items ? n.items.length : 1), 0) / bestResult.detectedNotes.length : 0;
  const multiLineNotes = bestResult.detectedNotes.filter((n: any) => n.items && n.items.length > 1).length;

  
  
  
  

  return bestResult;
}

/**
 * Create relationships between NOTE tags and their descriptions
 */
export function linkNoteDescriptions(
  noteTags: Tag[],
  rawTextItems: RawTextItem[],
  pattern: NoteDescriptionPattern,
  pageWidth: number
): { relationships: Relationship[], noteDescriptions: Map<string, string> } {
  const relationships: Relationship[] = [];
  const noteDescriptions = new Map<string, string>();

  // Group NOTE tags by page
  const noteTagsByPage = new Map<number, Tag[]>();
  for (const tag of noteTags) {
    if (tag.text.toUpperCase().includes('NOTE')) {
      const page = noteTagsByPage.get(tag.page) || [];
      page.push(tag);
      noteTagsByPage.set(tag.page, page);
    }
  }

  // Process each page
  for (const [page, pageTags] of noteTagsByPage.entries()) {
    const pageItems = rawTextItems.filter(item => item.page === page);
    const detectedNotes = detectNoteDescriptions(pageItems, pattern, pageWidth);

    

    // Match NOTE tags with descriptions
    for (const tag of pageTags) {
      // Extract note number from tag (e.g., "NOTE 4" or "NOTE4" or "NOTE1" -> "4", "4", "1")
      const noteMatch = tag.text.match(/NOTE\s*(\d+)/i);

      // If the tag doesn't have a number, check if it's a generic NOTE tag that should link to ALL descriptions
      if (!noteMatch) {
        

        // Special case: if there's only one NOTE tag and multiple descriptions, link them all
        if (pageTags.length === 1 && detectedNotes.length > 0) {
          

          for (const description of detectedNotes) {
            // Create relationships to all text items in the description
            for (const item of description.items) {
              relationships.push({
                id: uuidv4(),
                from: tag.id,
                to: item.id,
                type: RelationshipType.Annotation
              });
            }

            // Store all descriptions concatenated
            const existingDesc = noteDescriptions.get(tag.id) || '';
            const newDesc = existingDesc ? existingDesc + '\n' + description.text : description.text;
            noteDescriptions.set(tag.id, newDesc);
          }

          const totalItems = detectedNotes.reduce((sum, desc) => sum + desc.items.length, 0);
          
        }
        continue;
      }

      const noteNumber = noteMatch[1];
      

      // Find corresponding description
      const description = detectedNotes.find(desc => desc.number === noteNumber);
      

      if (description && description.items.length > 0) {
        

        // Create relationships to all text items in the description
        for (const item of description.items) {
          relationships.push({
            id: uuidv4(),
            from: tag.id,
            to: item.id,
            type: RelationshipType.Annotation
          });
        }

        // Store description text
        noteDescriptions.set(tag.id, description.text);

        const preview = description.text.length > 60 ?
          description.text.substring(0, 60) + '...' : description.text;
        
      } else {
        
      }
    }
  }

  

  return { relationships, noteDescriptions };
}

/**
 * Quick optimization using common patterns
 */
export async function quickOptimizeNoteDescriptions(
  rawTextItems: RawTextItem[],
  pdfDoc: any,
  onProgress?: (progress: number, message: string) => void
): Promise<NoteDescriptionResult> {
  // Common good starting values for note descriptions - increased tolerances for better multi-line detection
  const quickPatterns = [
    { minXPosition: 0.45, alignmentTolerance: 40, maxYGap: 300, maxHorizontalGap: 200, maxLineGap: 50 },
    { minXPosition: 0.50, alignmentTolerance: 35, maxYGap: 280, maxHorizontalGap: 180, maxLineGap: 45 },
    { minXPosition: 0.40, alignmentTolerance: 45, maxYGap: 350, maxHorizontalGap: 220, maxLineGap: 55 },
    { minXPosition: 0.55, alignmentTolerance: 30, maxYGap: 250, maxHorizontalGap: 150, maxLineGap: 40 },
    { minXPosition: 0.35, alignmentTolerance: 50, maxYGap: 400, maxHorizontalGap: 250, maxLineGap: 60 },
  ];

  const firstPage = await pdfDoc.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });
  const pageWidth = viewport.width;

  // Test on multiple representative pages for better coverage
  const totalPages = pdfDoc.numPages;
  const pagesToTest: number[] = [];

  // Test at least 3-5 pages throughout the document
  const numTestPages = Math.min(5, Math.max(3, Math.floor(totalPages * 0.3)));
  const skipInitial = Math.min(2, Math.floor(totalPages * 0.1));

  for (let i = 0; i < numTestPages; i++) {
    const pageIndex = skipInitial + Math.floor(i * (totalPages - skipInitial) / numTestPages);
    pagesToTest.push(Math.min(pageIndex + 1, totalPages));
  }

  

  let bestResult: NoteDescriptionResult = {
    pattern: DEFAULT_PATTERN,
    score: 0,
    detectedNotes: [],
    alignmentGroups: new Map()
  };

  for (let i = 0; i < quickPatterns.length; i++) {
    if (onProgress) {
      onProgress((i / quickPatterns.length) * 100, `빠른 테스트 ${i + 1}/${quickPatterns.length}`);
    }

    const testPattern: NoteDescriptionPattern = {
      ...DEFAULT_PATTERN,
      ...quickPatterns[i]
    };

    const { notes, score, alignmentGroups } = await testNotePattern(
      rawTextItems,
      testPattern,
      pageWidth,
      pagesToTest
    );

    if (score > bestResult.score) {
      bestResult = {
        pattern: testPattern,
        score,
        detectedNotes: notes.map(n => ({
          number: n.number,
          text: n.text,
          bbox: n.bbox,
          page: n.page
        })),
        alignmentGroups
      };
    }
  }

  return bestResult;
}