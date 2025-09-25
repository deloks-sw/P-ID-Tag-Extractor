import { Category, Tag, Relationship, RelationshipType, Description } from '../types';
import { extractNoteDescriptions } from './taggingService';
import { v4 as uuidv4 } from 'uuid';

interface NoteConnectionResult {
  distance: number;
  score: number;
  connectionCount: number;
  details: {
    testedPages: number[];
    connectionsByPage: Map<number, number>;
    avgProximity: number;
    coverageRate: number;
  };
}

interface NoteOptimizationConfig {
  distanceRange: { min: number; max: number; step: number };
  maxPagesToTest: number;
  minConfidenceScore: number;
}

const DEFAULT_OPTIMIZATION_CONFIG: NoteOptimizationConfig = {
  distanceRange: { min: 30, max: 150, step: 10 },
  maxPagesToTest: 3,
  minConfidenceScore: 0.7,
};

/**
 * 노트 연결 품질 점수 계산
 * 점수가 높을수록 더 나은 연결 품질
 */
function calculateConnectionQuality(
  connections: Array<{ instrument: Tag; note: Tag; distance: number }>,
  allInstrumentTags: Tag[],
  allNoteTags: Tag[]
): number {
  if (connections.length === 0) return 0;

  // 1. 연결 수 점수 (많을수록 좋지만 수익 감소)
  const countScore = Math.log(connections.length + 1) * 15;

  // 2. 근접성 점수 (평균 거리가 짧을수록 좋음)
  const avgDistance = connections.reduce((sum, c) => sum + c.distance, 0) / connections.length;
  const proximityScore = Math.max(0, 30 - (avgDistance / 10));

  // 3. 커버리지 점수 (노트 태그 중 연결된 비율)
  const connectedNotes = new Set(connections.map(c => c.note.id));
  const notesCoverage = connectedNotes.size / Math.max(1, allNoteTags.length);
  const coverageScore = notesCoverage * 30;

  // 4. 분포 점수 (여러 페이지에 걸쳐 연결이 있으면 좋음)
  const pagesWithConnections = new Set(connections.map(c => c.instrument.page)).size;
  const distributionScore = Math.min(pagesWithConnections * 8, 25);

  // 5. 단일 연결 보너스 점수 (각 노트가 정확히 하나의 계기와 연결되면 보너스)
  // 1:1 매핑이므로 모든 노트는 최대 1개의 계기와만 연결됨
  const uniqueConnectionScore = 25; // 항상 최대 점수 (1:1 연결 보장)

  return countScore + proximityScore + coverageScore + distributionScore + uniqueConnectionScore;
}

/**
 * Calculate average text box size for NOTE tags
 */
function calculateAverageNoteBoxSize(noteTags: Tag[]): { width: number; height: number; diagonal: number } {
  if (noteTags.length === 0) {
    return { width: 30, height: 15, diagonal: 33.5 }; // Default fallback
  }

  let totalWidth = 0;
  let totalHeight = 0;

  for (const tag of noteTags) {
    const width = tag.bbox.x2 - tag.bbox.x1;
    const height = tag.bbox.y2 - tag.bbox.y1;
    totalWidth += width;
    totalHeight += height;
  }

  const avgWidth = totalWidth / noteTags.length;
  const avgHeight = totalHeight / noteTags.length;
  const avgDiagonal = Math.sqrt(avgWidth * avgWidth + avgHeight * avgHeight);

  return { width: avgWidth, height: avgHeight, diagonal: avgDiagonal };
}

/**
 * 특정 거리 설정으로 노트 연결 테스트
 */
async function testNoteConnection(
  instrumentTags: Tag[],
  noteTags: Tag[],
  maxDistanceMultiplier: number,
  pageNumbers: number[]
): Promise<{ connections: Array<{ instrument: Tag; note: Tag; distance: number }>, quality: number }> {
  const connections: Array<{ instrument: Tag; note: Tag; distance: number }> = [];

  // 노트 타입 감지 함수
  const detectNoteHoldType = (tagText: string): 'Note' | 'Hold' | null => {
    const lowerText = tagText.toLowerCase();
    if (lowerText.includes('note')) return 'Note';
    if (lowerText.includes('hold')) return 'Hold';
    return null;
  };

  // 각 페이지에서 노트와 계기 연결 테스트
  for (const pageNum of pageNumbers) {
    const pageInstruments = instrumentTags.filter(t => t.page === pageNum);
    const pageNotes = noteTags.filter(t => t.page === pageNum && detectNoteHoldType(t.text) === 'Note');

    // 각 노트 태그에 대해 가장 가까운 계기 하나만 연결
    for (const noteTag of pageNotes) {
      let closestInstrument: { instrument: Tag; distance: number } | null = null;

      // Calculate max distance based on NOTE tag's box size (typically 6x the diagonal)
      const noteWidth = noteTag.bbox.x2 - noteTag.bbox.x1;
      const noteHeight = noteTag.bbox.y2 - noteTag.bbox.y1;
      const noteDiagonal = Math.sqrt(noteWidth * noteWidth + noteHeight * noteHeight);
      const maxDistance = noteDiagonal * maxDistanceMultiplier;

      for (const instrument of pageInstruments) {
        // 거리 계산
        const dx = Math.abs((instrument.bbox.x1 + instrument.bbox.x2) / 2 - (noteTag.bbox.x1 + noteTag.bbox.x2) / 2);
        const dy = Math.abs((instrument.bbox.y1 + instrument.bbox.y2) / 2 - (noteTag.bbox.y1 + noteTag.bbox.y2) / 2);
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= maxDistance) {
          // 가장 가까운 계기만 추적
          if (!closestInstrument || distance < closestInstrument.distance) {
            closestInstrument = { instrument, distance };
          }
        }
      }

      // 가장 가까운 계기가 있으면 연결 추가 (없으면 연결하지 않음)
      if (closestInstrument) {
        connections.push({
          instrument: closestInstrument.instrument,
          note: noteTag,
          distance: closestInstrument.distance
        });
      }
      // If no instrument is within max distance, the NOTE remains unconnected
    }
  }

  const quality = calculateConnectionQuality(connections, instrumentTags, noteTags);
  return { connections, quality };
}

/**
 * 노트<->계기 연결을 위한 거리 매개변수 자동 최적화
 */
export async function optimizeNoteConnections(
  instrumentTags: Tag[],
  noteTags: Tag[],
  pdfDoc: any,
  config: Partial<NoteOptimizationConfig> = {},
  onProgress?: (progress: number, message: string) => void
): Promise<NoteConnectionResult> {
  const optConfig = { ...DEFAULT_OPTIMIZATION_CONFIG, ...config };

  // Calculate average NOTE box size for reference
  const avgNoteBoxSize = calculateAverageNoteBoxSize(noteTags);
  

  // 테스트할 페이지 선택 (중간 섹션)
  const totalPages = pdfDoc.numPages;
  const pagesToTest: number[] = [];

  // 제목/범례 페이지를 건너뛰고 중간 섹션 선택
  const skipInitialPages = totalPages > 5 ? 3 : 1;

  if (totalPages <= 3) {
    for (let i = 1; i <= totalPages; i++) {
      pagesToTest.push(i);
    }
  } else if (totalPages <= 10) {
    const midPoint = Math.floor(totalPages / 2);
    pagesToTest.push(midPoint);
    if (midPoint - 1 >= skipInitialPages) pagesToTest.push(midPoint - 1);
    if (midPoint + 1 <= totalPages) pagesToTest.push(midPoint + 1);
    pagesToTest.sort((a, b) => a - b);
  } else {
    const startRange = Math.floor(totalPages * 0.2);
    const endRange = Math.floor(totalPages * 0.8);
    const rangeSize = endRange - startRange;
    const step = Math.max(1, Math.floor(rangeSize / optConfig.maxPagesToTest));

    for (let i = startRange; i <= endRange && pagesToTest.length < optConfig.maxPagesToTest; i += step) {
      if (i > skipInitialPages) {
        pagesToTest.push(i);
      }
    }
  }

  if (pagesToTest.length === 0) {
    pagesToTest.push(Math.max(1, Math.floor(totalPages / 2)));
  }

  

  // Test different multipliers (3x to 8x the box diagonal)
  const multipliers = [3, 4, 5, 6, 7, 8];
  let currentIteration = 0;

  let bestResult: NoteConnectionResult = {
    distance: avgNoteBoxSize.diagonal * 6, // Default to 6x
    score: 0,
    connectionCount: 0,
    details: {
      testedPages: pagesToTest,
      connectionsByPage: new Map(),
      avgProximity: 0,
      coverageRate: 0,
    },
  };

  // 각 거리 배수 테스트
  for (const multiplier of multipliers) {
    currentIteration++;
    const progress = (currentIteration / multipliers.length) * 100;

    if (onProgress) {
      onProgress(
        progress,
        `테스트 중: 박스 크기 ${multiplier}배 거리`
      );
    }

    const { connections, quality } = await testNoteConnection(
      instrumentTags,
      noteTags,
      multiplier,
      pagesToTest
    );

    // 페이지별 연결 수 추적
    const connectionsByPage = new Map<number, number>();
    pagesToTest.forEach(page => {
      const pageConnections = connections.filter(c => c.instrument.page === page).length;
      connectionsByPage.set(page, pageConnections);
    });

    // 평균 근접성 계산
    const avgProximity = connections.length > 0 ?
      connections.reduce((sum, c) => sum + c.distance, 0) / connections.length : 0;

    // 커버리지 비율 계산
    const connectedNotes = new Set(connections.map(c => c.note.id));
    const relevantNotes = noteTags.filter(t => pagesToTest.includes(t.page));
    const coverageRate = relevantNotes.length > 0 ? connectedNotes.size / relevantNotes.length : 0;

    const effectiveDistance = avgNoteBoxSize.diagonal * multiplier;

    // 테스트 완료 - 배수, 연결 감지, 품질 점수

    if (quality > bestResult.score) {
      bestResult = {
        distance: effectiveDistance,
        score: quality,
        connectionCount: connections.length,
        details: {
          testedPages: pagesToTest,
          connectionsByPage,
          avgProximity,
          coverageRate,
        },
      };
    }
  }

  const bestMultiplier = Math.round(bestResult.distance / avgNoteBoxSize.diagonal);

  // 최적화 결과 로깅
  
  
  
  
  
  

  return bestResult;
}

/**
 * 빠른 최적화 (일반적인 좋은 값들로 시작)
 */
export async function quickOptimizeNoteConnections(
  instrumentTags: Tag[],
  noteTags: Tag[],
  pdfDoc: any,
  onProgress?: (progress: number, message: string) => void
): Promise<NoteConnectionResult> {
  // Test common good multipliers (4x, 5x, 6x the box size)
  const quickTestMultipliers = [4, 5, 6];

  // Calculate average NOTE box size
  const avgNoteBoxSize = calculateAverageNoteBoxSize(noteTags);

  // 대표 페이지 선택
  const totalPages = pdfDoc.numPages;
  let testPage: number;

  if (totalPages <= 3) {
    testPage = Math.min(2, totalPages);
  } else if (totalPages <= 10) {
    testPage = Math.floor(totalPages / 2);
  } else {
    testPage = Math.floor(totalPages * 0.4);
  }

  
  

  // 대표 배수들로 초기 테스트
  const initialResults = await Promise.all(
    quickTestMultipliers.map(async (multiplier, index) => {
      if (onProgress) {
        onProgress((index / quickTestMultipliers.length) * 100, `박스 크기 ${multiplier}배 테스트 중...`);
      }

      const { connections, quality } = await testNoteConnection(
        instrumentTags.filter(t => t.page === testPage),
        noteTags.filter(t => t.page === testPage),
        multiplier,
        [testPage]
      );

      const effectiveDistance = avgNoteBoxSize.diagonal * multiplier;
      return { distance: effectiveDistance, quality, connections, multiplier };
    })
  );

  // 최적 시작점 찾기
  const bestStarting = initialResults.reduce((best, current) =>
    current.quality > best.quality ? current : best
  );

  

  // 최적 결과 반환
  const connectionsByPage = new Map<number, number>();
  connectionsByPage.set(testPage, bestStarting.connections.length);

  const avgProximity = bestStarting.connections.length > 0 ?
    bestStarting.connections.reduce((sum, c) => sum + c.distance, 0) / bestStarting.connections.length : 0;

  const connectedNoteIds = new Set(bestStarting.connections.map(c => c.note.id));
  const pageNotes = noteTags.filter(t => t.page === testPage && t.text.toLowerCase().includes('note'));
  const coverageRate = pageNotes.length > 0 ? connectedNoteIds.size / pageNotes.length : 0;

  return {
    distance: bestStarting.distance,
    score: bestStarting.quality,
    connectionCount: bestStarting.connections.length,
    details: {
      testedPages: [testPage],
      connectionsByPage,
      avgProximity,
      coverageRate: coverageRate * 100,
    },
  };
}

/**
 * 최적화된 거리로 실제 노트 연결 생성
 */
export function createOptimizedNoteConnections(
  instrumentTags: Tag[],
  noteTags: Tag[],
  maxDistance: number  // Not used anymore, kept for compatibility
): Relationship[] {
  const relationships: Relationship[] = [];
  const existingKeys = new Set<string>();

  // 노트 타입 감지 함수
  const detectNoteHoldType = (tagText: string): 'Note' | 'Hold' | null => {
    const lowerText = tagText.toLowerCase();
    if (lowerText.includes('note')) return 'Note';
    if (lowerText.includes('hold')) return 'Hold';
    return null;
  };

  // 모든 페이지에서 노트와 계기 연결 (1:1 매핑)
  const noteTagsFiltered = noteTags.filter(t => detectNoteHoldType(t.text) === 'Note');

  // Helper function: Check if a circle intersects with a rectangle
  const circleIntersectsRectangle = (circleCenter: { x: number; y: number }, radius: number, rect: any) => {
    // Find the closest point on the rectangle to the circle center
    const closestX = Math.max(rect.x1, Math.min(circleCenter.x, rect.x2));
    const closestY = Math.max(rect.y1, Math.min(circleCenter.y, rect.y2));

    // Calculate distance from circle center to closest point
    const distX = circleCenter.x - closestX;
    const distY = circleCenter.y - closestY;
    const distance = Math.sqrt(distX * distX + distY * distY);

    return { intersects: distance <= radius, distance };
  };

  // NEW ALGORITHM: Use instrument's diagonal radius to determine connections
  for (const instrument of instrumentTags) {
    // Calculate center of instrument bbox
    const instrumentCenter = {
      x: (instrument.bbox.x1 + instrument.bbox.x2) / 2,
      y: (instrument.bbox.y1 + instrument.bbox.y2) / 2
    };

    // Calculate diagonal radius of instrument bbox (3x for better range)
    const width = instrument.bbox.x2 - instrument.bbox.x1;
    const height = instrument.bbox.y2 - instrument.bbox.y1;
    const diagonalRadius = Math.sqrt(width * width + height * height) / 2 * 3;

    // Find NOTE tags on the same page
    const pageNoteTags = noteTagsFiltered.filter(tag => tag.page === instrument.page);
    let closestNote: { noteTag: Tag; distance: number } | null = null;

    for (const noteTag of pageNoteTags) {
      // Check if the instrument's circle intersects with the NOTE tag's bbox
      const { intersects, distance } = circleIntersectsRectangle(
        instrumentCenter,
        diagonalRadius,
        noteTag.bbox
      );

      if (intersects) {
        // Track the closest NOTE within the circle
        if (!closestNote || distance < closestNote.distance) {
          closestNote = { noteTag, distance };
        }
      }
    }

    // Connect to the closest NOTE tag within the circle (if any)
    if (closestNote) {
      const relationshipKey = `${instrument.id}-${closestNote.noteTag.id}`;
      if (!existingKeys.has(relationshipKey)) {
        relationships.push({
          id: uuidv4(),
          from: instrument.id,
          to: closestNote.noteTag.id,
          type: RelationshipType.Note
        });
        existingKeys.add(relationshipKey);
        
      }
    }
  }

  return relationships;
}