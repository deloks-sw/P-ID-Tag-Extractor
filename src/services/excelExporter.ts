import { Category, RelationshipType } from '../types.ts';
import * as XLSX from 'xlsx';

// Helper function to calculate Euclidean distance between two tags
const calculateDistance = (tag1, tag2) => {
  // Calculate center points for each tag
  const center1X = (tag1.bbox.x1 + tag1.bbox.x2) / 2;
  const center1Y = (tag1.bbox.y1 + tag1.bbox.y2) / 2;
  const center2X = (tag2.bbox.x1 + tag2.bbox.x2) / 2;
  const center2Y = (tag2.bbox.y1 + tag2.bbox.y2) / 2;

  // Calculate Euclidean distance
  const dx = center2X - center1X;
  const dy = center2Y - center1Y;
  return Math.sqrt(dx * dx + dy * dy);
};

// Helper function to find the closest line tag for an instrument tag
const findClosestLineTag = (instrumentTag, lineTags) => {
  if (!instrumentTag || !lineTags || lineTags.length === 0) {
    return null;
  }

  // Filter line tags to same page
  const samePageLineTags = lineTags.filter(lineTag => lineTag.page === instrumentTag.page);
  if (samePageLineTags.length === 0) {
    return null;
  }

  // Find the closest line tag by distance
  let closestLineTag = null;
  let minDistance = Infinity;

  samePageLineTags.forEach(lineTag => {
    const distance = calculateDistance(instrumentTag, lineTag);
    if (distance < minDistance) {
      minDistance = distance;
      closestLineTag = lineTag;
    }
  });

  return closestLineTag;
};

// Helper function to extract loop number from instrument tag
const extractLoopNumber = (tagText, customLoopRules = {}) => {
  // Pattern: [Function Letters]-[Numbers][Optional Letter]
  // Examples: TT-205 → T-205, FIC-301A → F-301, PE-101 → P-101
  const match = tagText.match(/^([A-Z]+)[- ]?(\d+)/i);
  if (match) {
    const functionCode = match[1].toUpperCase();
    // Exclude FF as it's not an instrument tag
    if (functionCode === 'FF') return '';

    // Check if there's a custom rule for this function code
    let loopPrefix;
    if (customLoopRules[functionCode]) {
      loopPrefix = customLoopRules[functionCode];
    } else {
      // Default rule: use first letter of function code
      loopPrefix = functionCode[0];
    }

    const number = match[2];             // Number portion only
    return `${loopPrefix}-${number}`;
  }
  return '';
};

// Helper function to determine instrument type from tag
const getInstrumentType = (tagText, customMappings = {}) => {
  const match = tagText.match(/^([A-Z]+)[- ]?(\d+)/i);
  if (!match) return '';

  const functionCode = match[1].toUpperCase();

  // Exclude FF as it's not an instrument tag
  if (functionCode === 'FF') return '';

  // Only use custom mappings from settings
  if (customMappings[functionCode]) {
    return customMappings[functionCode].instrumentType;
  }

  // Return empty string if no custom mapping exists
  return '';
};

// Helper function to determine I/O type from instrument
const getIOType = (tagText, customMappings = {}) => {
  const match = tagText.match(/^([A-Z]+)[- ]?(\d+)/i);
  if (!match) return '';

  const functionCode = match[1].toUpperCase();

  // Exclude FF as it's not an instrument tag
  if (functionCode === 'FF') return '';

  // Only use custom mappings from settings
  if (customMappings[functionCode]) {
    return customMappings[functionCode].ioType;
  }

  // Return empty string if no custom mapping exists
  return '';
};

export const exportToExcel = (tags, relationships, rawTextItems, descriptions = [], equipmentShortSpecs = [], loops = [], comments = [], detectedLines = [], includeNoteDescriptions = false, instrumentMappings = {}, loopRules = {}) => {
  

  const instruments = tags.filter(t => t.category === Category.Instrument);
  const drawingNumbers = tags.filter(t => t.category === Category.DrawingNumber);
  const noteHoldTags = tags.filter(t => t.category === Category.NotesAndHolds);
  const lineTags = tags.filter(t => t.category === Category.Line);

  // Debug: Check for Annotation relationships
  const annotationRelationships = relationships.filter(r => r.type === RelationshipType.Annotation);
  

  // Debug: Check NOTE tags
  const noteTags = noteHoldTags.filter(t => t.text.includes('NOTE'));
  

  // Debug: Sample first few annotation relationships
  if (annotationRelationships.length > 0) {
    
    annotationRelationships.slice(0, 3).forEach(rel => {
      const fromTag = tags.find(t => t.id === rel.from);
      const toItem = rawTextItems.find(item => item.id === rel.to);
      
    });
  }

  // Create a map for quick lookup of drawing number by page
  const pageToDrawingNumberMap = new Map(drawingNumbers.map(tag => [tag.page, tag.text]));

  // Create a map for note relationships (instrument -> note tags)
  const instrumentToNoteMap = new Map();

  // Create a map for note descriptions (note tag -> description text from right side)
  const noteTagToDescriptionMap = new Map();

  // Build note description map from Annotation relationships
  // These are created by the noteDescriptionOptimizer when it links NOTE tags to right-side text
  if (includeNoteDescriptions) {
    
    

    let processedCount = 0;
    relationships
      .filter(r => r.type === RelationshipType.Annotation)
      .forEach(rel => {
        processedCount++;
        const noteTag = noteHoldTags.find(t => t.id === rel.from);
        const descriptionItem = rawTextItems.find(item => item.id === rel.to);

        if (!noteTag) {
          
        }
        if (!descriptionItem) {
          
        }

        if (noteTag && descriptionItem) {
          // If there are multiple description items for same note, concatenate them
          const existingDesc = noteTagToDescriptionMap.get(noteTag.id) || '';
          const newDesc = existingDesc ? existingDesc + ' ' + descriptionItem.text : descriptionItem.text;
          noteTagToDescriptionMap.set(noteTag.id, newDesc);
          
        }
      });

    // Debug logging
    if (noteTagToDescriptionMap.size > 0) {
      
      noteTagToDescriptionMap.forEach((desc, noteId) => {
        const note = noteHoldTags.find(t => t.id === noteId);
        if (note) {
          const preview = desc.length > 60 ? desc.substring(0, 60) + '...' : desc;
          
        }
      });
    } else {
      
    }
  }

  // Process Note relationships to build the mapping
  let notesWithDescriptions = 0;
  relationships
    .filter(r => r.type === RelationshipType.Note)
    .forEach(rel => {
      const fromTag = tags.find(t => t.id === rel.from);
      const toTag = noteHoldTags.find(t => t.id === rel.to);

      if (fromTag && fromTag.category === Category.Instrument && toTag) {
        if (!instrumentToNoteMap.has(fromTag.id)) {
          instrumentToNoteMap.set(fromTag.id, []);
        }
        // Extract just the note text part (remove the NOTE number prefix)
        // toTag.text is like "NOTE 1" or "NOTE 2", we want just the description
        let noteText = '';
        if (includeNoteDescriptions) {
          const description = noteTagToDescriptionMap.get(toTag.id);
          if (description) {
            noteText = description;
            notesWithDescriptions++;
          } else {
            // If no description, just show the note tag text without NOTE prefix
            noteText = toTag.text.replace(/^NOTE\s*\d+\s*:?\s*/i, '').trim();
            if (!noteText) {
              noteText = toTag.text; // Fallback to original if nothing left after removal
            }
          }
        } else {
          // Remove NOTE prefix from the tag text
          noteText = toTag.text.replace(/^NOTE\s*\d+\s*:?\s*/i, '').trim();
          if (!noteText) {
            noteText = toTag.text; // Fallback to original if nothing left after removal
          }
        }
        if (noteText) {
          instrumentToNoteMap.get(fromTag.id).push(noteText);
        }
      }
    });

  if (includeNoteDescriptions) {
    
  }

  // Create a map for line associations (instrument -> line number)
  // Find the closest line tag for each instrument tag
  const instrumentToLineNumberMap = new Map();

  
  instruments.forEach(instrument => {
    const closestLineTag = findClosestLineTag(instrument, lineTags);
    if (closestLineTag) {
      instrumentToLineNumberMap.set(instrument.id, closestLineTag.text);
    }
  });
  

  // Note: Description relationships are for user-created manual descriptions
  // They are handled separately and not included in the NOTE column
  // The NOTE column shows the NOTE tag text plus any right-side descriptions from Annotation relationships

  // Manual descriptions are handled in a separate Description worksheet


  // Consolidated Instrument List Data
  // This is the primary export view with automatic loop number extraction
  const consolidatedInstrumentData = instruments
    .sort((a, b) => {
      // Sort by: 1. Page, 2. Loop Number, 3. Tag Text
      if (a.page !== b.page) return a.page - b.page;
      const loopA = extractLoopNumber(a.text, loopRules);
      const loopB = extractLoopNumber(b.text, loopRules);
      if (loopA !== loopB) return loopA.localeCompare(loopB);
      return a.text.localeCompare(b.text);
    })
    .map((tag, index) => {
      const drawingNumber = pageToDrawingNumberMap.get(tag.page) || '';
      const loopNumber = extractLoopNumber(tag.text, loopRules);


      const instrumentType = getInstrumentType(tag.text, instrumentMappings);
      const ioType = getIOType(tag.text, instrumentMappings);

      // Get the closest line number for this instrument
      const lineNumber = instrumentToLineNumberMap.get(tag.id) || '';

      // Get notes connected to this instrument
      const connectedNotes = instrumentToNoteMap.get(tag.id) || [];

      // The connectedNotes array already contains the full note text with descriptions
      // Format is either "NOTE X" or "NOTE X: description text..." if descriptions are included
      const noteContent = connectedNotes.join('; ');

      return {
        'No.': index + 1,                    // Sequential number
        'P&ID Number': drawingNumber,        // Drawing number for the page
        'Loop Number': loopNumber,           // Extracted loop (e.g., T-205 from TT-205)
        'Tag Number': tag.text,              // Original instrument tag
        'Line Number': lineNumber,           // Associated line number (via graphics detection)
        'Instrument Type': instrumentType,   // Rule-based instrument type
        'I/O Type': ioType,                  // AI/AO/DI/DO/Local based on instrument type
        'NOTE': noteContent,                 // Note descriptions extracted from top-right area
        // Future columns (to be implemented):
        // 'System': '',                      // Rule-based system identification
      };
    });


  const wb = XLSX.utils.book_new();

  // Main Instrument List sheet
  const wsConsolidated = XLSX.utils.json_to_sheet(consolidatedInstrumentData);
  XLSX.utils.book_append_sheet(wb, wsConsolidated, 'Instrument List');


  // Detected Lines sheet (if provided - for debugging purposes)
  if (detectedLines && detectedLines.length > 0) {
    const detectedLinesData = detectedLines.map((line, index) => ({
      'No.': index + 1,
      'Line ID': line.id || '',
      'Start X': line.start ? Math.round(line.start.x) : '',
      'Start Y': line.start ? Math.round(line.start.y) : '',
      'End X': line.end ? Math.round(line.end.x) : '',
      'End Y': line.end ? Math.round(line.end.y) : '',
      'Type': line.type || 'straight',
      'Page': line.page || 1,
      'Source': line.source || 'unknown',
      'Length': line.start && line.end ?
        Math.round(Math.sqrt(
          Math.pow(line.end.x - line.start.x, 2) +
          Math.pow(line.end.y - line.start.y, 2)
        )) : ''
    }));

    const wsDetectedLines = XLSX.utils.json_to_sheet(detectedLinesData);
    XLSX.utils.book_append_sheet(wb, wsDetectedLines, 'Detected Lines');
  }

  XLSX.writeFile(wb, 'P&ID_Instrument_List.xlsx');
};