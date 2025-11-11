import { Category } from '../types.ts';
import { DEFAULT_PATTERNS } from '../constants.ts';
import { v4 as uuidv4 } from 'uuid';

// Helper function to remove whitespace from tag text (except for NotesAndHolds)
const removeWhitespace = (text, category, shouldRemoveWhitespace) => {
    if (!shouldRemoveWhitespace || category === Category.NotesAndHolds) {
        return text;
    }
    return text.replace(/\s+/g, '');
};


// Helper function to calculate bounding box with screen coordinate transformation
const calculateBbox = (item, viewBoxOffsetX = 0, viewBoxOffsetY = 0, viewport = null, rotation = 0) => {
    const { transform, width, height } = item;
    const [a, b, , , e, f] = transform;
    const x = e;
    const y = f;
    const angle = Math.atan2(b, a);
    const descent = height * 0.2;
    const localCorners = [
        { x: 0, y: -descent }, { x: width, y: -descent },
        { x: width, y: height }, { x: 0, y: height },
    ];
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const transformedCorners = localCorners.map(p => ({
        x: p.x * cos - p.y * sin + x - viewBoxOffsetX,  // Apply viewBox offset
        y: p.x * sin + p.y * cos + y - viewBoxOffsetY,  // Apply viewBox offset
    }));
    
    const xs = transformedCorners.map(p => p.x);
    const ys = transformedCorners.map(p => p.y);
    const pdfBbox = {
        x1: Math.min(...xs), y1: Math.min(...ys),
        x2: Math.max(...xs), y2: Math.max(...ys),
    };
    
    // Handle different PDF rotations and coordinate system transformations
    if (viewport && rotation === 90) {
        // 90-degree rotation: swap X and Y coordinates with proper flipping
        const viewBox = viewport.viewBox || [0, 0, viewport.width, viewport.height];
        const viewBoxWidth = viewBox[2];
        const viewBoxHeight = viewBox[3];
        
        return {
            x1: pdfBbox.y1,                      // Y becomes X (no flip)
            y1: pdfBbox.x1,                      // X becomes Y (no flip)
            x2: pdfBbox.y2,                      // Y becomes X (no flip)
            y2: pdfBbox.x2,                      // X becomes Y (no flip)
        };
    } else if (viewport && rotation === 270) {
        // 270-degree rotation: Final coordinate transformation
        // Transform: [0, -1, -1, 0, 2880, 2016] shows proper rotation
        // ViewBox: [0, 0, 2016, 2880] - width/height are swapped as expected
        
        // PROBLEM: Many coordinates are negative, meaning our transformation is wrong
        // For 270° rotation (clockwise), we need: original_x -> new_y, original_y -> new_x (with flips)
        // But we need to use ViewBox dimensions, not viewport dimensions
        
        const viewBox = viewport.viewBox || [0, 0, viewport.width, viewport.height];
        const viewBoxWidth = viewBox[2];   // 2016
        const viewBoxHeight = viewBox[3];  // 2880
        
        // Correct 270° rotation using ViewBox dimensions
        return {
            x1: viewBoxHeight - pdfBbox.y2,    // Y becomes X (flipped from viewBox height)
            y1: viewBoxWidth - pdfBbox.x2,     // X becomes Y (flipped from viewBox width)
            x2: viewBoxHeight - pdfBbox.y1,    // Y becomes X (flipped from viewBox height)
            y2: viewBoxWidth - pdfBbox.x1,     // X becomes Y (flipped from viewBox width)
        };
    } else if (viewport && rotation === 180) {
        // 180-degree rotation: flip both X and Y
        const pageWidth = viewport.width;
        const pageHeight = viewport.height;
        return {
            x1: pageWidth - pdfBbox.x2,
            y1: pageHeight - pdfBbox.y2,
            x2: pageWidth - pdfBbox.x1, 
            y2: pageHeight - pdfBbox.y1,
        };
    } else if (viewport) {
        // Non-rotated documents (0 degrees): flip Y coordinates to match screen coordinate system
        // PDF uses bottom-left origin (0,0), screen uses top-left origin (0,0)
        const pageHeight = viewport.height;
        return {
            x1: pdfBbox.x1,
            y1: pageHeight - pdfBbox.y2,  // Flip Y: bottom becomes top
            x2: pdfBbox.x2, 
            y2: pageHeight - pdfBbox.y1,  // Flip Y: top becomes bottom
        };
    }
    
    // Fallback for cases without viewport information
    return pdfBbox;
};

// Get the right-bottom corner coordinates considering PDF rotation
// PDF coordinates: Y=0 is TOP, Y=height is BOTTOM
const getRightBottomCorner = (viewport, rotation) => {
    const { width: pageWidth, height: pageHeight } = viewport;
    
    switch (rotation) {
        case 0:
            // Normal orientation: right-bottom corner is at (pageWidth, pageHeight)
            return { x: pageWidth, y: pageHeight };
        case 90:
            // 90° rotation: right-bottom becomes (0, pageHeight) in transformed coordinates  
            return { x: 0, y: pageHeight };
        case 180:
            // 180° rotation: right-bottom becomes (0, 0) in transformed coordinates
            return { x: 0, y: 0 };
        case 270:
            // 270° rotation: right-bottom becomes (pageHeight, 0) in transformed coordinates
            return { x: pageHeight, y: 0 };
        default:
            // Fallback to normal orientation
            return { x: pageWidth, y: pageHeight };
    }
};

export const extractTags = async (pdfDoc, pageNum, patterns, tolerances, appSettings = { autoRemoveWhitespace: true }) => {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    const rotation = viewport.rotation || 0;
    
    // Get the viewBox offset - some PDFs have non-zero origin
    const viewBoxOffsetX = viewport.viewBox ? viewport.viewBox[0] : 0;
    const viewBoxOffsetY = viewport.viewBox ? viewport.viewBox[1] : 0;
    
    
    const foundTags = [];
    const rawTextItems = [];
    const textItems = textContent.items.filter((item) => 'str' in item && item.str.trim() !== '');
    const consumedIndices = new Set();

    // Debug: Log text items that look like they could be drawing numbers
    
    const drawingNumberLikeItems = textItems.filter(item =>
        item.str.includes('-') && item.str.length > 10
    );
    if (drawingNumberLikeItems.length > 0) {
        
        drawingNumberLikeItems.forEach((item, idx) => {
            
        });
    }
    
    // Pass 1: Combine multi-part instrument tags using tolerances
    if (patterns[Category.Instrument] && patterns[Category.Instrument].func && patterns[Category.Instrument].num) {
        try {
            const funcRegex = new RegExp(`^${patterns[Category.Instrument].func}$`);
            const numRegex = new RegExp(`^${patterns[Category.Instrument].num}$`);
            const instrumentTolerances = tolerances[Category.Instrument];

            const funcCandidates = [];
            const numCandidates = [];

            textItems.forEach((item, index) => {
                if (funcRegex.test(item.str)) {
                    const bbox = calculateBbox(item, viewBoxOffsetX, viewBoxOffsetY, viewport, rotation);
                    funcCandidates.push({ item, index, bbox });
                    if (item.str === "TXT") {
                        const center = { x: (bbox.x1 + bbox.x2) / 2, y: (bbox.y1 + bbox.y2) / 2 };
                    }
                } else if (numRegex.test(item.str)) {
                    const bbox = calculateBbox(item, viewBoxOffsetX, viewBoxOffsetY, viewport, rotation);
                    numCandidates.push({ item, index, bbox });
                    if (item.str === "596B") {
                        const center = { x: (bbox.x1 + bbox.x2) / 2, y: (bbox.y1 + bbox.y2) / 2 };
                    }
                } else if (item.str === "TXT" || item.str === "596B") {
                }
            });

            for (const func of funcCandidates) {
                if (consumedIndices.has(func.index)) continue;

                // Skip FF as it's not an instrument function code
                if (func.item.str.toUpperCase() === 'FF') continue;

                let bestPartner = null;
                let minDistanceSq = Infinity;

                const funcCenter = {
                    x: (func.bbox.x1 + func.bbox.x2) / 2,
                    y: (func.bbox.y1 + func.bbox.y2) / 2,
                };

                if (func.item.str === "TXT") {
                }
                
                for (const num of numCandidates) {
                    if (consumedIndices.has(num.index)) continue;
                    
                    const numCenter = {
                        x: (num.bbox.x1 + num.bbox.x2) / 2,
                        y: (num.bbox.y1 + num.bbox.y2) / 2,
                    };

                    if (func.item.str === "TXT" && num.item.str === "596B") {
                    }

                    // Function part must be strictly above the number part
                    const isAbove = funcCenter.y < numCenter.y;

                    if (func.item.str === "TXT" && num.item.str === "596B") {
                    }

                    if (!isAbove) {
                        if (func.item.str === "TXT" && num.item.str === "596B") {
                        }
                        continue;
                    }

                    const dx = Math.abs(funcCenter.x - numCenter.x);
                    const dy = Math.abs(funcCenter.y - numCenter.y);
                    
                    if (func.item.str === "TXT" && num.item.str === "596B") {
                    }
                    
                    if (dx <= instrumentTolerances.horizontal && dy <= instrumentTolerances.vertical) {
                        const distanceSq = dx * dx + dy * dy;
                        if (func.item.str === "TXT" && num.item.str === "596B") {
                        }
                        if (distanceSq < minDistanceSq) {
                            minDistanceSq = distanceSq;
                            bestPartner = num;
                            if (func.item.str === "TXT" && num.item.str === "596B") {
                            }
                        }
                    } else {
                        if (func.item.str === "TXT" && num.item.str === "596B") {
                        }
                    }
                }

                if (bestPartner) {
                    // Function part should always come first (it's above the number part)
                    // We already verified func is above bestPartner in the matching logic
                    const rawCombinedText = `${func.item.str}-${bestPartner.item.str}`;
                    const combinedText = removeWhitespace(rawCombinedText, Category.Instrument, appSettings.autoRemoveWhitespace);

                    const combinedBbox = {
                        x1: Math.min(func.bbox.x1, bestPartner.bbox.x1),
                        y1: Math.min(func.bbox.y1, bestPartner.bbox.y1),
                        x2: Math.max(func.bbox.x2, bestPartner.bbox.x2),
                        y2: Math.max(func.bbox.y2, bestPartner.bbox.y2),
                    };

                    foundTags.push({
                        id: uuidv4(),
                        text: combinedText,
                        page: pageNum,
                        bbox: combinedBbox,
                        category: Category.Instrument,
                        sourceItems: [
                            {...func.item, id: uuidv4(), bbox: func.bbox, page: pageNum}, 
                            {...bestPartner.item, id: uuidv4(), bbox: bestPartner.bbox, page: pageNum}
                        ]
                    });

                    consumedIndices.add(func.index);
                    consumedIndices.add(bestPartner.index);
                }
            }
        } catch (e) {
        }
    }


    // Pass 2: Process remaining tags with user-defined patterns
    // Ensure we get the Line pattern correctly
    const linePattern = patterns['Line'] || patterns[Category.Line] || DEFAULT_PATTERNS[Category.Line];
    const categoryPatterns = [
        { category: Category.Line, regex: linePattern },
        { category: Category.NotesAndHolds, regex: patterns[Category.NotesAndHolds] },
    ];

    // Debug line pattern matching
    if (!linePattern) {
        // No Line pattern found
    }
    const potentialLines = textItems.filter(item =>
        item.str.includes('"-') && !consumedIndices.has(textItems.indexOf(item))
    );
    if (potentialLines.length > 0) {
        
        potentialLines.slice(0, 5).forEach(item => {
            
        });
    }

    for (let i = 0; i < textItems.length; i++) {
        if (consumedIndices.has(i)) continue;

        const item = textItems[i];
        let itemHasBeenTagged = false;

        for (const pattern of categoryPatterns) {
            if (!pattern.regex) continue; // Skip if regex is empty
            try {
                const globalRegex = new RegExp(pattern.regex, 'gi');
                const matches = item.str.match(globalRegex);

                // Debug line pattern matching
                if (pattern.category === Category.Line && item.str.includes('"-')) {
                    
                    if (matches) {
                        
                    }
                }

                if (matches) {
                    itemHasBeenTagged = true;
                    for (const matchText of matches) {
                        // Skip FF combinations as they're not instrument tags
                        if (matchText.toUpperCase().startsWith('FF')) continue;

                        const cleanedText = removeWhitespace(matchText, pattern.category, appSettings.autoRemoveWhitespace);
                        foundTags.push({
                            id: uuidv4(),
                            text: cleanedText,
                            page: pageNum,
                            bbox: calculateBbox(item, viewBoxOffsetX, viewBoxOffsetY, viewport, rotation),
                            category: pattern.category,
                        });
                    }
                }
            } catch (error) {
            }
        }

        if (itemHasBeenTagged) {
            consumedIndices.add(i);
        }
    }
    
    // Pass 3: Find drawing number (one per page, closest to bottom-right corner)
    const drawingNumberRegexString = patterns[Category.DrawingNumber];
    if (drawingNumberRegexString) {
        try {
            const drawingNumberRegex = new RegExp(drawingNumberRegexString, 'i');
            const rightBottomCorner = getRightBottomCorner(viewport, rotation);

            // === [NEW] 사용자 지정 검색 영역/Sheet No. 옵션 반영 ===
            const area = appSettings?.drawingSearchArea;
            const sheetRegex = new RegExp(appSettings?.sheetNoPattern ?? '^\\d{3}$', 'i');
            const combine = appSettings?.combineDrawingAndSheet ?? true;

            // 좌표 변환 헬퍼
            const toPx = (val: number, unit: 'px' | 'percent', total: number) =>
                unit === 'percent' ? (val / 100) * total : val;

            // 중심점이 검색 박스 안에 있는지 확인
            const isCenterInside = (bbox: {x1:number;y1:number;x2:number;y2:number}, box: {x1:number;y1:number;x2:number;y2:number}) => {
                const cx = (bbox.x1 + bbox.x2) / 2;
                const cy = (bbox.y1 + bbox.y2) / 2;
                // 화면 좌표계(y 아래로 증가) 기준: box.y2 = 상단, box.y1 = 하단
                return cx >= box.x1 && cx <= box.x2 && cy >= box.y2 && cy <= box.y1;
            };

            // bbox 합치기
            const unionBbox = (a: {x1:number;y1:number;x2:number;y2:number}, b?: {x1:number;y1:number;x2:number;y2:number}) => {
                if (!b) return a;
                return {
                    x1: Math.min(a.x1, b.x1),
                    y1: Math.min(a.y1, b.y1),
                    x2: Math.max(a.x2, b.x2),
                    y2: Math.max(a.y2, b.y2),
                };
            };

            // 검색 박스(px) 계산
            let searchBox: {x1:number;y1:number;x2:number;y2:number} | null = null;
            if (area?.enabled) {
                const unit = area.unit ?? 'percent';
                const pageW = viewport.width;
                const pageH = viewport.height;

                const x1 = toPx(area.left   ?? 5,  unit, pageW);
                const x2 = toPx(area.right  ?? 95, unit, pageW);
                const yTop = toPx(area.top    ?? 5,  unit, pageH);
                const yBot = toPx(area.bottom ?? 20, unit, pageH);

                // y2 = 상단, y1 = 하단(화면 좌표계)
                searchBox = { x1, x2, y1: yBot, y2: yTop };
            }

            // === (선택) 디버그: 도면처럼 보이는 긴 대시 문자열들 ===
            const potentialDrawingNumbers = textItems.filter(item =>
                item.str.includes('-') && item.str.length > 10
            );
            if (potentialDrawingNumbers.length > 0) {
                potentialDrawingNumbers.forEach(item => {
                    const _matches = item.str.match(drawingNumberRegex);
                    // console.debug('[DBG] potential DN:', item.str, _matches);
                });
            }

            let bestCandidate: any = null;
            const candidates: any[] = [];

            // 후보 수집
            for (let i = 0; i < textItems.length; i++) {
                if (consumedIndices.has(i)) continue;

                const item = textItems[i];
                const match = item.str.match(drawingNumberRegex);
                if (!match) continue;

                const bbox = calculateBbox(item, viewBoxOffsetX, viewBoxOffsetY, viewport, rotation);

                // [NEW] 검색 박스가 켜져 있으면 박스 내부 항목만 허용
                if (searchBox && !isCenterInside(bbox, searchBox)) {
                    continue;
                }

                // 거리 계산(오른쪽 아래 기준)
                const dx = rightBottomCorner.x - bbox.x2;  // right edge 차이
                let targetY;
                switch (rotation) {
                    case 0:
                    case 90:
                        targetY = Math.max(bbox.y1, bbox.y2); // 화면 하단
                        break;
                    case 180:
                    case 270:
                        targetY = Math.min(bbox.y1, bbox.y2); // 화면 하단(회전 반영)
                        break;
                    default:
                        targetY = Math.max(bbox.y1, bbox.y2);
                        break;
                }
                const dy = rightBottomCorner.y - targetY;
                const distanceSq = dx * dx + dy * dy;

                candidates.push({
                    item,
                    index: i,
                    bbox,
                    text: match[0],
                    distance: Math.sqrt(distanceSq),
                    distanceSq,
                    dx,
                    dy,
                    targetY,
                    isSelected: false
                });
            }

            // 품질 점수 함수(기존 로직 유지)
            const scoreCandidate = (candidate: any) => {
                let score = 0;
                const text = candidate.text;

                if (!text.startsWith('-')) score += 1000;
                if (/^[A-Z0-9]/i.test(text)) score += 500;
                if (/^[0-9]{5}[A-Z]/.test(text)) score += 300;
                if (text.match(/-/g)?.length >= 3) score += 200;
                if (text.length > 15) score += 100;

                score -= Math.sqrt(candidate.distanceSq) * 0.1;
                return score;
            };

            candidates.forEach(c => c.score = scoreCandidate(c));
            const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score);
            // console.debug('[DBG] top DN candidates:', sortedCandidates.slice(0,3));

            if (sortedCandidates.length > 0) {
                bestCandidate = sortedCandidates[0];
            }

            if (bestCandidate) {
                candidates.forEach(c => { c.isSelected = (c.index === bestCandidate.index); });
            
                // === [NEW] 같은 줄 & 오른쪽에서만 Sheet No. 찾기 ===
                // H_TOL: 오른쪽(가로) 허용 거리(px). 사용자가 Settings에서 지정
                const H_TOL = Math.max(0, appSettings?.sheetNoTolerancePx ?? 40);
                // V_OVERLAP: 같은 줄 판정(세로로 50% 이상 겹치면 같은 줄)
                const V_OVERLAP = 0.5;

                const isSameLine = (a, b) => {
                  const h1 = a.y2 - a.y1;
                  const h2 = b.y2 - b.y1;
                  const overlap = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
                  return overlap > Math.min(h1, h2) * V_OVERLAP;
                };

                // 오른쪽 후보만: 같은 줄 + 오른쪽으로 H_TOL 이내
                const rightCandidates = textItems
                  .filter(t => t !== bestCandidate.item)
                  .map(t => ({ t, b: calculateBbox(t, viewBoxOffsetX, viewBoxOffsetY, viewport, rotation) }))
                  .filter(({ b }) => isSameLine(bestCandidate.bbox, b))
                  .map(({ t, b }) => {
                    const s = (t.str || '').trim();
                    if (!sheetRegex.test(s)) return null;
                    const distRight = b.x1 - bestCandidate.bbox.x2;   // 오른쪽이면 양수
                    if (distRight < 0 || distRight > H_TOL) return null;
                    return { item: t, bbox: b, text: s, dist: distRight };
                  })
                  .filter(Boolean)
                  .sort((a, b) => a.dist - b.dist); // 가장 가까운 것 우선

                const sheetItem = rightCandidates.length > 0 ? rightCandidates[0] : null;

                const drawingText = bestCandidate.text.trim();
                let finalText = drawingText;
                const metadata: any = { page: pageNum };

                if (sheetItem) {
                    const sb = sheetItem.bbox; // 이미 bbox 계산됨
                    metadata.sheet = sheetItem.text;
                    if (combine) {
                        finalText = `${drawingText}-${metadata.sheet}`;
                    }

                    foundTags.push({
                        id: uuidv4(),
                        text: finalText,     // 도면-시트 결합(옵션)
                        page: pageNum,
                        bbox: unionBbox(bestCandidate.bbox, sb),
                        category: Category.DrawingNumber,
                        metadata
                    });
                } else {
                    // 시트가 없으면 도면번호만
                    foundTags.push({
                        id: uuidv4(),
                        text: finalText,
                        page: pageNum,
                        bbox: bestCandidate.bbox,
                        category: Category.DrawingNumber,
                        metadata
                    });
                }

                consumedIndices.add(bestCandidate.index);
            }
        } catch (error) {
            // console.error('[DN ERROR]', error);
        }
    }

    // Final Pass: Collect all un-tagged items as raw text
    for (let i = 0; i < textItems.length; i++) {
        if (consumedIndices.has(i)) continue;
        const item = textItems[i];
        const bbox = calculateBbox(item, viewBoxOffsetX, viewBoxOffsetY, viewport, rotation);
        
        
        rawTextItems.push({
            id: uuidv4(),
            text: item.str,
            page: pageNum,
            bbox: bbox,
         });
    }

    // Debug: Summary of tags found
    const lineTags = foundTags.filter(t => t.category === Category.Line);
    const instrumentTags = foundTags.filter(t => t.category === Category.Instrument);
    
    
    if (lineTags.length > 0) {
        
    }
    

    return { tags: foundTags, rawTextItems };
};

// Post-processing function to create OPC relationships across pages
// Function to extract note descriptions from the PDF
// These are typically in the top-right area with format like "1. description text" or "1 description text"
export const extractNoteDescriptions = (rawTextItems: any[], pageNum: number, viewport: any) => {
    // Filter items on the current page
    const pageItems = rawTextItems.filter(item => item.page === pageNum);
    if (pageItems.length === 0) return [];

    // Define the area for finding note STARTS (not continuations)
    const pageWidth = viewport.width;
    const pageHeight = viewport.height;
    const rightAreaStart = pageWidth * 0.45; // Slightly left of center for note starts
    // Note: We don't limit by top area since notes can extend down the page

    // Debug: Log the area being searched
    
    
    

    // Pattern to match note descriptions: "1. text" or "1 text" or "NOTE 1: text"
    // Also matches standalone numbers like "1." or "1:" for multi-line notes
    const notePattern = /^(?:NOTE\s*)?(\d+)[.:)]?\s*(.*)/i;

    // Sort ALL page items by Y position, then by X position for consistent ordering
    const allSortedItems = [...pageItems].sort((a, b) => {
        const yDiff = a.bbox.y1 - b.bbox.y1;
        if (Math.abs(yDiff) < 5) {
            // If items are on roughly the same line (within 5px), sort by X
            return a.bbox.x1 - b.bbox.x1;
        }
        return yDiff;
    });

    // IMPROVED TWO-PASS APPROACH
    // Pass 1: Find all numbered note starts IN THE RIGHT AREA ONLY
    const noteStarts = [];
    for (let i = 0; i < allSortedItems.length; i++) {
        const item = allSortedItems[i];
        const itemText = item.text.trim();
        const match = itemText.match(notePattern);

        // Only consider items in the right area as note starts
        if (match && item.bbox.x1 >= rightAreaStart) {
            const noteNumber = parseInt(match[1], 10);
            const initialText = match[2] ? match[2].trim() : '';

            noteStarts.push({
                number: noteNumber,
                initialText: initialText,
                startItem: item,
                startIndex: i,
                items: [item],
                text: initialText
            });

            
        }
    }

    if (noteStarts.length === 0) {
        
        return [];
    }

    

    // Pass 2: Collect ALL text between notes, being VERY inclusive
    const noteDescriptions = [];
    const maxVerticalGap = 200; // Increased for better multi-paragraph support
    const minXPosition = pageWidth * 0.3; // More lenient X boundary for continuation text

    for (let noteIdx = 0; noteIdx < noteStarts.length; noteIdx++) {
        const currentNoteStart = noteStarts[noteIdx];
        const nextNoteStart = noteStarts[noteIdx + 1] || null;

        // Determine the Y-range for this note
        const noteStartY = currentNoteStart.startItem.bbox.y1;
        const noteEndY = nextNoteStart ? nextNoteStart.startItem.bbox.y1 : pageHeight;

        

        // Collect all text items within this note's Y range
        const noteItems = [currentNoteStart.startItem];
        let noteText = currentNoteStart.initialText;
        let lastItemBottom = currentNoteStart.startItem.bbox.y2;

        // Look at ALL items after the note start
        for (let i = currentNoteStart.startIndex + 1; i < allSortedItems.length; i++) {
            const item = allSortedItems[i];

            // Stop if we've reached the next note's Y position
            if (item.bbox.y1 >= noteEndY) {
                
                break;
            }

            const itemText = item.text.trim();

            // Skip empty items
            if (!itemText) continue;

            // Skip if this is another note start
            if (notePattern.test(itemText) && item.bbox.x1 >= rightAreaStart) {
                
                break;
            }

            // Calculate vertical gap from last included item
            // Use a negative gap tolerance for overlapping or very close lines
            const verticalGap = Math.max(0, item.bbox.y1 - lastItemBottom);

            // INCLUSIVE CONDITIONS:
            // Include if:
            // 1. Item is within the note's Y range (already checked above)
            // 2. X position is reasonable (not too far left)
            // 3. Vertical gap is not excessive OR item overlaps with previous
            const isXPositionReasonable = item.bbox.x1 >= minXPosition;
            const isVerticalGapReasonable = verticalGap <= maxVerticalGap || item.bbox.y1 < lastItemBottom + 20;

            if (isXPositionReasonable && isVerticalGapReasonable) {
                // Add this text to the current note
                if (noteText.length > 0) {
                    noteText += ' ' + itemText;
                } else {
                    noteText = itemText;
                }
                noteItems.push(item);
                lastItemBottom = Math.max(lastItemBottom, item.bbox.y2);

                
            } else {
                // Log why we're skipping this item
                if (!isXPositionReasonable) {
                    
                } else if (!isVerticalGapReasonable) {
                    
                    // Don't continue if gap is too large
                    if (verticalGap > maxVerticalGap * 1.5) break;
                }
            }
        }

        // Create the final note description
        const noteBbox = {
            x1: Math.min(...noteItems.map(it => it.bbox.x1)),
            y1: Math.min(...noteItems.map(it => it.bbox.y1)),
            x2: Math.max(...noteItems.map(it => it.bbox.x2)),
            y2: Math.max(...noteItems.map(it => it.bbox.y2))
        };

        noteDescriptions.push({
            number: currentNoteStart.number,
            text: noteText,
            items: noteItems,
            bbox: noteBbox,
            page: pageNum
        });

        
    }

    
    noteDescriptions.forEach(note => {
        const lineCount = note.items ? note.items.length : 1;
        const preview = note.text.substring(0, 80);
        
    });

    // Debug logging for troubleshooting
    if (noteDescriptions.length > 0) {
        const totalLines = noteDescriptions.reduce((sum, note) => sum + (note.items ? note.items.length : 1), 0);
        const avgLines = (totalLines / noteDescriptions.length).toFixed(1);
        
    }

    return noteDescriptions;
};
