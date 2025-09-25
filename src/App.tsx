import React, { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import * as pdfjsLib from 'pdfjs-dist';
import { PdfUpload } from './components/PdfUpload.tsx';
import { Workspace } from './components/Workspace.tsx';
import { Header } from './components/Header.tsx';
import { SettingsModal } from './components/SettingsModal.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import { extractTags, extractNoteDescriptions } from './services/taggingService.ts';
import { quickOptimizeNoteConnections, createOptimizedNoteConnections } from './services/noteConnectionOptimizer.ts';
import { quickOptimizeNoteDescriptions, linkNoteDescriptions } from './services/noteDescriptionOptimizer.ts';
import { quickOptimizeTolerances } from './services/toleranceOptimizer.ts';
// Line association imports are loaded dynamically
import { DEFAULT_PATTERNS, DEFAULT_TOLERANCES, DEFAULT_SETTINGS, DEFAULT_COLORS } from './constants.ts';
import {
  Category,
  RelationshipType,
  CategoryType,
  Tag,
  RawTextItem,
  Relationship,
  Description,
  Loop,
  ConfirmModalProps,
  ProcessingProgress,
  ProjectData,
  PatternConfig,
  ToleranceConfig,
  AppSettings,
  ViewMode,
  ManualTagData,
  VisibilitySettings,
  ColorSettings
} from './types.ts';

// Set PDF.js worker source - use local worker to avoid CORS issues
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('/pdf.worker.min.mjs', import.meta.url).href;

const ConfirmModal: React.FC<ConfirmModalProps> = ({ isOpen, message, onConfirm, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div 
        className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-fade-in-up" 
        style={{ animationDuration: '0.2s' }}
        onClick={onCancel}
    >
      <div 
        className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-md text-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-lg font-bold mb-2 text-gray-900">Confirm Action</h3>
          <div className="text-gray-700 whitespace-pre-line">{message}</div>
        </div>
        <div className="p-4 bg-gray-50 rounded-b-xl border-t border-gray-200 flex justify-end items-center space-x-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-gray-600 bg-transparent rounded-md hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-white"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};


const App: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null); // TODO: Add proper PDF.js type
  const [tags, setTags] = useState<Tag[]>([]);
  const [rawTextItems, setRawTextItems] = useState<RawTextItem[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [descriptions, setDescriptions] = useState<Description[]>([]);
  const [loops, setLoops] = useState<Loop[]>([]);
  const [detectedLines] = useState<any[]>([]); // Store detected line segments
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [progress, setProgress] = useState<ProcessingProgress>({ current: 0, total: 0 });
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [optimizationProgress, setOptimizationProgress] = useState<{ percent: number; message: string }>({ percent: 0, message: '' });
  const [autoOptimizeEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('pid-tagger-auto-optimize');
    // Default to true if no saved preference
    return saved !== null ? saved === 'true' : true;
  });
  const [autoOptimizeNoteConnectionsEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('pid-tagger-auto-optimize-notes');
    // Default to true if no saved preference
    return saved !== null ? saved === 'true' : true;
  });
  const [confirmation, setConfirmation] = useState<{
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
  }>({ isOpen: false, message: '', onConfirm: () => {} });

  // State lifted from viewer/workspace for toolbar
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.5);
  const [mode, setMode] = useState<ViewMode>('select');
  const [relationshipStartTag, setRelationshipStartTag] = useState<Tag | null>(null);
  // Replace simple boolean with comprehensive visibility settings
  const [visibilitySettings, setVisibilitySettings] = useState<VisibilitySettings>({
    tags: {
      line: true,
      instrument: true,
      drawingNumber: true,
      notesAndHolds: true,
    },
    descriptions: true,
    relationships: {
      connection: true,
      installation: true,
      annotation: false,
      note: false,
    },
  });
  
  // Keep backward compatibility - derive showRelationships from relationships settings
  const showRelationships = Object.values(visibilitySettings.relationships).some(Boolean);

  // Function to toggle all relationship visibility
  const setShowRelationships = useCallback((show: boolean) => {
    setVisibilitySettings(prev => ({
      ...prev,
      relationships: {
        connection: show,
        installation: show,
        annotation: show,
        note: show,
      }
    }));
  }, []);

  const [isSidePanelVisible, setIsSidePanelVisible] = useState<boolean>(true);
  const [showAutoLinkRanges, setShowAutoLinkRanges] = useState<boolean>(false);
  
  // Performance optimization settings
  const [showAllRelationships, setShowAllRelationships] = useState<boolean>(() => {
    const saved = localStorage.getItem('pid-tagger-showAllRelationships');
    return saved === 'false' ? false : true; // Default to true for backward compatibility
  });
  const [showOnlySelectedRelationships, setShowOnlySelectedRelationships] = useState<boolean>(() => {
    const saved = localStorage.getItem('pid-tagger-showOnlySelectedRelationships');
    return saved === 'true' ? true : false; // Default to false
  });

  
  const [patterns, setPatterns] = useState<PatternConfig>(() => {
    try {
      const savedPatterns = localStorage.getItem('pid-tagger-patterns');

      // If no saved patterns, return defaults
      if (!savedPatterns) {
        return DEFAULT_PATTERNS;
      }

      let parsed = JSON.parse(savedPatterns);

      // FIX: Ensure Line pattern exists with the correct key
      // The Category.Line is 'Line', not '라인'
      if (!parsed['Line']) {
        // Try to migrate from old Korean key
        if (parsed['라인']) {
          parsed['Line'] = parsed['라인'];
          delete parsed['라인'];
        } else {
          // Use default Line pattern if missing
          parsed['Line'] = DEFAULT_PATTERNS.Line || DEFAULT_PATTERNS[Category.Line];
        }
        // Update localStorage with corrected patterns
        localStorage.setItem('pid-tagger-patterns', JSON.stringify(parsed));
      }
      
      // Migration and validation logic
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          // Ensure all default categories exist, adding any that are missing
          let updated = false;
          for (const key in DEFAULT_PATTERNS) {
              if (!parsed.hasOwnProperty(key)) {
                  parsed[key] = DEFAULT_PATTERNS[key];
                  updated = true;
              }
          }
           // Migration for Instrument pattern from string to object
          if (typeof parsed[Category.Instrument] === 'string') {
              const pattern = parsed[Category.Instrument];
              const separator = '\\s?';
              const separatorIndex = pattern.indexOf(separator);
              if (separatorIndex > -1) {
                  parsed[Category.Instrument] = {
                      func: pattern.substring(0, separatorIndex),
                      num: pattern.substring(separatorIndex + separator.length),
                  };
              } else {
                  parsed[Category.Instrument] = { func: pattern, num: '' };
              }
              updated = true;
          }
          if (updated) {
              localStorage.setItem('pid-tagger-patterns', JSON.stringify(parsed));
          }
          return parsed;
      }
      
      // If format is completely wrong, return defaults
      return DEFAULT_PATTERNS; 
    } catch (error) {
      return DEFAULT_PATTERNS;
    }
  });

    const [tolerances, setTolerances] = useState<ToleranceConfig>(() => {
        try {
            const saved = localStorage.getItem('pid-tagger-tolerances');
            let parsed = saved ? JSON.parse(saved) : DEFAULT_TOLERANCES;

            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                if (!parsed[Category.Instrument]) {
                    parsed[Category.Instrument] = { ...DEFAULT_TOLERANCES[Category.Instrument] };
                } else {
                    if (!parsed[Category.Instrument].hasOwnProperty('autoLinkDistance')) {
                        parsed[Category.Instrument].autoLinkDistance = DEFAULT_TOLERANCES[Category.Instrument].autoLinkDistance;
                    }
                }
                return parsed;
            }
            return DEFAULT_TOLERANCES;
        } catch (error) {
            return DEFAULT_TOLERANCES;
        }
    });

  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('pid-tagger-app-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to ensure all properties exist (for backward compatibility)
        // Always force autoGenerateLoops and autoRemoveWhitespace to true
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          autoGenerateLoops: true,  // Always enabled
          autoRemoveWhitespace: true,  // Always enabled
          hyphenSettings: {
            ...DEFAULT_SETTINGS.hyphenSettings,
            ...(parsed.hyphenSettings || {})
          },
          loopRules: {
            ...DEFAULT_SETTINGS.loopRules,
            ...(parsed.loopRules || {})
          },
          instrumentMappings: {
            ...DEFAULT_SETTINGS.instrumentMappings,
            ...(parsed.instrumentMappings || {})
          }
        };
      }
      return DEFAULT_SETTINGS;
    } catch (error) {
      return DEFAULT_SETTINGS;
    }
  });

  const [colorSettings, setColorSettings] = useState<ColorSettings>(() => {
    try {
      const saved = localStorage.getItem('pid-tagger-color-settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        
        // Migration from old structure to new structure
        if (parsed.tags && !parsed.entities) {
          return {
            entities: {
              ...parsed.tags,
              description: parsed.relationships?.description || DEFAULT_COLORS.entities.description,
            },
            relationships: {
              connection: parsed.relationships?.connection || DEFAULT_COLORS.relationships.connection,
              installation: parsed.relationships?.installation || DEFAULT_COLORS.relationships.installation,
              annotation: parsed.relationships?.annotation || DEFAULT_COLORS.relationships.annotation,
              note: parsed.relationships?.note || DEFAULT_COLORS.relationships.note,
            },
            highlights: {
              noteRelated: parsed.relationships?.noteRelated || DEFAULT_COLORS.highlights.noteRelated,
              selected: DEFAULT_COLORS.highlights.selected,
            }
          };
        }
        
        // If it has the new structure, return it
        if (parsed.entities) {
          return parsed;
        }
      }
      return DEFAULT_COLORS;
    } catch (error) {
      return DEFAULT_COLORS;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('pid-tagger-patterns', JSON.stringify(patterns));
    } catch (error)
      {
    }
  }, [patterns]);

    useEffect(() => {
        try {
            localStorage.setItem('pid-tagger-tolerances', JSON.stringify(tolerances));
        } catch (error) {
        }
    }, [tolerances]);

  useEffect(() => {
    try {
      localStorage.setItem('pid-tagger-app-settings', JSON.stringify(appSettings));
    } catch (error) {
    }
  }, [appSettings]);

  useEffect(() => {
    try {
      localStorage.setItem('pid-tagger-color-settings', JSON.stringify(colorSettings));
    } catch (error) {
    }
  }, [colorSettings]);

  // Save performance settings to localStorage
  useEffect(() => {
    localStorage.setItem('pid-tagger-showAllRelationships', showAllRelationships.toString());
  }, [showAllRelationships]);

  useEffect(() => {
    localStorage.setItem('pid-tagger-showOnlySelectedRelationships', showOnlySelectedRelationships.toString());
  }, [showOnlySelectedRelationships]);
  
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
            return;
        }

        if (e.key.toLowerCase() === 's') {
            e.preventDefault();
            setIsSidePanelVisible(prev => !prev);
        } else if (e.key.toLowerCase() === 'v') {
            e.preventDefault();
            // Toggle visibility panel by dispatching a custom event
            window.dispatchEvent(new CustomEvent('toggleVisibilityPanel'));
        }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []); // Run only once



  const showConfirmation = (message: string, onConfirm: () => void): void => {
    setConfirmation({ isOpen: true, message, onConfirm });
  };
  const handleCloseConfirmation = () => {
    setConfirmation({ isOpen: false, message: '', onConfirm: () => {} });
    setShowAutoLinkRanges(false); // Hide auto-link ranges when closing confirmation
  };
  const handleConfirm = () => {
    confirmation.onConfirm();
    handleCloseConfirmation();
  };

  const processPdf = useCallback(async (doc: any, patternsToUse: PatternConfig, tolerancesToUse: ToleranceConfig, appSettingsToUse?: AppSettings): Promise<void> => {
    setIsLoading(true);
    setTags([]);
    setRawTextItems([]);
    setRelationships([]);
    setLoops([]);
    // Note: Keep descriptions as they are user-created content that persists
    setProgress({ current: 0, total: doc.numPages });
    setCurrentPage(1); // Reset to first page on new process

    try {
      let allTags = [];
      let allRawTextItems = [];
      for (let i = 1; i <= doc.numPages; i++) {
        const { tags: pageTags, rawTextItems: pageRawTextItems } = await extractTags(doc, i, patternsToUse, tolerancesToUse, appSettings);
        allTags = [...allTags, ...pageTags];
        allRawTextItems = [...allRawTextItems, ...pageRawTextItems];
        setProgress(p => ({ ...p, current: i }));
      }
      setTags(allTags);
      setRawTextItems(allRawTextItems);
      setRelationships([]);

      // Auto-optimize note connections if enabled
      let currentRelationships = [];
      if (autoOptimizeNoteConnectionsEnabled) {
        const instrumentTags = allTags.filter(t => t.category === Category.Instrument);
        const noteTags = allTags.filter(t => t.category === Category.NotesAndHolds);

        if (instrumentTags.length > 0 && noteTags.length > 0) {
          setIsOptimizing(true);
          setOptimizationProgress({ percent: 0, message: '노트 연결 최적화 중...' });

          try {
            const result = await quickOptimizeNoteConnections(
              instrumentTags,
              noteTags,
              doc,
              (progress, message) => {
                setOptimizationProgress({ percent: progress, message });
              }
            );

            // Save optimized distance
            localStorage.setItem('pid-tagger-optimized-note-distance', result.distance.toString());

            // Create relationships with optimized distance
            const noteRelationships = createOptimizedNoteConnections(
              instrumentTags,
              noteTags,
              result.distance
            );

            if (noteRelationships.length > 0) {
              currentRelationships = [...currentRelationships, ...noteRelationships];
            }
          } catch (error) {
            // 노트 연결 최적화 실패
          }
        }

        // Auto-optimize note descriptions
        if (noteTags.length > 0) {
          setOptimizationProgress({ percent: 0, message: '노트 설명 패턴 최적화 중...' });

          try {
            const result = await quickOptimizeNoteDescriptions(
              allRawTextItems,
              doc,
              (progress, message) => {
                setOptimizationProgress({ percent: progress, message });
              }
            );

            if (result.score > 0) {
              // Save optimized pattern
              localStorage.setItem('pid-tagger-optimized-note-description-pattern', JSON.stringify(result.pattern));

              // Get page width for linking
              const firstPage = await doc.getPage(1);
              const viewport = firstPage.getViewport({ scale: 1 });
              const pageWidth = viewport.width;

              // Link NOTE tags to descriptions
              const { relationships: descriptionRelationships } = linkNoteDescriptions(
                noteTags,
                allRawTextItems,
                result.pattern,
                pageWidth
              );

              if (descriptionRelationships.length > 0) {
                currentRelationships = [...currentRelationships, ...descriptionRelationships];
              }
            }
          } catch (error) {
            // 노트 설명 최적화 실패
          }
        }

        setIsOptimizing(false);
        setRelationships(currentRelationships);
      }

      // Auto-generate loops if enabled
      if (appSettingsToUse?.autoGenerateLoops || appSettings.autoGenerateLoops) {
        setTimeout(() => {
          autoGenerateLoops(allTags);
        }, 100); // Small delay to ensure tags are set
      }
    } catch (error) {
    } finally {
      setIsLoading(false);
    }
  }, [appSettings, autoOptimizeNoteConnectionsEnabled]);

  const handleOptimizeTolerances = useCallback(async (doc: any): Promise<ToleranceConfig> => {
    setIsOptimizing(true);
    setOptimizationProgress({ percent: 0, message: '최적화 시작 중...' });

    try {
      const result = await quickOptimizeTolerances(
        doc,
        patterns,
        tolerances,
        appSettings,
        (percent, message) => {
          setOptimizationProgress({ percent, message });
        }
      );

      // Save optimized tolerances
      setTolerances(result.tolerances);
      localStorage.setItem('pid-tagger-tolerances', JSON.stringify(result.tolerances));

      // Show success message
      setOptimizationProgress({
        percent: 100,
        message: `✅ 최적 설정 발견: ${result.tagCount}개 태그 감지됨`
      });

      // Clear progress after a delay
      setTimeout(() => {
        setIsOptimizing(false);
        setOptimizationProgress({ percent: 0, message: '' });
      }, 2000);

      return result.tolerances;
    } catch (error) {
      // 최적화 실패
      setIsOptimizing(false);
      setOptimizationProgress({ percent: 0, message: '최적화 실패' });
      return tolerances; // Return current tolerances on failure
    }
  }, [patterns, tolerances, appSettings, setTolerances]);

  const handleFileSelect = useCallback(async (file: File): Promise<void> => {
    setPdfFile(file);
    setIsLoading(true);
    setTags([]);
    setRawTextItems([]);
    setRelationships([]);
    setProgress({ current: 0, total: 0 });
    setCurrentPage(1);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const doc = await loadingTask.promise;
      setPdfDoc(doc);

      // Auto-optimize if enabled
      let tolerancesToUse = tolerances;
      if (autoOptimizeEnabled) {
        tolerancesToUse = await handleOptimizeTolerances(doc);
      }

      await processPdf(doc, patterns, tolerancesToUse, appSettings);
    } catch (error) {
      setIsLoading(false);
    }
  }, [patterns, tolerances, appSettings, processPdf, autoOptimizeEnabled, handleOptimizeTolerances]);

  const handleSaveSettingsOnly = (newPatterns: PatternConfig, newTolerances: ToleranceConfig, newAppSettings: AppSettings, newColorSettings: ColorSettings): void => {
    // Ensure patterns have the correct keys
    const validPatterns = {
      ...newPatterns,
      // Ensure Line pattern exists with the correct key
      [Category.Line]: newPatterns[Category.Line] || newPatterns['Line'] || DEFAULT_PATTERNS[Category.Line]
    };

    setPatterns(validPatterns);
    setTolerances(newTolerances);
    // Force autoGenerateLoops and autoRemoveWhitespace to always be true
    const forcedSettings = {
      ...newAppSettings,
      autoGenerateLoops: true,
      autoRemoveWhitespace: true
    };
    setAppSettings(forcedSettings);
    setColorSettings(newColorSettings);
    setIsSettingsOpen(false);

    // Store to localStorage
    localStorage.setItem('pid-tagger-patterns', JSON.stringify(validPatterns));
    localStorage.setItem('pid-tagger-tolerances', JSON.stringify(newTolerances));
    localStorage.setItem('pid-tagger-app-settings', JSON.stringify(forcedSettings));
    localStorage.setItem('pid-tagger-color-settings', JSON.stringify(newColorSettings));
  };

  const handleSaveSettingsAndRescan = async (newPatterns: PatternConfig, newTolerances: ToleranceConfig, newAppSettings: AppSettings, newColorSettings: ColorSettings, activeTab: string): Promise<void> => {
    // Ensure patterns have the correct keys
    const validPatterns = {
      ...newPatterns,
      // Ensure Line pattern exists with the correct key
      [Category.Line]: newPatterns[Category.Line] || newPatterns['Line'] || DEFAULT_PATTERNS[Category.Line]
    };

    setPatterns(validPatterns);
    setTolerances(newTolerances);
    // Force autoGenerateLoops and autoRemoveWhitespace to always be true
    const forcedSettings = {
      ...newAppSettings,
      autoGenerateLoops: true,
      autoRemoveWhitespace: true
    };
    setAppSettings(forcedSettings);
    setColorSettings(newColorSettings);
    setIsSettingsOpen(false);

    // Store to localStorage
    localStorage.setItem('pid-tagger-patterns', JSON.stringify(validPatterns));
    localStorage.setItem('pid-tagger-tolerances', JSON.stringify(newTolerances));
    localStorage.setItem('pid-tagger-app-settings', JSON.stringify(forcedSettings));
    localStorage.setItem('pid-tagger-color-settings', JSON.stringify(newColorSettings));
    
    // Only rescan if patterns/tolerances/settings changed (not for color changes)
    if (activeTab === 'patterns' && pdfDoc) {
      // Check if user has manual data that will be lost
      const hasManualData = relationships.length > 0 || 
                           loops.length > 0 ||
                           tags.some(tag => tag.isReviewed) ||
                           loops.length > 0;

      if (hasManualData) {
        showConfirmation(
          `패턴 설정이 변경되어 PDF를 다시 스캔해야 합니다.

⚠️ Rescanning will delete all manually created content:

• Tag relationships (Connection, Installation, Note, etc.)
• Manually created loops
• Tag review status (✓ checkmarks)

✅ Note & Hold descriptions will be preserved.

💡 If you have important work, please Export your project as backup first.

Do you want to continue?`,
          () => processPdf(pdfDoc, validPatterns, newTolerances, newAppSettings)
        );
      } else {
        await processPdf(pdfDoc, validPatterns, newTolerances, newAppSettings);
      }
    }
  };

  const handleReset = () => {
    setPdfFile(null);
    setPdfDoc(null);
    setTags([]);
    setRawTextItems([]);
    setRelationships([]);
    setDescriptions([]);
    setIsLoading(false);
    setProgress({ current: 0, total: 0 });
    setCurrentPage(1);
    setScale(1.5);
    setMode('select');
  };

  // Helper functions for visibility settings
  const updateVisibilitySettings = useCallback((updates: Partial<VisibilitySettings>) => {
    setVisibilitySettings(prev => ({
      ...prev,
      ...updates,
      tags: updates.tags ? { ...prev.tags, ...updates.tags } : prev.tags,
      relationships: updates.relationships ? { ...prev.relationships, ...updates.relationships } : prev.relationships,
    }));
  }, []);

  const toggleTagVisibility = useCallback((tagType: keyof VisibilitySettings['tags']) => {
    setVisibilitySettings(prev => ({
      ...prev,
      tags: {
        ...prev.tags,
        [tagType]: !prev.tags[tagType],
      },
    }));
  }, []);

  const toggleRelationshipVisibility = useCallback((relType: keyof VisibilitySettings['relationships']) => {
    setVisibilitySettings(prev => ({
      ...prev,
      relationships: {
        ...prev.relationships,
        [relType]: !prev.relationships[relType],
      },
    }));
  }, []);

  const toggleAllTags = useCallback(() => {
    const allTagsVisible = Object.values(visibilitySettings.tags).every(Boolean);
    const newState = !allTagsVisible;
    setVisibilitySettings(prev => ({
      ...prev,
      tags: {
        line: newState,
        instrument: newState,
        drawingNumber: newState,
        notesAndHolds: newState,
      },
      descriptions: newState
    }));
  }, [visibilitySettings.tags]);

  const toggleAllRelationships = useCallback(() => {
    const allRelationshipsVisible = Object.values(visibilitySettings.relationships).every(Boolean);
    const newState = !allRelationshipsVisible;
    setVisibilitySettings(prev => ({
      ...prev,
      relationships: {
        connection: newState,
        installation: newState,
        annotation: newState,
        note: newState,
      },
    }));
  }, [visibilitySettings.relationships]);
  
  const handleCreateTag = useCallback((itemsToConvert: RawTextItem[], category: CategoryType): void => {
    if (!itemsToConvert || itemsToConvert.length === 0) return;

    // All items must be on the same page
    const page = itemsToConvert[0].page;
    if (itemsToConvert.some(item => item.page !== page)) {
      return;
    }

    // Sort items by position (top to bottom, then left to right)
    const sortedItems = [...itemsToConvert].sort((a, b) => {
      // First sort by vertical position (top to bottom, smaller y values first in screen coordinates)
      const yDiff = a.bbox.y1 - b.bbox.y1;
      if (Math.abs(yDiff) > 5) { // Allow small vertical tolerance for alignment
        return yDiff;
      }
      // If vertically aligned, sort by horizontal position (left to right)
      return a.bbox.x1 - b.bbox.x1;
    });
    
    // Combine text with appropriate separator based on category settings
    const shouldUseHyphen = (() => {
      switch (category) {
        case Category.Line: return appSettings.hyphenSettings.line;
        case Category.Instrument: return appSettings.hyphenSettings.instrument;
        case Category.DrawingNumber: return appSettings.hyphenSettings.drawingNumber;
        case Category.NotesAndHolds: return appSettings.hyphenSettings.notesAndHolds;
        default: return false;
      }
    })();
    
    const rawCombinedText = shouldUseHyphen
      ? sortedItems.map(item => item.text).join('-')
      : sortedItems.map(item => item.text).join('');
    
    // Apply whitespace removal based on settings (except for NotesAndHolds)
    const combinedText = (appSettings.autoRemoveWhitespace && category !== Category.NotesAndHolds) 
      ? rawCombinedText.replace(/\s+/g, '') 
      : rawCombinedText;
    
    const combinedBbox = itemsToConvert.reduce((acc, item) => {
      return {
        x1: Math.min(acc.x1, item.bbox.x1),
        y1: Math.min(acc.y1, item.bbox.y1),
        x2: Math.max(acc.x2, item.bbox.x2),
        y2: Math.max(acc.y2, item.bbox.y2),
      };
    }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });

    const newTag = {
      id: uuidv4(),
      text: combinedText,
      page,
      bbox: combinedBbox,
      category,
      sourceItems: itemsToConvert, // Store original items
    };

    setTags(prev => [...prev, newTag]);
    const idsToConvert = new Set(itemsToConvert.map(item => item.id));
    setRawTextItems(prev => prev.filter(item => !idsToConvert.has(item.id)));
    // Clean up any annotation relationships involving the now-converted raw items
    setRelationships(prev => prev.filter(rel => !(rel.type === RelationshipType.Annotation && idsToConvert.has(rel.to))));
  }, [appSettings.autoRemoveWhitespace, appSettings.hyphenSettings]);

  const handleCreateManualTag = useCallback((tagData: ManualTagData): void => {
    const { text, bbox, page, category } = tagData;
    if (!text || !bbox || !page || !category) {
        return;
    }

    // Apply whitespace removal based on settings (except for NotesAndHolds)
    const cleanedText = (appSettings.autoRemoveWhitespace && category !== Category.NotesAndHolds) 
      ? text.replace(/\s+/g, '') 
      : text;

    const newTag = {
      id: uuidv4(),
      text: cleanedText,
      page,
      bbox,
      category,
      sourceItems: [], // No source items for manually drawn tags
    };

    setTags(prev => [...prev, newTag]);
  }, [appSettings.autoRemoveWhitespace]);

  const handleDeleteTags = useCallback((tagIdsToDelete: string[]): void => {
    const idsToDelete = new Set(tagIdsToDelete);

    // Find the tags being deleted
    const tagsToRevert = tags.filter(tag => idsToDelete.has(tag.id));
    
    const itemsToRestore = [];
    
    for (const tag of tagsToRevert) {
      if (tag.sourceItems && tag.sourceItems.length > 0) {
        // It was a manually created tag, restore the original source items
        // Convert source items to proper RawTextItem format
        const convertedItems = tag.sourceItems.map(item => ({
          id: uuidv4(),
          text: item.text,
          page: tag.page,
          bbox: item.bbox,
        }));
        itemsToRestore.push(...convertedItems);
      } else {
        // It was an originally detected tag. Revert to a single raw item.
        const restoredItem = {
          id: uuidv4(), // Generate new unique ID for the raw item
          text: tag.text,
          page: tag.page,
          bbox: tag.bbox,
        };
        itemsToRestore.push(restoredItem);
      }
    }

    // Remove the tags
    setTags(prev => prev.filter(tag => !idsToDelete.has(tag.id)));
    // Add the restored/reverted items back to the pool of raw text items
    setRawTextItems(prev => [...prev, ...itemsToRestore]);
    // Clean up any relationships involving the deleted tags
    setRelationships(prev => prev.filter(rel => !idsToDelete.has(rel.from) && !idsToDelete.has(rel.to)));
  }, [tags]);
  
  const handleMergeRawTextItems = useCallback((itemIdsToMerge: string[]): void => {
    if (!itemIdsToMerge || itemIdsToMerge.length < 2) return;

    const itemsToMerge = rawTextItems.filter(item => itemIdsToMerge.includes(item.id));
    if (itemsToMerge.length < 2) return;

    // All items must be on the same page
    const page = itemsToMerge[0].page;
    if (itemsToMerge.some(item => item.page !== page)) {
      return;
    }


    // Sort items by position (top to bottom, then left to right)
    const sortedItems = [...itemsToMerge].sort((a, b) => {
      // First sort by vertical position (top to bottom, smaller y values first in screen coordinates)
      const yDiff = a.bbox.y1 - b.bbox.y1;
      if (Math.abs(yDiff) > 5) { // Allow small vertical tolerance for alignment
        return yDiff;
      }
      // If vertically aligned, sort by horizontal position (left to right)
      return a.bbox.x1 - b.bbox.x1;
    });

    // Combine text with spaces
    const combinedText = sortedItems.map(item => item.text).join(' ');
    
    // Calculate combined bounding box
    const combinedBbox = itemsToMerge.reduce((acc, item) => {
      return {
        x1: Math.min(acc.x1, item.bbox.x1),
        y1: Math.min(acc.y1, item.bbox.y1),
        x2: Math.max(acc.x2, item.bbox.x2),
        y2: Math.max(acc.y2, item.bbox.y2),
      };
    }, { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });

    // Create new merged item
    const mergedItem: RawTextItem = {
      id: uuidv4(),
      text: combinedText,
      page,
      bbox: combinedBbox,
    };

    // Remove original items and add merged item
    const idsToRemove = new Set(itemIdsToMerge);
    setRawTextItems(prev => [
      ...prev.filter(item => !idsToRemove.has(item.id)),
      mergedItem
    ]);

    // Clean up any relationships pointing to the removed items
    setRelationships(prev => prev.filter(rel => !idsToRemove.has(rel.to)));
  }, [rawTextItems]);

  const handleDeleteRawTextItems = useCallback((itemIdsToDelete: string[]): void => {
    const idsToDelete = new Set(itemIdsToDelete);
    setRawTextItems(prev => prev.filter(item => !idsToDelete.has(item.id)));
    // Also remove any relationships pointing to these items
    setRelationships(prev => prev.filter(rel => !idsToDelete.has(rel.to)));
  }, []);

  const handleUpdateTagText = useCallback((tagId: string, newText: string): void => {
    setTags(prevTags => prevTags.map(tag => 
      tag.id === tagId ? { ...tag, text: newText } : tag
    ));
  }, []);

  const handleUpdateRawTextItemText = useCallback((itemId: string, newText: string): void => {
    setRawTextItems(prevItems => prevItems.map(item =>
        item.id === itemId ? { ...item, text: newText } : item
    ));
  }, []);

  const handleCreateDescription = useCallback((selectedItems: (Tag | RawTextItem)[], type: 'Note' | 'Hold' = 'Note'): void => {
    if (!selectedItems || selectedItems.length === 0) return;

    // Sort by Y coordinate (top to bottom) - in screen coordinate system, smaller Y values are at the top
    const sortedItems = [...selectedItems].sort((a, b) => a.bbox.y1 - b.bbox.y1);
    
    // Merge text content
    const text = sortedItems.map(item => item.text).join(' ');
    
    // Calculate merged bounding box
    const mergedBbox = {
      x1: Math.min(...sortedItems.map(item => item.bbox.x1)),
      y1: Math.min(...sortedItems.map(item => item.bbox.y1)),
      x2: Math.max(...sortedItems.map(item => item.bbox.x2)),
      y2: Math.max(...sortedItems.map(item => item.bbox.y2)),
    };

    // Find next available number for this page and type
    const currentPage = sortedItems[0].page;
    const descriptionType = type;
    const existingNumbers = descriptions
      .filter(desc => desc.metadata.type === descriptionType && desc.page === currentPage)
      .map(desc => desc.metadata.number);
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;

    const newDescription: Description = {
      id: uuidv4(),
      text,
      page: sortedItems[0].page,
      bbox: mergedBbox,
      sourceItems: sortedItems,
      metadata: {
        type: descriptionType,
        scope: 'Specific',
        number: nextNumber,
      },
    };

    setDescriptions(prev => [...prev, newDescription]);

    // Auto-link with Note/Hold tags (same as in handleAutoLinkNotesAndHolds)
    const extractNumbers = (tagText: string): number[] => {
      const numberMatches = tagText.match(/\d+/g);
      return numberMatches ? numberMatches.map(num => parseInt(num, 10)) : [];
    };

    const detectNoteHoldType = (tagText: string): 'Note' | 'Hold' | null => {
      const lowerText = tagText.toLowerCase();
      if (lowerText.includes('note')) return 'Note';
      if (lowerText.includes('hold')) return 'Hold';
      return null;
    };

    // Find Note/Hold tags on the same page that match this description
    const noteHoldTags = tags.filter(t => 
      t.category === Category.NotesAndHolds && 
      t.page === currentPage
    );

    const newRelationships = [];
    for (const tag of noteHoldTags) {
      const tagType = detectNoteHoldType(tag.text);
      if (!tagType || tagType !== descriptionType) continue;

      const numbers = extractNumbers(tag.text);
      if (numbers.includes(nextNumber)) {
        // Check if relationship doesn't already exist
        const relationshipKey = `${tag.id}-${newDescription.id}`;
        const existsAlready = relationships.some(r => 
          r.from === tag.id && r.to === newDescription.id && r.type === RelationshipType.Description
        );
        
        if (!existsAlready) {
          newRelationships.push({
            id: uuidv4(),
            from: tag.id,
            to: newDescription.id,
            type: RelationshipType.Description
          });
        }
      }
    }

    if (newRelationships.length > 0) {
      setRelationships(prev => [...prev, ...newRelationships]);
    }

    // Remove tags that were converted to description
    const tagIdsToRemove = selectedItems
      .filter(item => 'category' in item) // Only tags have category
      .map(tag => tag.id);
    
    if (tagIdsToRemove.length > 0) {
      setTags(prev => prev.filter(tag => !tagIdsToRemove.includes(tag.id)));
    }

    // Remove raw text items that were converted to description  
    const rawItemIdsToRemove = selectedItems
      .filter(item => !('category' in item)) // Only raw items don't have category
      .map(item => item.id);
    
    if (rawItemIdsToRemove.length > 0) {
      setRawTextItems(prev => prev.filter(item => !rawItemIdsToRemove.includes(item.id)));
    }
  }, [descriptions, tags, relationships]);

  const handleCreateHoldDescription = useCallback((selectedItems: (Tag | RawTextItem)[]): void => {
    handleCreateDescription(selectedItems, 'Hold');
  }, [handleCreateDescription]);




  const handleDeleteDescriptions = useCallback((descriptionIds: string[]): void => {
    const idsToDelete = new Set(descriptionIds);
    
    // Get descriptions to be deleted to restore their source items
    const descriptionsToDelete = descriptions.filter(desc => idsToDelete.has(desc.id));
    
    // Restore source items
    descriptionsToDelete.forEach(desc => {
      desc.sourceItems.forEach(sourceItem => {
        if ('category' in sourceItem) {
          // This is a Tag, restore it
          setTags(prev => {
            // Check if tag already exists to avoid duplicates
            const exists = prev.some(tag => tag.id === sourceItem.id);
            if (!exists) {
              return [...prev, sourceItem as Tag];
            }
            return prev;
          });
        } else {
          // This is a RawTextItem, restore it
          setRawTextItems(prev => {
            // Check if raw text item already exists to avoid duplicates
            const exists = prev.some(item => item.id === sourceItem.id);
            if (!exists) {
              return [...prev, sourceItem as RawTextItem];
            }
            return prev;
          });
        }
      });
    });
    
    // Remove the descriptions
    setDescriptions(prev => prev.filter(desc => !idsToDelete.has(desc.id)));
    
    // Clean up relationships
    setRelationships(prev => prev.filter(rel => !idsToDelete.has(rel.from) && !idsToDelete.has(rel.to)));
  }, [descriptions]);

  const handleUpdateDescription = useCallback((id: string, text: string, metadata: Description['metadata']): void => {
    setDescriptions(prev => {
      const currentDesc = prev.find(desc => desc.id === id);
      if (!currentDesc) return prev;

      let updatedMetadata = metadata;

      // If type changed, recalculate number for the new type on the same page
      if (currentDesc.metadata.type !== metadata.type) {
        const existingNumbers = prev
          .filter(desc => 
            desc.id !== id && // Exclude current description
            desc.metadata.type === metadata.type && 
            desc.page === currentDesc.page
          )
          .map(desc => desc.metadata.number);
        
        const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
        updatedMetadata = { ...metadata, number: nextNumber };
      }

      return prev.map(desc => 
        desc.id === id ? { ...desc, text, metadata: updatedMetadata } : desc
      );
    });
  }, []);


  const validateProjectData = (data: any): data is ProjectData => {
    // Basic structure validation
    if (!data || typeof data !== 'object') return false;
    
    // Required fields validation
    const requiredFields = ['pdfFileName', 'exportDate', 'tags', 'relationships', 'rawTextItems'];
    for (const field of requiredFields) {
      if (!(field in data)) return false;
    }
    
    // Type validation for arrays
    if (!Array.isArray(data.tags) || !Array.isArray(data.relationships) || !Array.isArray(data.rawTextItems)) {
      return false;
    }
    
    // Optional descriptions field validation
    if (data.descriptions && !Array.isArray(data.descriptions)) {
      return false;
    }
    
    // Validate tag structure
    for (const tag of data.tags) {
      if (!tag.id || !tag.text || !tag.page || !tag.bbox || !tag.category) {
        return false;
      }
      if (!tag.bbox.hasOwnProperty('x1') || !tag.bbox.hasOwnProperty('y1') || 
          !tag.bbox.hasOwnProperty('x2') || !tag.bbox.hasOwnProperty('y2')) {
        return false;
      }
    }
    
    // Validate relationship structure
    for (const rel of data.relationships) {
      if (!rel.id || !rel.from || !rel.to || !rel.type) {
        return false;
      }
      if (!Object.values(RelationshipType).includes(rel.type)) {
        return false;
      }
    }
    
    // Validate rawTextItems structure
    for (const item of data.rawTextItems) {
      if (!item.id || !item.text || !item.page || !item.bbox) {
        return false;
      }
    }
    
    return true;
  };

  const sanitizeProjectData = (data: ProjectData): ProjectData => {
    // Sanitize strings to prevent XSS
    const sanitizeString = (str: string): string => {
      return str.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+="[^"]*"/gi, '');
    };
    
    return {
      ...data,
      pdfFileName: sanitizeString(data.pdfFileName),
      tags: data.tags.map(tag => ({
        ...tag,
        text: sanitizeString(tag.text)
      })),
      rawTextItems: data.rawTextItems.map(item => ({
        ...item,
        text: sanitizeString(item.text)
      })),
      descriptions: (data.descriptions || []).map(desc => ({
        ...desc,
        text: sanitizeString(desc.text)
      }))
    };
  };

  const loadProjectData = useCallback((projectData: any): void => {
    if (!validateProjectData(projectData)) {
      alert("프로젝트 파일 구조가 잘못되었거나 손상된 데이터입니다. 불러올 수 없습니다.");
      return;
    }
    
    const sanitizedData = sanitizeProjectData(projectData);
    
    setTags(sanitizedData.tags);
    setRelationships(sanitizedData.relationships);
    setRawTextItems(sanitizedData.rawTextItems);
    setDescriptions(sanitizedData.descriptions || []);
    setLoops([]);
    
    if (sanitizedData.settings?.patterns) {
        setPatterns(sanitizedData.settings.patterns);
    }
    if (sanitizedData.settings?.tolerances) {
        setTolerances(sanitizedData.settings.tolerances);
    }
    if (sanitizedData.settings?.appSettings) {
        setAppSettings(sanitizedData.settings.appSettings);
    }
    
  }, []);

  const handleImportProject = useCallback(async (file: File): Promise<void> => {
    if (!file || !pdfFile) {
        alert("프로젝트 파일을 가져오기 전에 PDF 파일을 먼저 열어주세요.");
        return;
    }
    
    // File size validation (max 50MB)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
        alert("프로젝트 파일이 너무 큽니다. 최대 파일 크기는 50MB입니다.");
        return;
    }
    
    // File type validation
    if (!file.name.toLowerCase().endsWith('.json')) {
        alert("유효한 JSON 프로젝트 파일을 선택해주세요.");
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const content = event.target?.result as string;
            if (!content) {
                throw new Error("File content is empty");
            }
            
            // Additional JSON parsing security
            if (content.includes('<script>') || content.includes('javascript:')) {
                throw new Error("Project file contains potentially malicious content");
            }
            
            const projectData = JSON.parse(content);
            
            if (projectData.pdfFileName !== pdfFile.name) {
                const sanitizedOldName = projectData.pdfFileName?.replace(/[<>]/g, '') || 'Unknown';
                showConfirmation(
                    `이 프로젝트 파일은 다른 PDF("${sanitizedOldName}")용인 것 같습니다. 현재 "${pdfFile.name}"이(가) 열려 있습니다. 그래도 프로젝트 데이터를 불러오시겠습니까?`,
                    () => loadProjectData(projectData)
                );
            } else {
                loadProjectData(projectData);
            }
        } catch (error) {
            let errorMessage = "Could not load project. ";
            
            if (error instanceof SyntaxError) {
                errorMessage += "The file contains invalid JSON format.";
            } else if (error.message.includes('malicious')) {
                errorMessage += "The file contains potentially unsafe content.";
            } else {
                errorMessage += "The file might be corrupted or in an invalid format.";
            }
            
            alert(errorMessage);
        }
    };
    
    reader.onerror = () => {
        alert("파일 읽기 오류. 다시 시도해주세요.");
    };
    
    reader.readAsText(file);
  }, [pdfFile, loadProjectData, showConfirmation]);

  const handleExportProject = useCallback(() => {
    if (!pdfFile) return;

    const projectData = {
        pdfFileName: pdfFile.name,
        exportDate: new Date().toISOString(),
        tags,
        relationships,
        rawTextItems,
        descriptions,
        loops,
        settings: {
            patterns,
            tolerances,
            appSettings,
        },
    };

    const jsonString = JSON.stringify(projectData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = pdfFile.name.replace(/\.pdf$/i, '') + '-project.json';
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [pdfFile, tags, relationships, rawTextItems, patterns, tolerances]);
  
  // Helper function to calculate minimum distance from point to bbox corners and center
  const calculateMinDistanceToCorners = (centerX: number, centerY: number, bbox: { x1: number; y1: number; x2: number; y2: number }) => {
    const points = [
      [bbox.x1, bbox.y1], // top-left
      [bbox.x2, bbox.y1], // top-right
      [bbox.x1, bbox.y2], // bottom-left
      [bbox.x2, bbox.y2], // bottom-right
      [(bbox.x1 + bbox.x2) / 2, (bbox.y1 + bbox.y2) / 2] // center
    ];
    
    return Math.min(...points.map(([x, y]) => 
      Math.sqrt((centerX - x) ** 2 + (centerY - y) ** 2)
    ));
  };

  const handleAutoLinkDescriptions = useCallback(() => {
    const autoLinkDistance = tolerances[Category.Instrument]?.autoLinkDistance;
    if (typeof autoLinkDistance !== 'number') {
        alert("자동 연결 거리가 설정되지 않았습니다. 설정을 확인해주세요.");
        return;
    }

    // Show range circles first
    setShowAutoLinkRanges(true);
    
    // Show confirmation after a brief delay to display ranges
    setTimeout(() => {
      showConfirmation(
        `현재 거리 설정(${autoLinkDistance}px)에 따라 모든 계기 태그에 대한 설명 연결을 자동으로 생성합니다. 많은 관계가 생성될 수 있습니다. 계속하시겠습니까?`,
        () => {
          setShowAutoLinkRanges(false);
          performLinking();
        }
      );
    }, 500);

    const performLinking = () => {
        const instrumentTags = tags.filter(t => t.category === Category.Instrument);
        const existingAnnotationTargets = new Set(
            relationships
                .filter(r => r.type === RelationshipType.Annotation)
                .map(r => r.to)
        );
        const unlinkedRawItems = rawTextItems.filter(item => !existingAnnotationTargets.has(item.id));
        const newRelationships = [];

        // For each non-tag item, find the closest instrument tag within distance
        for (const item of unlinkedRawItems) {
            if (existingAnnotationTargets.has(item.id)) continue;

            const pageInstrumentTags = instrumentTags.filter(tag => tag.page === item.page);
            let closestTag = null;
            let minDistance = Infinity;

            for (const instTag of pageInstrumentTags) {
                const instCenter = {
                    x: (instTag.bbox.x1 + instTag.bbox.x2) / 2,
                    y: (instTag.bbox.y1 + instTag.bbox.y2) / 2
                };

                const distance = calculateMinDistanceToCorners(instCenter.x, instCenter.y, item.bbox);
                
                if (distance <= autoLinkDistance && distance < minDistance) {
                    minDistance = distance;
                    closestTag = instTag;
                }
            }

            // Create relationship only with the closest instrument tag
            if (closestTag) {
                newRelationships.push({
                    id: uuidv4(),
                    from: closestTag.id,
                    to: item.id,
                    type: RelationshipType.Annotation
                });
                existingAnnotationTargets.add(item.id); 
            }
        }
        
        if (newRelationships.length > 0) {
            const existingRelsSet = new Set(relationships.map(r => `${r.from}-${r.to}-${r.type}`));
            const uniqueNewRels = newRelationships.filter(r => !existingRelsSet.has(`${r.from}-${r.to}-${r.type}`));
            
            if (uniqueNewRels.length > 0) {
                setRelationships(prev => [...prev, ...uniqueNewRels]);
                alert(`${uniqueNewRels.length}개의 새 설명 연결이 생성되었습니다.`);
            } else {
                alert('새로운 설명 연결을 찾을 수 없습니다. 이미 존재할 수 있습니다.');
            }
        } else {
            alert('현재 설정으로 새 설명 연결을 찾을 수 없습니다.');
        }
    };
    
    showConfirmation(
        `현재 거리 설정(${autoLinkDistance}px)에 따라 모든 계기 태그에 대한 설명 연결을 자동으로 생성합니다. 많은 관계가 생성될 수 있습니다. 계속하시겠습니까?`,
        performLinking
    );
  }, [tags, rawTextItems, relationships, tolerances, showConfirmation]);

  const handleClearIncorrectNoteConnections = useCallback(() => {
    // Clear all existing Note relationships and recreate with correct algorithm
    const nonNoteRelationships = relationships.filter(r => r.type !== RelationshipType.Note);
    setRelationships(nonNoteRelationships);
    alert('All NOTE connections have been cleared. Please re-run auto-link to create correct connections.');
  }, [relationships, setRelationships]);

  const handleAutoLinkNotesAndHolds = useCallback(async () => {
    const detectNoteHoldType = (tagText: string): 'Note' | 'Hold' | null => {
      const lowerText = tagText.toLowerCase();
      if (lowerText.includes('note')) return 'Note';
      if (lowerText.includes('hold')) return 'Hold';
      return null;
    };

    const extractNumbers = (tagText: string): number[] => {
      // Extract numbers from text (handles comma-separated values)
      const numberMatches = tagText.match(/\d+/g);
      return numberMatches ? numberMatches.map(num => parseInt(num, 10)) : [];
    };

    const performLinking = async () => {
      const noteHoldTags = tags.filter(t => t.category === Category.NotesAndHolds);
      // Track existing relationships to avoid duplicates
      const existingRelationshipKeys = new Set(
        relationships
          .filter(r => r.type === RelationshipType.Description)
          .map(r => `${r.from}-${r.to}`)
      );
      const newRelationships = [];

      for (const tag of noteHoldTags) {
        const type = detectNoteHoldType(tag.text);
        if (!type) continue;

        const numbers = extractNumbers(tag.text);
        if (numbers.length === 0) continue;

        // Find matching descriptions (same page only)
        for (const number of numbers) {
          const matchingDescriptions = descriptions.filter(desc => 
            desc.metadata.type === type && 
            desc.metadata.number === number &&
            desc.metadata.scope === 'Specific' &&
            desc.page === tag.page
          );

          for (const desc of matchingDescriptions) {
            const relationshipKey = `${tag.id}-${desc.id}`;
            // Only create relationship if it doesn't already exist
            if (!existingRelationshipKeys.has(relationshipKey)) {
              newRelationships.push({
                id: uuidv4(),
                from: tag.id,
                to: desc.id,
                type: RelationshipType.Description
              });
              existingRelationshipKeys.add(relationshipKey);
            }
          }
        }
      }

      // First, create relationships with existing descriptions
      if (newRelationships.length > 0) {
        const existingRelsSet = new Set(relationships.map(r => `${r.from}-${r.to}-${r.type}`));
        const uniqueNewRels = newRelationships.filter(r => !existingRelsSet.has(`${r.from}-${r.to}-${r.type}`));

        if (uniqueNewRels.length > 0) {
          setRelationships(prev => [...prev, ...uniqueNewRels]);
        }
      }

      // Now extract note descriptions from the PDF and create new Description entities
      if (!pdfDoc) {
        alert('PDF 문서가 로드되지 않았습니다.');
        return;
      }

      let extractedDescriptions = [];
      let newDescriptions = [];
      let newDescriptionRelationships = [];

      // Extract note descriptions from all pages
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        try {
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.0 });
          const noteDescs = extractNoteDescriptions(rawTextItems, pageNum, viewport);

          if (noteDescs && noteDescs.length > 0) {
            extractedDescriptions.push(...noteDescs);

            // Create Description entities for each extracted note description
            for (const noteDesc of noteDescs) {
              // Check if a description with this number already exists on this page
              const existingDesc = descriptions.find(d =>
                d.page === pageNum &&
                d.metadata.type === 'Note' &&
                d.metadata.number === noteDesc.number
              );

              if (!existingDesc) {
                const newDesc: Description = {
                  id: uuidv4(),
                  text: noteDesc.text,
                  page: noteDesc.page,
                  bbox: noteDesc.bbox,
                  sourceItems: noteDesc.items || [],
                  metadata: {
                    type: 'Note',
                    scope: 'Specific',
                    number: noteDesc.number
                  }
                };
                newDescriptions.push(newDesc);

                // Find corresponding NOTE tags and create relationships
                const noteTags = tags.filter(t =>
                  t.category === Category.NotesAndHolds &&
                  t.page === pageNum &&
                  detectNoteHoldType(t.text) === 'Note'
                );

                for (const tag of noteTags) {
                  const numbers = extractNumbers(tag.text);
                  if (numbers.includes(noteDesc.number)) {
                    // Check if relationship doesn't already exist
                    const relationshipExists = relationships.some(r =>
                      r.from === tag.id && r.type === RelationshipType.Description
                    ) || newDescriptionRelationships.some(r =>
                      r.from === tag.id && r.to === newDesc.id
                    );

                    if (!relationshipExists) {
                      newDescriptionRelationships.push({
                        id: uuidv4(),
                        from: tag.id,
                        to: newDesc.id,
                        type: RelationshipType.Description
                      });
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          // Error extracting note descriptions from page
        }
      }

      // Helper function: Check if a circle intersects with a rectangle
      const circleIntersectsRectangle = (circleCenter, radius, rect, debugTag = '') => {
        // Find the closest point on the rectangle to the circle center
        const closestX = Math.max(rect.x1, Math.min(circleCenter.x, rect.x2));
        const closestY = Math.max(rect.y1, Math.min(circleCenter.y, rect.y2));

        // Calculate distance from circle center to closest point
        const distX = circleCenter.x - closestX;
        const distY = circleCenter.y - closestY;
        const distSquared = distX * distX + distY * distY;
        const distance = Math.sqrt(distSquared);

        // Debug logging
        if (debugTag) {
        }

        // Check if distance is less than or equal to radius
        return distance <= radius;
      };

      // Create Instrument->Note relationships
      const instrumentTags = tags.filter(t => t.category === Category.Instrument);
      const newInstrumentNoteRelationships = [];
      const existingInstrumentNoteKeys = new Set(
        relationships
          .filter(r => r.type === RelationshipType.Note)
          .map(r => `${r.from}-${r.to}`)
      );

      // For each instrument, check if any NOTE tags fall within its circle
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
        const pageNoteTags = noteHoldTags.filter(tag =>
          tag.page === instrument.page && detectNoteHoldType(tag.text) === 'Note'
        );


        for (const noteTag of pageNoteTags) {
          // Check if the instrument's circle intersects with the NOTE tag's bbox
          const intersects = circleIntersectsRectangle(
            instrumentCenter,
            diagonalRadius,
            noteTag.bbox,
            noteTag.text
          );

          if (intersects) {
            const relationshipKey = `${instrument.id}-${noteTag.id}`;
            if (!existingInstrumentNoteKeys.has(relationshipKey)) {
              newInstrumentNoteRelationships.push({
                id: uuidv4(),
                from: instrument.id,
                to: noteTag.id,
                type: RelationshipType.Note
              });
              existingInstrumentNoteKeys.add(relationshipKey);
            }
          }
        }
      }

      // Update state with new descriptions and relationships
      let totalNewItems = newRelationships.length;

      if (newDescriptions.length > 0) {
        setDescriptions(prev => [...prev, ...newDescriptions]);
        totalNewItems += newDescriptions.length;
      }

      if (newDescriptionRelationships.length > 0) {
        setRelationships(prev => [...prev, ...newDescriptionRelationships]);
        totalNewItems += newDescriptionRelationships.length;
      }

      if (newInstrumentNoteRelationships.length > 0) {
        setRelationships(prev => [...prev, ...newInstrumentNoteRelationships]);
        totalNewItems += newInstrumentNoteRelationships.length;
      }

      if (extractedDescriptions.length > 0 || newInstrumentNoteRelationships.length > 0) {
        const messages = [];
        if (extractedDescriptions.length > 0) {
          messages.push(`Extracted ${extractedDescriptions.length} note description(s)`);
        }
        if (newDescriptions.length > 0) {
          messages.push(`Created ${newDescriptions.length} new description(s)`);
        }
        if (newInstrumentNoteRelationships.length > 0) {
          messages.push(`Created ${newInstrumentNoteRelationships.length} instrument->note relationship(s)`);
        }
        if (newDescriptionRelationships.length > 0) {
          messages.push(`Created ${newDescriptionRelationships.length} note->description relationship(s)`);
        }
        alert(messages.join('\n'));
      } else if (newRelationships.length > 0) {
        alert(`기존 설명과 함께 ${newRelationships.length}개의 새 노트 & 홀드 연결이 생성되었습니다.`);
      } else {
        alert('현재 데이터로 새 노트 & 홀드 연결을 찾을 수 없습니다.');
      }
    };

    showConfirmation(
      '유형과 번호 매칭을 기반으로 노트 & 홀드 태그와 해당 설명 간의 연결을 자동으로 생성합니다. 계속하시겠습니까?',
      performLinking
    );
  }, [tags, descriptions, relationships, showConfirmation, pdfDoc, rawTextItems]);






  const handleAutoLinkAll = useCallback(async () => {
    showConfirmation(
      '모든 자동 연결 기능을 순차적으로 실행합니다: 설명 및 노트 & 홀드. 계속하시겠습니까?',
      async () => {
        try {
          // Run all auto-link functions sequentially
          await new Promise<void>((resolve) => {
            const performDescriptions = () => {
              const instrumentTags = tags.filter(t => t.category === Category.Instrument);
              const autoLinkDistance = tolerances[Category.Instrument]?.autoLinkDistance;
              
              if (typeof autoLinkDistance !== 'number' || instrumentTags.length === 0) {
                resolve();
                return;
              }
              
              const existingAnnotationTargets = new Set(
                relationships
                  .filter(r => r.type === RelationshipType.Annotation)
                  .map(r => r.to)
              );
              
              const newRelationships = [];
              const unlinkedRawItems = rawTextItems.filter(item => !existingAnnotationTargets.has(item.id));
              
              // For each non-tag item, find the closest instrument tag within distance
              for (const item of unlinkedRawItems) {
                if (existingAnnotationTargets.has(item.id)) continue;

                const pageInstrumentTags = instrumentTags.filter(tag => tag.page === item.page);
                let closestTag = null;
                let minDistance = Infinity;

                for (const tag of pageInstrumentTags) {
                  const instCenter = {
                    x: (tag.bbox.x1 + tag.bbox.x2) / 2,
                    y: (tag.bbox.y1 + tag.bbox.y2) / 2
                  };

                  const distance = calculateMinDistanceToCorners(instCenter.x, instCenter.y, item.bbox);
                  
                  if (distance <= autoLinkDistance && distance < minDistance) {
                    minDistance = distance;
                    closestTag = tag;
                  }
                }

                // Create relationship only with the closest instrument tag
                if (closestTag) {
                  newRelationships.push({
                    id: uuidv4(),
                    from: closestTag.id,
                    to: item.id,
                    type: RelationshipType.Annotation
                  });
                  existingAnnotationTargets.add(item.id); 
                }
              }
              
              if (newRelationships.length > 0) {
                setRelationships(prev => [...prev, ...newRelationships]);
              }
              resolve();
            };
            
            performDescriptions();
          });
          
          await new Promise<void>((resolve) => {
            const performNotesAndHolds = () => {
              const noteHoldTags = tags.filter(t => t.category === Category.NotesAndHolds);
              const existingRelationshipKeys = new Set(
                relationships
                  .filter(r => r.type === RelationshipType.Description)
                  .map(r => `${r.from}-${r.to}`)
              );
              const newRelationships = [];
              
              for (const tag of noteHoldTags) {
                const lowerText = tag.text.toLowerCase();
                const type = lowerText.includes('note') ? 'Note' : lowerText.includes('hold') ? 'Hold' : null;
                if (!type) continue;
                
                const numberMatches = tag.text.match(/\d+/g);
                const numbers = numberMatches ? numberMatches.map(num => parseInt(num, 10)) : [];
                if (numbers.length === 0) continue;
                
                for (const number of numbers) {
                  const matchingDescriptions = descriptions.filter(desc => 
                    desc.metadata.type === type && 
                    desc.metadata.number === number &&
                    desc.metadata.scope === 'Specific' &&
                    desc.page === tag.page
                  );
                  
                  for (const desc of matchingDescriptions) {
                    const relationshipKey = `${tag.id}-${desc.id}`;
                    if (!existingRelationshipKeys.has(relationshipKey)) {
                      newRelationships.push({
                        id: uuidv4(),
                        from: tag.id,
                        to: desc.id,
                        type: RelationshipType.Description,
                      });
                    }
                  }
                }
              }
              
              if (newRelationships.length > 0) {
                setRelationships(prev => [...prev, ...newRelationships]);
              }
              resolve();
            };
            
            performNotesAndHolds();
          });
          
          
          alert('모든 자동 연결이 성공적으로 완료되었습니다!');
        } catch (error) {
          alert('자동 연결 중 오류: ' + error.message);
        }
      }
    );
  }, [tags, rawTextItems, descriptions, relationships, tolerances, showConfirmation]);

  const handleAutoLinkEquipmentShortSpecs = useCallback(() => {
    // Placeholder for equipment short specs auto-linking
  }, []);

  const handleManualOptimization = useCallback(async () => {
    if (!pdfDoc) return;
    const optimizedTolerances = await handleOptimizeTolerances(pdfDoc);
    // Re-process with optimized tolerances
    await processPdf(pdfDoc, patterns, optimizedTolerances, appSettings);
  }, [pdfDoc, handleOptimizeTolerances, processPdf, patterns, appSettings]);

  const handleRemoveWhitespace = useCallback(() => {
    showConfirmation(
      '라인 및 계기 태그에서 모든 공백을 제거하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      () => {
        const updatedTags = tags.map(tag => {
          // Only apply to Line and Instrument categories
          if (tag.category === Category.Line ||
              tag.category === Category.Instrument) {
            return {
              ...tag,
              text: tag.text.replace(/\s/g, '')
            };
          }
          return tag;
        });
        setTags(updatedTags);
        
        // Count affected tags for feedback
        const affectedCount = tags.filter(tag =>
          (tag.category === Category.Line ||
           tag.category === Category.Instrument) &&
          tag.text.includes(' ')
        ).length;
        
        alert(`${affectedCount}개의 라인 및 계기 태그에서 공백이 제거되었습니다.`);
      }
    );
  }, [tags, showConfirmation]);

  // Loop generation utility functions
  const parseInstrumentTag = useCallback((text: string) => {
    const cleanText = text.trim();
    
    // Match patterns: "PT-7083 C", "PZV-7012 A", "PIC-101", etc.
    const match = cleanText.match(/^([A-Z]{1,4})-?(\d+)[\s]*([A-Z]*)$/);
    if (match) {
      return {
        function: match[1].trim(),
        number: parseInt(match[2]),
        suffix: match[3].trim()
      };
    }
    
    // Try alternative pattern without dash: "PT7083C"
    const altMatch = cleanText.match(/^([A-Z]{1,4})(\d+)([A-Z]*)$/);
    if (altMatch) {
      return {
        function: altMatch[1].trim(),
        number: parseInt(altMatch[2]),
        suffix: altMatch[3].trim()
      };
    }
    
    return null;
  }, []);

  const generateLoopId = useCallback((instrumentTags: Tag[]) => {
    if (instrumentTags.length === 0) return null;
    
    const firstTag = instrumentTags[0];
    const parsed = parseInstrumentTag(firstTag.text);
    if (!parsed) return firstTag.text.charAt(0) + '-' + '000';
    
    // Find common function prefix among all tags
    let commonPrefix = parsed.function;
    for (const tag of instrumentTags.slice(1)) {
      const tagParsed = parseInstrumentTag(tag.text);
      if (tagParsed && tagParsed.number === parsed.number) {
        // Find common prefix between functions
        let i = 0;
        while (i < commonPrefix.length && i < tagParsed.function.length && 
               commonPrefix[i] === tagParsed.function[i]) {
          i++;
        }
        commonPrefix = commonPrefix.substring(0, i);
      }
    }
    
    // Fallback to first letter if no common prefix
    if (commonPrefix.length === 0) {
      commonPrefix = parsed.function.charAt(0);
    }
    
    return `${commonPrefix}-${parsed.number}`;
  }, [parseInstrumentTag]);

  const autoGenerateLoops = useCallback((allTags: Tag[]) => {
    const instrumentTags = allTags.filter(t => t.category === Category.Instrument);
    
    if (instrumentTags.length === 0) {
      return;
    }

    // Group by 1-letter prefix and number
    const oneLetterGroups = new Map<string, Tag[]>();
    
    for (const tag of instrumentTags) {
      const parsed = parseInstrumentTag(tag.text);
      if (!parsed) continue;
      
      const oneLetterKey = `${parsed.function.charAt(0)}-${parsed.number}`;
      if (!oneLetterGroups.has(oneLetterKey)) {
        oneLetterGroups.set(oneLetterKey, []);
      }
      oneLetterGroups.get(oneLetterKey)!.push(tag);
    }
    
    // Create loops from groups with multiple tags
    const newLoops: Loop[] = [];
    oneLetterGroups.forEach((groupTags) => {
      if (groupTags.length > 1) {
        const loopId = generateLoopId(groupTags);
        if (loopId) {
          const newLoop: Loop = {
            id: loopId,
            tagIds: groupTags.map(t => t.id),
            createdAt: new Date().toISOString(),
            isAutoGenerated: true
          };
          newLoops.push(newLoop);
        }
      }
    });
    
    if (newLoops.length > 0) {
      setLoops(prev => [...prev, ...newLoops]);
    }
  }, [parseInstrumentTag, generateLoopId]);

  const handleAutoGenerateLoops = useCallback((pageFilter?: number) => {
    const instrumentTags = tags.filter(t => 
      t.category === Category.Instrument && 
      (pageFilter ? t.page === pageFilter : true)
    );
    
    if (instrumentTags.length === 0) {
      alert('루프를 생성할 계기 태그를 찾을 수 없습니다.');
      return;
    }

    showConfirmation(
      `기능 접두사와 번호 매칭을 기반으로 ${instrumentTags.length}개의 계기 태그에서 루프를 자동으로 생성합니다. 계속하시겠습니까?`,
      () => {
        // First, group by 1-letter prefix and number
        const oneLetterGroups = new Map<string, Tag[]>();
        
        for (const tag of instrumentTags) {
          const parsed = parseInstrumentTag(tag.text);
          if (!parsed) continue;
          
          const oneLetterKey = `${parsed.function.charAt(0)}-${parsed.number}`;
          if (!oneLetterGroups.has(oneLetterKey)) {
            oneLetterGroups.set(oneLetterKey, []);
          }
          oneLetterGroups.get(oneLetterKey)!.push(tag);
        }
        
        // Use 1-letter groups as the primary grouping method
        const loopGroups = oneLetterGroups;
        
        // Create loops from groups with multiple tags
        const newLoops: Loop[] = [];
        const existingLoopIds = new Set(loops.map(l => l.id));
        
        for (const [groupKey, groupTags] of loopGroups.entries()) {
          if (groupTags.length > 1) {
            const loopId = generateLoopId(groupTags) || groupKey;
            
            // Skip if loop already exists
            if (existingLoopIds.has(loopId)) continue;
            
            newLoops.push({
              id: loopId,
              tagIds: groupTags.map(t => t.id),
              createdAt: new Date().toISOString(),
              isAutoGenerated: true
            });
          }
        }
        
        if (newLoops.length > 0) {
          setLoops(prev => [...prev, ...newLoops]);
          alert(`${newLoops.reduce((sum, loop) => sum + loop.tagIds.length, 0)}개의 계기 태그로부터 ${newLoops.length}개의 새 루프가 생성되었습니다.`);
        } else {
          alert('새 루프를 생성할 수 없습니다. 이미 존재하거나 일치하는 그룹을 찾을 수 없습니다.');
        }
      }
    );
  }, [tags, loops, parseInstrumentTag, generateLoopId, showConfirmation]);

  const handleManualCreateLoop = useCallback((selectedTagIds: string[]) => {
    const selectedInstrumentTags = tags.filter(t => 
      selectedTagIds.includes(t.id) && t.category === Category.Instrument
    );
    
    if (selectedInstrumentTags.length < 2) {
      alert('루프를 생성하려면 최소 2개 이상의 계기 태그를 선택해주세요.');
      return;
    }
    
    const loopId = generateLoopId(selectedInstrumentTags);
    if (!loopId) {
      alert('선택한 태그에서 루프 ID를 생성할 수 없습니다.');
      return;
    }
    
    // Check if loop already exists
    const existingLoop = loops.find(l => l.id === loopId);
    if (existingLoop) {
      alert(`Loop "${loopId}" already exists.`);
      return;
    }
    
    const newLoop: Loop = {
      id: loopId,
      tagIds: selectedInstrumentTags.map(t => t.id),
      createdAt: new Date().toISOString(),
      isAutoGenerated: false
    };
    
    setLoops(prev => [...prev, newLoop]);
    alert(`Created loop "${loopId}" with ${selectedInstrumentTags.length} instrument tags.`);
  }, [tags, loops, generateLoopId]);

  const handleDeleteLoops = useCallback((loopIds: string[]) => {
    setLoops(prev => prev.filter(l => !loopIds.includes(l.id)));
  }, []);

  const handleUpdateLoop = useCallback((loopId: string, name: string, tagIds: string[], notes?: string) => {
    setLoops(prev => {
      const updatedLoops = prev.map(loop =>
        loop.id === loopId
          ? { ...loop, name, tagIds }
          : loop
      );

      // Remove loops with no tags
      return updatedLoops.filter(loop => loop.tagIds && loop.tagIds.length > 0);
    });
  }, []);

  const mainContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-gray-900">
          <svg className="animate-spin -ml-1 mr-3 h-10 w-10 text-sky-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-lg">Processing PDF...</p>
          <p className="text-gray-600">Page {progress.current} of {progress.total}</p>
        </div>
      );
    }

    if (pdfFile && pdfDoc) {
      return (
        <ErrorBoundary
          fallback={
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-red-600">
                <p className="mb-4">Error loading workspace. Please try refreshing the page.</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Reload
                </button>
              </div>
            </div>
          }
        >
          <Workspace
            pdfDoc={pdfDoc}
            tags={tags}
            setTags={setTags}
            relationships={relationships}
            setRelationships={setRelationships}
            rawTextItems={rawTextItems}
            descriptions={descriptions}
            setDescriptions={setDescriptions}
            loops={loops}
            setLoops={setLoops}
            detectedLines={detectedLines}
            appSettings={appSettings}
            onCreateTag={handleCreateTag}
            onCreateManualTag={handleCreateManualTag}
            onCreateDescription={handleCreateDescription}
            onCreateHoldDescription={handleCreateHoldDescription}
            onDeleteTags={handleDeleteTags}
            onUpdateTagText={handleUpdateTagText}
            onDeleteDescriptions={handleDeleteDescriptions}
            onUpdateDescription={handleUpdateDescription}
            onMergeRawTextItems={handleMergeRawTextItems}
            onDeleteRawTextItems={handleDeleteRawTextItems}
            onUpdateRawTextItemText={handleUpdateRawTextItemText}
            onAutoLinkDescriptions={handleAutoLinkDescriptions}
            onAutoLinkNotesAndHolds={handleAutoLinkNotesAndHolds}
            onAutoGenerateLoops={handleAutoGenerateLoops}
            onManualCreateLoop={handleManualCreateLoop}
            onDeleteLoops={handleDeleteLoops}
            onUpdateLoop={handleUpdateLoop}
            showConfirmation={showConfirmation}
            // Pass down viewer state
            currentPage={currentPage}
            setCurrentPage={setCurrentPage}
            scale={scale}
            setScale={setScale}
            mode={mode}
            setMode={setMode}
            relationshipStartTag={relationshipStartTag}
            setRelationshipStartTag={setRelationshipStartTag}
            showRelationships={showRelationships}
            setShowRelationships={setShowRelationships}
            visibilitySettings={visibilitySettings}
            updateVisibilitySettings={updateVisibilitySettings}
            showAutoLinkRanges={showAutoLinkRanges}
            tolerances={tolerances}
            toggleTagVisibility={toggleTagVisibility}
            toggleRelationshipVisibility={toggleRelationshipVisibility}
            toggleAllTags={toggleAllTags}
            toggleAllRelationships={toggleAllRelationships}
            showAllRelationships={showAllRelationships}
            setShowAllRelationships={setShowAllRelationships}
            showOnlySelectedRelationships={showOnlySelectedRelationships}
            setShowOnlySelectedRelationships={setShowOnlySelectedRelationships}
            isSidePanelVisible={isSidePanelVisible}
            colorSettings={colorSettings}
          />
        </ErrorBoundary>
      );
    }
    
    return (
      <ErrorBoundary
        fallback={
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-red-300">
              <p className="mb-4">Error loading file upload. Please refresh the page.</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Reload
              </button>
            </div>
          </div>
        }
      >
        <PdfUpload onFileSelect={handleFileSelect} />
      </ErrorBoundary>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 font-sans">
      {/* Optimization Progress Overlay */}
      {isOptimizing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white border border-gray-200 rounded-lg p-6 max-w-md w-full mx-4 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">자동 최적화</h3>
            <div className="space-y-3">
              <div className="text-sm text-gray-700">{optimizationProgress.message}</div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-sky-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${optimizationProgress.percent}%` }}
                />
              </div>
              <div className="text-xs text-slate-400 text-right">
                {Math.round(optimizationProgress.percent)}%
              </div>
            </div>
          </div>
        </div>
      )}


      <ErrorBoundary
        fallback={
          <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-center">
            <p className="text-red-300">Error loading header</p>
          </div>
        }
      >
        <Header
          hasData={!!pdfFile}
          onOpenSettings={() => setIsSettingsOpen(true)}
          pdfDoc={pdfDoc}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          onToggleSidePanel={() => setIsSidePanelVisible(p => !p)}
        />
      </ErrorBoundary>
      <main className="flex-grow overflow-hidden">
        {mainContent()}
      </main>
      {isSettingsOpen && (
        <ErrorBoundary
          fallback={
            <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
              <div className="bg-white rounded-lg p-6 shadow-lg">
                <p className="text-red-300 mb-4">Error loading settings modal</p>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                >
                  Close
                </button>
              </div>
            </div>
          }
        >
          <SettingsModal 
            patterns={patterns}
            tolerances={tolerances}
            appSettings={appSettings}
            colorSettings={colorSettings}
            onSaveOnly={handleSaveSettingsOnly}
            onSaveAndRescan={handleSaveSettingsAndRescan}
            onClose={() => setIsSettingsOpen(false)}
          />
        </ErrorBoundary>
      )}
      <ConfirmModal 
        isOpen={confirmation.isOpen}
        message={confirmation.message}
        onConfirm={handleConfirm}
        onCancel={handleCloseConfirmation}
      />
    </div>
  );
};

export default App;
