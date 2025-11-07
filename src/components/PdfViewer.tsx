import React, { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { RelationshipType, Category, type AppSettings } from '../types.ts';
import { CATEGORY_COLORS, DEFAULT_COLORS } from '../constants.ts';
import { TagHighlight, getHighlightTypeFromEntity, getHighlightEffect } from './TagHighlight.tsx';
import { v4 as uuidv4 } from 'uuid';

// Throttle function for performance
const throttle = (func, delay) => {
  let timeoutId;
  let lastExecTime = 0;
  return (...args) => {
    const currentTime = Date.now();
    if (currentTime - lastExecTime > delay) {
      func(...args);
      lastExecTime = currentTime;
    }
  };
};

// Memoized relationship line component for performance
const RelationshipLine = React.memo(({ rel, start, end, strokeColor, marker, isPinged }: {
  rel: any;
  start: { x: number; y: number };
  end: { x: number; y: number };
  strokeColor: string;
  marker: string;
  isPinged: boolean;
}) => {
  const lineStrokeWidth = isPinged ? '4' : rel.type === RelationshipType.Note ? '2.5' : '2';
  const lineStrokeColor = isPinged ? '#ef4444' : strokeColor;
  const dashArray = isPinged ? 'none' :
    (rel.type === RelationshipType.Annotation || rel.type === RelationshipType.Note ? '3 3' : 'none');

  // Add special styling for NOTE relationships
  const isNoteRelationship = rel.type === RelationshipType.Note;

  return (
    <g>
      {/* Add subtle glow for NOTE relationships */}
      {isNoteRelationship && !isPinged && (
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={lineStrokeColor}
          strokeWidth="6"
          strokeOpacity="0.15"
          strokeDasharray="none"
          strokeLinecap="round"
        />
      )}
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={lineStrokeColor}
        strokeWidth={lineStrokeWidth}
        strokeDasharray={dashArray}
        markerEnd={marker}
        className={isPinged ? 'ping-highlight-line' : isNoteRelationship ? 'note-connection-line' : ''}
        strokeLinecap={isNoteRelationship ? 'round' : 'butt'}
      />
      {isPinged && (
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke="#ef4444"
          strokeWidth="8"
          strokeOpacity="0.3"
          strokeDasharray="none"
          className="ping-highlight-line-glow"
        />
      )}
    </g>
  );
});

const PdfViewerComponent = ({
  pdfDoc,
  tags,
  setTags,
  relationships,
  setRelationships,
  currentPage,
  setCurrentPage,
  selectedTagIds,
  setSelectedTagIds,
  selectedDescriptionIds,
  setSelectedDescriptionIds,
  rawTextItems,
  descriptions,
  onCreateTag,
  onCreateDescription,
  onCreateHoldDescription,
  selectedRawTextItemIds,
  setSelectedRawTextItemIds,
  onDeleteTags,
  onMergeRawTextItems,
  onManualCreateLoop,
  onManualAreaSelect,
  onUpdateTagText,
  onUpdateRawTextItemText,
  // Viewer state from props
  scale,
  setScale,
  mode,
  setMode,
  relationshipStartTag,
  setRelationshipStartTag,
  visibilitySettings,
  updateVisibilitySettings,
  pingedTagId,
  pingedDescriptionId,
  pingedRelationshipId,
  colorSettings,
  scrollToCenter,
  setScrollToCenter,
  showAutoLinkRanges,
  tolerances,
  showAllRelationships,
  setShowAllRelationships,
  showOnlySelectedRelationships,
  setShowOnlySelectedRelationships,
  onOPCTagClick,
  detectedLines = [],
  appSettings,                 // <<< ADD
}) => {
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const startPoint = useRef({ x: 0, y: 0 });
  const isClickOnItem = useRef(false); // Ref to track if mousedown was on an item
  
  const [viewport, setViewport] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false); // For selection rect
  const [selectionRect, setSelectionRect] = useState(null);
  const [relatedTagIds, setRelatedTagIds] = useState(new Set());
  const [highlightedRawTextItemIds, setHighlightedRawTextItemIds] = useState(new Set());
  
  // Editing state
  const [editingTagId, setEditingTagId] = useState(null);
  const [editingRawTextId, setEditingRawTextId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const editInputRef = useRef(null);
  
  // Timer for auto-clearing tag selection highlight
  const selectionTimerRef = useRef(null);
  
  // OPC Navigation state
  const [opcNavigationButton, setOpcNavigationButton] = useState(null); // { tagId, x, y, targetTagId, targetPage }
  const [pendingOpcTarget, setPendingOpcTarget] = useState(null); // { targetTagId, targetPage }
  
  // OPC Navigation function
  const handleOpcNavigation = useCallback(() => {
    
    if (opcNavigationButton) {
      const { targetTagId, targetPage } = opcNavigationButton;
      
      
      // Set pending target for after page change
      setPendingOpcTarget({ targetTagId, targetPage });
      
      // Navigate to target page
      setCurrentPage(targetPage);
      
      // Hide navigation button
      setOpcNavigationButton(null);
      
    } else {
    }
  }, [opcNavigationButton, setCurrentPage, currentPage]);
  
  // Handle OPC target selection after page change
  useEffect(() => {
    
    if (pendingOpcTarget && currentPage === pendingOpcTarget.targetPage && viewport) {
      const { targetTagId } = pendingOpcTarget;
      
      // Check if target tag exists on current page
      const targetTag = tags.find(t => t.id === targetTagId && t.page === currentPage);
      
      
      if (targetTag) {
        
        // Wait for page to render, then select, highlight, and scroll to center
        const timer = setTimeout(() => {
          
          // Set selection
          setSelectedTagIds([targetTagId]);
          
          // Set highlight
          setHighlightedTagIds(new Set([targetTagId]));
          
          // Scroll to center the target tag
          const scrollData = { tagId: targetTagId, timestamp: Date.now() };
          setScrollToCenter(scrollData);
          
          
          // Clear pending target AFTER processing is complete
          setPendingOpcTarget(null);
          
          // Clear highlight after 2 seconds
          setTimeout(() => {
            setHighlightedTagIds(new Set());
          }, 2000);
        }, 300); // Increased delay further
        
        return () => clearTimeout(timer);
      } else {
      }
    }
  }, [currentPage, pendingOpcTarget, viewport, tags, setSelectedTagIds, setScrollToCenter]);
  
  // State to track visual highlight separately from selection
  const [highlightedTagIds, setHighlightedTagIds] = useState(new Set());

  // Focus input when editing starts
  useEffect(() => {
    if ((editingTagId || editingRawTextId) && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTagId, editingRawTextId]);

  // Sync highlighted tags with selected tags
  useEffect(() => {
    if (selectedTagIds.length > 0) {
      setHighlightedTagIds(new Set(selectedTagIds));
    } else {
      setHighlightedTagIds(new Set()); // Clear highlights when no tags selected
    }
  }, [selectedTagIds]);

  // Auto-clear tag highlight (not selection) after 3 seconds
  useEffect(() => {
    // Clear existing timer
    if (selectionTimerRef.current) {
      clearTimeout(selectionTimerRef.current);
      selectionTimerRef.current = null;
    }

    // Only set timer if tags are highlighted
    if (highlightedTagIds.size > 0) {
      selectionTimerRef.current = setTimeout(() => {
        setHighlightedTagIds(new Set()); // Clear highlight only
        selectionTimerRef.current = null;
      }, 3000); // 3 seconds
    }

    // Cleanup timer on component unmount
    return () => {
      if (selectionTimerRef.current) {
        clearTimeout(selectionTimerRef.current);
        selectionTimerRef.current = null;
      }
    };
  }, [highlightedTagIds]);

  // Handle editing completion
  const handleEditComplete = useCallback((save = true) => {
    if (save && editingText.trim()) {
      if (editingTagId) {
        onUpdateTagText(editingTagId, editingText.trim());
      } else if (editingRawTextId) {
        onUpdateRawTextItemText(editingRawTextId, editingText.trim());
      }
    }
    
    // Clear editing state
    setEditingTagId(null);
    setEditingRawTextId(null);
    setEditingText('');
  }, [editingTagId, editingRawTextId, editingText, onUpdateTagText, onUpdateRawTextItemText]);

  // Handle input key events
  const handleEditInputKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEditComplete(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleEditComplete(false);
    }
  }, [handleEditComplete]);

  const linkedRawTextItemIds = useMemo(() => {
    // Get all NOTE tags that are connected to instruments
    const connectedNoteTags = new Set(
      relationships
        .filter((r: any) => r.type === RelationshipType.Note)
        .map((r: any) => r.to)
    );

    // Only include raw text items that are annotated by connected NOTE tags
    return new Set(
      relationships
        .filter((r: any) => {
          if (r.type !== RelationshipType.Annotation) return false;
          // Check if the source tag (r.from) is a connected NOTE tag
          return connectedNoteTags.has(r.from);
        })
        .map((r: any) => r.to)
    );
  }, [relationships]);

  // Use colorSettings with fallback to DEFAULT_COLORS and ensure all properties exist
  const colors = {
    entities: { ...DEFAULT_COLORS.entities, ...(colorSettings?.entities || {}) },
    relationships: { ...DEFAULT_COLORS.relationships, ...(colorSettings?.relationships || {}) },
    highlights: { ...DEFAULT_COLORS.highlights, ...(colorSettings?.highlights || {}) }
  };

  // Helper function to get entity color
  const getEntityColor = useCallback((category) => {
    switch (category) {
      case Category.Line:
        return colors.entities.line;
      case Category.Instrument:
        return colors.entities.instrument;
      case Category.DrawingNumber:
        return colors.entities.drawingNumber;
      case Category.NotesAndHolds:
        return colors.entities.notesAndHolds;
      default:
        return colors.entities.uncategorized;
    }
  }, [colors]);

  // Helper function to get relationship color
  const getRelationshipColor = useCallback((type) => {
    switch (type) {
      case RelationshipType.Connection:
        return colors.relationships.connection;
      case RelationshipType.Installation:
        return colors.relationships.installation;
      case RelationshipType.Annotation:
        return colors.relationships.annotation;
      case RelationshipType.Note:
        return colors.relationships.note;
      default:
        return '#94a3b8'; // Default slate color
    }
  }, [colors]);

  // Helper function to check if a tag should be visible
  const isTagVisible = useCallback((tag) => {
    switch (tag.category) {
      case Category.Line:
        return visibilitySettings.tags.line;
      case Category.Instrument:
        return visibilitySettings.tags.instrument;
      case Category.DrawingNumber:
        return visibilitySettings.tags.drawingNumber;
      case Category.NotesAndHolds:
        return visibilitySettings.tags.notesAndHolds;
      default:
        return true;
    }
  }, [visibilitySettings.tags]);

  // Helper function to check if a relationship should be visible
  const isRelationshipVisible = useCallback((relationship) => {
    switch (relationship.type) {
      case RelationshipType.Connection:
        return visibilitySettings.relationships.connection;
      case RelationshipType.Installation:
        return visibilitySettings.relationships.installation;
      case RelationshipType.Annotation:
        return visibilitySettings.relationships.annotation;
      case RelationshipType.Note:
        return visibilitySettings.relationships.note;
      case RelationshipType.Description:
        return false; // Always hide Description relationship lines
      default:
        return true;
    }
  }, [visibilitySettings.relationships]);

  const isMoved = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ scrollX: 0, scrollY: 0, clientX: 0, clientY: 0 });

  const renderTaskRef = useRef(null);
  const renderIdRef = useRef(0);
  const renderQueueRef = useRef(Promise.resolve());

  const renderPage = useCallback(async (pageNumber) => {
    if (!pdfDoc) return;

    // Generate unique render ID for this operation
    const currentRenderId = ++renderIdRef.current;
    
    // Queue this render operation to prevent concurrent renders
    renderQueueRef.current = renderQueueRef.current.then(async () => {
      // Check if this render is still current (not superseded by newer render)
      if (renderIdRef.current !== currentRenderId) {
        return; // Skip this render as a newer one has been queued
      }

      // Cancel any existing render task
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // Ignore cancel errors
        }
        renderTaskRef.current = null;
        
        // Small delay to ensure cancellation completes
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      try {
        const page = await pdfDoc.getPage(pageNumber);
        
        // Check again if this render is still current
        if (renderIdRef.current !== currentRenderId) {
          return;
        }
        
        const vp = page.getViewport({ scale });
        const canvas = canvasRef.current;
        
        if (!canvas) return;
        
        const context = canvas.getContext('2d');
        if (!context) return;

        // Clear and resize canvas
        context.clearRect(0, 0, canvas.width, canvas.height);
        canvas.height = vp.height;
        canvas.width = vp.width;
        context.clearRect(0, 0, canvas.width, canvas.height);

        // Final check before starting render
        if (renderIdRef.current !== currentRenderId) {
          return;
        }

        const renderContext = {
          canvasContext: context,
          viewport: vp,
        };
        
        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;
        
        // Only update state if this render is still current
        if (renderIdRef.current === currentRenderId) {
          setViewport(vp);
          setRotation(vp.rotation);
        }
        
      } catch (error) {
        if (error.name !== 'RenderingCancelledException') {
        }
      } finally {
        if (renderTaskRef.current) {
          renderTaskRef.current = null;
        }
      }
    });

    return renderQueueRef.current;
  }, [pdfDoc, scale]);

  useLayoutEffect(() => {
    renderPage(currentPage);
    
    // Cleanup function to cancel render task on unmount or dependency change
    return () => {
      // Invalidate current render ID to cancel any queued renders
      renderIdRef.current++;
      
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (e) {
          // Ignore cancel errors
        }
        renderTaskRef.current = null;
      }
    };
  }, [currentPage, renderPage, scale]); // Rerender on scale change

  useEffect(() => {
    let newRelatedTagIds = new Set();
    let newHighlightedNoteIds = new Set();

    if (selectedTagIds.length > 0) {
      // For related notes (annotations), show for any selection
      newHighlightedNoteIds = new Set(
        relationships
          .filter(r => r.type === RelationshipType.Annotation && selectedTagIds.includes(r.from))
          .map(r => r.to)
      );

      // For related instruments (installed on Equipment/Line), only show for single selection
      if (selectedTagIds.length === 1) {
        const selectedTag = tags.find(t => t.id === selectedTagIds[0]);
        if (selectedTag && (selectedTag.category === Category.Instrument || selectedTag.category === Category.Line)) {
          newRelatedTagIds = new Set(
            relationships
              .filter(r => r.type === RelationshipType.Installation && r.to === selectedTag.id)
              .map(r => r.from)
          );
        }
      }
    }
    
    setRelatedTagIds(newRelatedTagIds);
    setHighlightedRawTextItemIds(newHighlightedNoteIds);
  }, [selectedTagIds, relationships, tags]);


  // Handle scrollToCenter requests
  useEffect(() => {
    if (scrollToCenter && viewport && scrollContainerRef.current) {

      // Find the item to get its coordinates if not provided
      let centerX = scrollToCenter.x;
      let centerY = scrollToCenter.y;

      if (scrollToCenter.tagId && (!scrollToCenter.x || !scrollToCenter.y)) {
        const tag = tags.find(t => t.id === scrollToCenter.tagId);
        if (tag) {
          const { x1, y1, x2, y2 } = tag.bbox;
          const pdfCenterX = (x1 + x2) / 2;
          const pdfCenterY = (y1 + y2) / 2;

          // Transform PDF coordinates to screen coordinates
          const screenCenter = transformPdfCoordinates(pdfCenterX, pdfCenterY);
          centerX = screenCenter.x;
          centerY = screenCenter.y;
        }
      } else if (scrollToCenter.descriptionId && (!scrollToCenter.x || !scrollToCenter.y)) {
        const description = descriptions.find(d => d.id === scrollToCenter.descriptionId);
        if (description) {
          const { x1, y1, x2, y2 } = description.bbox;
          const pdfCenterX = (x1 + x2) / 2;
          const pdfCenterY = (y1 + y2) / 2;

          // Transform PDF coordinates to screen coordinates
          const screenCenter = transformPdfCoordinates(pdfCenterX, pdfCenterY);
          centerX = screenCenter.x;
          centerY = screenCenter.y;
        }
      }

      if (centerX !== undefined && centerY !== undefined) {
        const container = scrollContainerRef.current;
        const containerRect = container.getBoundingClientRect();
        
        // Calculate scroll position to center the target
        const targetScrollLeft = centerX - containerRect.width / 2;
        const targetScrollTop = centerY - containerRect.height / 2;
        
        container.scrollTo({
          left: Math.max(0, targetScrollLeft),
          top: Math.max(0, targetScrollTop),
          behavior: 'smooth'
        });
      }
    }
  }, [scrollToCenter, viewport, tags, rawTextItems]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }
      
      if (e.key === '1') {
        // Line hotkey
        if (selectedRawTextItemIds.length > 0) {
          onCreateTag(rawTextItems.filter(item => selectedRawTextItemIds.includes(item.id)), Category.Line);
          setSelectedRawTextItemIds([]);
        } else {
          onManualAreaSelect();
          setTimeout(() => {
            const event = new CustomEvent('manualTagCreate', { detail: { category: Category.Line } });
            window.dispatchEvent(event);
          }, 100);
        }
        e.preventDefault();
      } else if (e.key === '2') {
        // Line hotkey
        if (selectedRawTextItemIds.length > 0) {
          onCreateTag(rawTextItems.filter(item => selectedRawTextItemIds.includes(item.id)), Category.Line);
          setSelectedRawTextItemIds([]);
        } else {
          onManualAreaSelect();
          setTimeout(() => {
            const event = new CustomEvent('manualTagCreate', { detail: { category: Category.Line } });
            window.dispatchEvent(event);
          }, 100);
        }
        e.preventDefault();
      } else if (e.key === '3') {
        // Special Item hotkey
        if (selectedRawTextItemIds.length > 0) {
          onCreateTag(rawTextItems.filter(item => selectedRawTextItemIds.includes(item.id)), Category.Instrument);
          setSelectedRawTextItemIds([]);
        } else {
          onManualAreaSelect();
          setTimeout(() => {
            const event = new CustomEvent('manualTagCreate', { detail: { category: Category.Instrument } });
            window.dispatchEvent(event);
          }, 100);
        }
        e.preventDefault();
      } else if (e.key === '4') {
        // Instrument hotkey
        if (selectedRawTextItemIds.length > 0) {
          onCreateTag(rawTextItems.filter(item => selectedRawTextItemIds.includes(item.id)), Category.Instrument);
          setSelectedRawTextItemIds([]);
        } else {
          onManualAreaSelect();
          setTimeout(() => {
            const event = new CustomEvent('manualTagCreate', { detail: { category: Category.Instrument } });
            window.dispatchEvent(event);
          }, 100);
        }
        e.preventDefault();
      } else if (e.key === '5') {
        // Note/Hold hotkey
        if (selectedRawTextItemIds.length > 0) {
          onCreateTag(rawTextItems.filter(item => selectedRawTextItemIds.includes(item.id)), Category.NotesAndHolds);
          setSelectedRawTextItemIds([]);
        } else {
          onManualAreaSelect();
          setTimeout(() => {
            const event = new CustomEvent('manualTagCreate', { detail: { category: Category.NotesAndHolds } });
            window.dispatchEvent(event);
          }, 100);
        }
        e.preventDefault();
      } else if (e.key === '6') {
        // OPC hotkey
        if (selectedRawTextItemIds.length > 0) {
          // OPC functionality removed
          // onCreateTag(rawTextItems.filter(item => selectedRawTextItemIds.includes(item.id)), Category.OffPageConnector);
          setSelectedRawTextItemIds([]);
        } else {
          onManualAreaSelect();
          setTimeout(() => {
            // OPC functionality removed
            // const event = new CustomEvent('manualTagCreate', { detail: { category: Category.OffPageConnector } });
            window.dispatchEvent(event);
          }, 100);
        }
        e.preventDefault();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedTagIds.length > 0) {
          e.preventDefault(); // Prevent browser back navigation on Backspace
          onDeleteTags(selectedTagIds);
          setSelectedTagIds([]);
        }
      } else if (e.key === 'F2') {
        // Edit selected tag or raw text
        if (selectedTagIds.length === 1) {
          const tagId = selectedTagIds[0];
          const tag = tags.find(t => t.id === tagId);
          if (tag) {
            setEditingTagId(tagId);
            setEditingRawTextId(null);
            setEditingText(tag.text);
          }
        } else if (selectedRawTextItemIds.length === 1) {
          const rawId = selectedRawTextItemIds[0];
          const rawItem = rawTextItems.find(r => r.id === rawId);
          if (rawItem) {
            setEditingRawTextId(rawId);
            setEditingTagId(null);
            setEditingText(rawItem.text);
          }
        }
        e.preventDefault();
      } else if (e.key.toLowerCase() === 'c') {
        // If multiple tags are selected (2 or more), create sequential connections
        if (selectedTagIds.length >= 2) {
          e.preventDefault();
          
          
          // Get selected tags in selection order (not sorted)
          const selectedTags = selectedTagIds
            .map(id => tags.find(tag => tag.id === id))
            .filter(tag => !!tag);
          
          
          // Create sequential relationships: A→B, B→C, C→D, etc.
          const newRelationships = [];
          for (let i = 0; i < selectedTags.length - 1; i++) {
            const fromTag = selectedTags[i];
            const toTag = selectedTags[i + 1];
            
            
            // Check if relationship already exists
            const existsAlready = relationships.some(r => 
              r.from === fromTag.id && r.to === toTag.id && r.type === RelationshipType.Connection
            );
            
            if (!existsAlready) {
              newRelationships.push({
                id: uuidv4(),
                from: fromTag.id,
                to: toTag.id,
                type: RelationshipType.Connection,
              });
            } else {
            }
          }
          
          
          if (newRelationships.length > 0) {
            setRelationships(prev => [...prev, ...newRelationships]);
          }
          
          // Clear selection after creating relationships
          setSelectedTagIds([]);
          setSelectedRawTextItemIds([]);
        } else {
          // Original behavior for 0-1 selected tags: toggle connect mode
          if (mode === 'connect') {
            setMode('select');
            setRelationshipStartTag(null);
          } else {
            setMode('connect');
            // If exactly one tag is selected, use it as the start tag
            if (selectedTagIds.length === 1) {
              const startTag = tags.find(t => t.id === selectedTagIds[0]);
              setRelationshipStartTag(selectedTagIds[0]);
              // Keep the selection to show visually
            } else {
              setRelationshipStartTag(null);
              setSelectedTagIds([]);
            }
            setSelectedRawTextItemIds([]);
          }
        }
      } else if (e.key.toLowerCase() === 'k') {
        if (mode === 'manualCreate') {
          setMode('select');
        } else {
          setMode('manualCreate');
          setRelationshipStartTag(null);
          setSelectedTagIds([]);
          setSelectedRawTextItemIds([]);
        }
      } else if (e.key === 'Escape') {
        setMode('select');
        setRelationshipStartTag(null);
        setSelectedTagIds([]);
        setSelectedRawTextItemIds([]);
      } else if (e.key.toLowerCase() === 'm') {
        if (selectedRawTextItemIds.length >= 2) {
          onMergeRawTextItems(selectedRawTextItemIds);
          setSelectedRawTextItemIds([]);
        } else {
          alert("The 'M' hotkey merges multiple selected text items into one. Select at least 2 text items first.");
        }
      } else if (e.key.toLowerCase() === 'n') {
        const selectedTags = tags.filter(tag => selectedTagIds.includes(tag.id));
        const selectedRawItems = rawTextItems.filter(item => selectedRawTextItemIds.includes(item.id));
        const allSelectedItems = [...selectedTags, ...selectedRawItems];
        
        if (allSelectedItems.length > 0) {
          onCreateDescription(allSelectedItems);
          setSelectedTagIds([]);
          setSelectedRawTextItemIds([]);
        } else {
          alert("Select tags or text items first, then press 'N' to create a description.");
        }
      } else if (e.key.toLowerCase() === 'h') {
        const selectedTags = tags.filter(tag => selectedTagIds.includes(tag.id));
        const selectedRawItems = rawTextItems.filter(item => selectedRawTextItemIds.includes(item.id));
        const allSelectedItems = [...selectedTags, ...selectedRawItems];
        
        if (allSelectedItems.length > 0) {
          onCreateHoldDescription(allSelectedItems);
          setSelectedTagIds([]);
          setSelectedRawTextItemIds([]);
        } else {
          alert("Select tags or text items first, then press 'H' to create a hold description.");
        }
      } else if (e.key.toLowerCase() === 'r' && mode === 'select' && (selectedTagIds.length > 0 || selectedRawTextItemIds.length > 0)) {
        const newRelationships = [];
        const selected = tags.filter(t => selectedTagIds.includes(t.id));
        
        // Specifically identify Equipment, Line, or Instrument tags
        const itemTagCategories = [Category.Instrument, Category.Line];
        const itemTags = selected.filter(t => itemTagCategories.includes(t.category));

        // VALIDATION: Ensure at most one item tag is selected
        if (itemTags.length > 1) {
            alert("Please select only one Equipment, Line, or Instrument tag at a time to create relationships.");
            return; // Stop processing
        }
        
        // Proceed if there is exactly one item tag.
        if (itemTags.length === 1) {
            const itemTag = itemTags[0];
            const noteTags = selected.filter(t => t.category === Category.NotesAndHolds);

            // Create Note relationships ONLY if within diagonal radius (for Instrument tags)
            if (itemTag.category === Category.Instrument) {
                // Calculate center of instrument bbox
                const instrumentCenter = {
                    x: (itemTag.bbox.x1 + itemTag.bbox.x2) / 2,
                    y: (itemTag.bbox.y1 + itemTag.bbox.y2) / 2
                };

                // Calculate diagonal radius of instrument bbox (3x for better range)
                const width = itemTag.bbox.x2 - itemTag.bbox.x1;
                const height = itemTag.bbox.y2 - itemTag.bbox.y1;
                const diagonalRadius = Math.sqrt(width * width + height * height) / 2 * 3;

                
                

                // Helper function: Check if a circle intersects with a rectangle
                const circleIntersectsRectangle = (circleCenter, radius, rect) => {
                    // Find the closest point on the rectangle to the circle center
                    const closestX = Math.max(rect.x1, Math.min(circleCenter.x, rect.x2));
                    const closestY = Math.max(rect.y1, Math.min(circleCenter.y, rect.y2));

                    // Calculate distance from circle center to closest point
                    const distX = circleCenter.x - closestX;
                    const distY = circleCenter.y - closestY;
                    const distance = Math.sqrt(distX * distX + distY * distY);

                    
                    return distance <= radius;
                };

                // Only connect NOTE tags within the diagonal radius
                for (const noteTag of noteTags) {
                    if (circleIntersectsRectangle(instrumentCenter, diagonalRadius, noteTag.bbox)) {
                        newRelationships.push({
                            id: uuidv4(),
                            from: itemTag.id,
                            to: noteTag.id,
                            type: RelationshipType.Note,
                        });
                        
                    } else {
                        
                    }
                }
            } else {
                // For Line tags, use the old behavior (connect all selected)
                for (const noteTag of noteTags) {
                    newRelationships.push({
                        id: uuidv4(),
                        from: itemTag.id,
                        to: noteTag.id,
                        type: RelationshipType.Note,
                    });
                }
            }
            
            // Create Annotation relationships (item -> raw text)
            for (const rawId of selectedRawTextItemIds) {
                newRelationships.push({
                    id: uuidv4(),
                    from: itemTag.id,
                    to: rawId,
                    type: RelationshipType.Annotation,
                });
            }
        }
        
        if (newRelationships.length > 0) {
            const existingRels = new Set(relationships.map(r => `${r.from}-${r.to}-${r.type}`));
            const uniqueNewRels = newRelationships.filter(r => !existingRels.has(`${r.from}-${r.to}-${r.type}`));
    
            if (uniqueNewRels.length > 0) {
                setRelationships(prev => [...prev, ...uniqueNewRels]);
            }
            setSelectedTagIds([]);
            setSelectedRawTextItemIds([]);
        }
      } else if (e.key.toLowerCase() === 'i' && mode === 'select' && selectedTagIds.length > 1) {
        const selected = tags.filter(t => selectedTagIds.includes(t.id));
        const baseTags = selected.filter(t => t.category === Category.Instrument || t.category === Category.Line);
        const instrumentTags = selected.filter(t => t.category === Category.Instrument);

        if (baseTags.length === 1 && instrumentTags.length >= 1) {
          const baseTag = baseTags[0];
          const newRelationships = instrumentTags.map(inst => ({
            id: uuidv4(),
            from: inst.id,
            to: baseTag.id,
            type: RelationshipType.Installation,
          }));
          
          const existingRels = new Set(relationships.map(r => `${r.from}-${r.to}-${r.type}`));
          const uniqueNewRels = newRelationships.filter(r => !existingRels.has(`${r.from}-${r.to}-${r.type}`));

          if (uniqueNewRels.length > 0) {
              setRelationships(prev => [...prev, ...uniqueNewRels]);
          }
          setSelectedTagIds([]);
        } else {
        }
      } else if (e.key.toLowerCase() === 'l' && mode === 'select' && selectedTagIds.length >= 2) {
        const selectedInstrumentTags = tags.filter(t => 
          selectedTagIds.includes(t.id) && t.category === Category.Instrument
        );
        
        if (selectedInstrumentTags.length >= 2) {
          if (onManualCreateLoop) {
            onManualCreateLoop(selectedTagIds);
            setSelectedTagIds([]);
          }
        } else {
        }
      } else if (e.key.toLowerCase() === 'v') {
        // Toggle all relationships visibility
        const allRelationshipsVisible = Object.values(visibilitySettings.relationships).every(Boolean);
        const newState = !allRelationshipsVisible;
        updateVisibilitySettings({
          relationships: {
            connection: newState,
            installation: newState,
            annotation: newState,
            note: newState,
          },
        });
      } else if (e.key.toLowerCase() === 'q' && pdfDoc) {
        // Previous page
        setCurrentPage(prev => Math.max(1, prev - 1));
      } else if (e.key.toLowerCase() === 'w' && pdfDoc) {
        // Next page
        setCurrentPage(prev => Math.min(pdfDoc.numPages, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, selectedTagIds, tags, relationships, setRelationships, setSelectedTagIds, rawTextItems, selectedRawTextItemIds, onCreateTag, onCreateDescription, onCreateHoldDescription, setSelectedRawTextItemIds, onDeleteTags, onMergeRawTextItems, onManualCreateLoop, setMode, setRelationshipStartTag, scale, pdfDoc, setCurrentPage]);
  
  // Add wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    const handleWheelEvent = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? -0.25 : 0.25;
        setScale(prevScale => Math.min(10, Math.max(0.25, prevScale + zoomDelta)));
      }
    };

    viewer.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => {
      viewer.removeEventListener('wheel', handleWheelEvent);
    };
  }, [scale]);

  useLayoutEffect(() => {
    if (selectedTagIds.length === 1 && scrollContainerRef.current && viewport) {
      const tagId = selectedTagIds[0];
      const tag = tags.find(t => t.id === tagId);

      if (tag && tag.page === currentPage) {
        // Use the unified scrollToCenter approach with proper rotation handling
        setTimeout(() => {
          setScrollToCenter({ tagId: tag.id, timestamp: Date.now() });
          setTimeout(() => setScrollToCenter(null), 100);
        }, 50);
      }
    }
  }, [selectedTagIds, currentPage, viewport, tags, scale, setScrollToCenter]);

  // Auto-scroll to pinged tag - now handled by scrollToCenter in Workspace
  // This useLayoutEffect is no longer needed as pinged tag scrolling is handled by scrollToCenter

  // Auto-scroll to selected description
  useLayoutEffect(() => {
    if (selectedDescriptionIds.length === 1 && scrollContainerRef.current && viewport) {
      const descriptionId = selectedDescriptionIds[0];
      const description = descriptions.find(d => d.id === descriptionId);
      if (description && description.page === currentPage) {
        // Use the unified scrollToCenter approach with proper rotation handling
        setTimeout(() => {
          setScrollToCenter({ descriptionId: description.id, timestamp: Date.now() });
          setTimeout(() => setScrollToCenter(null), 100);
        }, 50);
      }
    }
  }, [selectedDescriptionIds, descriptions, currentPage, viewport, scale, setScrollToCenter]);

  ;

  const handleRawTextItemMouseDown = (e, rawTextItemId) => {
    e.stopPropagation();
    isClickOnItem.current = true;
    const isMultiSelect = e.ctrlKey || e.metaKey;

    // Debug raw text item selection
    const clickedItem = rawTextItems.find(item => item.id === rawTextItemId);
    if (clickedItem) {
        
        

        // Check if it matches Drawing Number pattern for debugging
        const drawingNumberPattern = /[A-Z\d-]{5,}-[A-Z\d-]{5,}-\d{3,}/i;
        if (drawingNumberPattern.test(clickedItem.text)) {
            
        }
    }

    // Check if this raw text item is part of a note description (Annotation relationship)
    const noteRelationship = relationships.find(r =>
        r.type === RelationshipType.Annotation && r.to === rawTextItemId
    );

    if (noteRelationship && !isMultiSelect) {
        // This is part of a note description - find all items for the same note
        const noteTagId = noteRelationship.from;
        const noteTag = tags.find(t => t.id === noteTagId);

        if (noteTag) {
            

            // Find all raw text items that belong to this note
            const allNoteItemIds = relationships
                .filter(r => r.type === RelationshipType.Annotation && r.from === noteTagId)
                .map(r => r.to);

            

            // Select all items belonging to this note
            setSelectedRawTextItemIds(allNoteItemIds);
            setSelectedTagIds([noteTagId]); // Also select the NOTE tag to show the connection
        }
    } else if (isMultiSelect) {
        // Add to or remove from raw text selection without affecting tag selection
        setSelectedRawTextItemIds(prev =>
            prev.includes(rawTextItemId) ? prev.filter(id => id !== rawTextItemId) : [...prev, rawTextItemId]
        );
    } else {
        // A single click replaces the entire selection with just this one raw text item.
        setSelectedRawTextItemIds([rawTextItemId]);
        setSelectedTagIds([]);
    }
  };

  // Show all tags for interaction, but apply different styling based on visibility
  // Memoize current page tags for performance
  const currentTags = useMemo(() => 
    tags.filter(t => t.page === currentPage),
    [tags, currentPage]
  );
  // Memoize current page raw text items for performance
  const currentRawTextItems = useMemo(() => 
    rawTextItems.filter(t => t.page === currentPage),
    [rawTextItems, currentPage]
  );
  
  // Memoize current page descriptions for performance
  const currentDescriptions = useMemo(() =>
    descriptions.filter(desc => desc.page === currentPage),
    [descriptions, currentPage]
  );

  const handleViewerMouseDown = (e) => {
    if (
      (e.target as Element).closest('[data-tag-id]') ||
      (e.target as Element).closest('[data-raw-text-id]')
    ) {
      // The item's own onMouseDown will fire and set the isClickOnItem ref.
      return;
    }
  
    isClickOnItem.current = false; // A true background click
    isMoved.current = false;
    
    // Hide OPC navigation button on background click
    setOpcNavigationButton(null);
  
    if (mode === 'manualCreate' && viewerRef.current) {
        const rect = viewerRef.current.getBoundingClientRect();
        startPoint.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        setIsDragging(true); // this is for selectionRect
        setSelectionRect({ ...startPoint.current, width: 0, height: 0 });
        return; // Prevent other logic from running
    }
    
    const isSelectionModifier = e.ctrlKey || e.metaKey;

    if (isSelectionModifier && mode === 'select' && viewerRef.current) {
        // Area Selection Logic
        const rect = viewerRef.current.getBoundingClientRect();
        startPoint.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        setIsDragging(true);
        setSelectionRect({ ...startPoint.current, width: 0, height: 0 });
    } else if (!isSelectionModifier && mode === 'select' && scrollContainerRef.current) {
        // Panning Logic
        setIsPanning(true);
        panStart.current = {
            scrollX: scrollContainerRef.current.scrollLeft,
            scrollY: scrollContainerRef.current.scrollTop,
            clientX: e.clientX,
            clientY: e.clientY,
        };
        e.preventDefault();
    }
  };



  const handleMouseMove = (e) => {
    if (isPanning || isDragging) {
      isMoved.current = true;
    }

    if (isPanning && scrollContainerRef.current) {
      const dx = e.clientX - panStart.current.clientX;
      const dy = e.clientY - panStart.current.clientY;
      scrollContainerRef.current.scrollLeft = panStart.current.scrollX - dx;
      scrollContainerRef.current.scrollTop = panStart.current.scrollY - dy;
      return;
    }

    if (isDragging && viewerRef.current) {
      const rect = viewerRef.current.getBoundingClientRect();
      const currentX = e.clientX - rect.left;
      const currentY = e.clientY - rect.top;
  
      const x = Math.min(startPoint.current.x, currentX);
      const y = Math.min(startPoint.current.y, currentY);
      const width = Math.abs(startPoint.current.x - currentX);
      const height = Math.abs(startPoint.current.y - currentY);
      setSelectionRect({ x, y, width, height });
    }
  };

  const handleMouseUp = (e) => {
    // If the interaction started on an item, don't clear selection or process area selection.
    // This is more robust than checking e.target on mouseup, which can be affected by re-renders.
    if (isClickOnItem.current) {
      if (isDragging) { // This can happen if user clicks item and drags off
        setIsDragging(false);
        setSelectionRect(null);
      }
      return;
    }
      
    if (isPanning) {
      setIsPanning(false);
    }
    
    // A simple click on the background without movement clears selection
    if (!isMoved.current && !isDragging) {
        setSelectedTagIds([]);
        setSelectedRawTextItemIds([]);
    }

    if (!isDragging || !selectionRect || !viewport) {
      if (isDragging) setIsDragging(false);
      return;
    }
    
    if (mode === 'manualCreate') {
        setIsDragging(false);
        // Check for minimal size to avoid accidental clicks
        if (selectionRect.width > 5 && selectionRect.height > 5) {
            const { x, y, width, height } = selectionRect;
            const bbox = {
                x1: x / scale,
                y1: y / scale,
                x2: (x + width) / scale,
                y2: (y + height) / scale,
            };
            onManualAreaSelect(bbox, currentPage);
        }
        setSelectionRect(null);
        setMode('select');
        return;
    }

    setIsDragging(false);
    
    // Area selection can add both tags and raw items
    const intersectingTags = new Set<string>();
    for (const tag of currentTags) {
      const { x1, y1, x2, y2 } = tag.bbox;
      const tagRect = {
        x: x1 * scale,
        y: y1 * scale,
        width: (x2 - x1) * scale,
        height: (y2 - y1) * scale
      };
      if (
        selectionRect.x < tagRect.x + tagRect.width &&
        selectionRect.x + selectionRect.width > tagRect.x &&
        selectionRect.y < tagRect.y + tagRect.height &&
        selectionRect.y + selectionRect.height > tagRect.y
      ) {
        intersectingTags.add(tag.id);
      }
    }
    if(intersectingTags.size > 0){
        setSelectedTagIds(prev => Array.from(new Set([...prev, ...intersectingTags])));
    } 
    
    const intersectingRawItems = new Set<string>();
    for (const item of currentRawTextItems) {
        const { x1, y1, x2, y2 } = item.bbox;
        const itemRect = {
            x: x1 * scale,
            y: y1 * scale,
            width: (x2 - x1) * scale,
            height: (y2 - y1) * scale
        };
        if (
            selectionRect.x < itemRect.x + itemRect.width &&
            selectionRect.x + selectionRect.width > itemRect.x &&
            selectionRect.y < itemRect.y + itemRect.height &&
            selectionRect.y + selectionRect.height > itemRect.y
        ) {
            intersectingRawItems.add(item.id);
        }
    }
    if (intersectingRawItems.size > 0) {
        setSelectedRawTextItemIds(prev => Array.from(new Set([...prev, ...intersectingRawItems])));
    }

    setSelectionRect(null);
  };
  
  const getTagCenter = (tag) => {
    if (!viewport || !tag || !tag.bbox) return { x: 0, y: 0 };
    
    // Get the center coordinates in PDF coordinate system
    const pdfCenterX = (tag.bbox.x1 + tag.bbox.x2) / 2;
    const pdfCenterY = (tag.bbox.y1 + tag.bbox.y2) / 2;
    
    // Transform based on rotation
    let screenX, screenY;
    
    switch (rotation) {
      case 90:
        screenX = pdfCenterY * scale;
        screenY = pdfCenterX * scale;
        break;
      case 180:
        // For 180-degree rotation, coordinates are already transformed in taggingService
        // Use them directly without additional transformation
        screenX = pdfCenterX * scale;
        screenY = pdfCenterY * scale;
        break;
      case 270:
        // For 270-degree rotation, coordinates are already transformed in taggingService
        // Use them directly without additional transformation
        screenX = pdfCenterX * scale;
        screenY = pdfCenterY * scale;
        break;
      default: // 0 degrees
        // For non-rotated documents, coordinates are already flipped in taggingService
        screenX = pdfCenterX * scale;
        screenY = pdfCenterY * scale;
        break;
    }
    
    return { x: screenX, y: screenY };
  };

  // Create lookup maps for better performance
  const tagsMap = useMemo(() => new Map(tags.map((t: any) => [t.id, t])), [tags]);
  const rawTextMap = useMemo(() => new Map(rawTextItems.map((i: any) => [i.id, i])), [rawTextItems]);
  
  // Memoize current relationships with pre-calculated rendering data and smart filtering
  const currentRelationshipsWithData = useMemo(() => {
    // First check master toggle - if OFF, return empty array for performance
    if (!showAllRelationships) return [];
    
    const visibleRelationships = [];
    
    for (const r of relationships) {
      // 🚀 Performance: Only process Connection and Installation relationships
      // Skip LineAssociation as they shouldn't be visually rendered
      if (r.type !== RelationshipType.Connection &&
          r.type !== RelationshipType.Installation) {
        continue; // Skip other relationship types entirely
      }
      
      // Check if this relationship type should be visible
      if (!isRelationshipVisible(r)) continue;
      
      const fromTag = tagsMap.get(r.from) as any;
      if (!fromTag || fromTag.page !== currentPage) continue;

      // Connection/Installation relationships are always Tag → Tag
      const toTag = tagsMap.get(r.to) as any;
      if (!toTag || toTag.page !== currentPage) continue;

      // Smart filtering for selected entities only
      if (showOnlySelectedRelationships && selectedTagIds.length > 0) {
        const isFromSelected = selectedTagIds.includes(fromTag?.id || '');
        const isToSelected = selectedTagIds.includes(toTag?.id || '');
        
        if (!isFromSelected && !isToSelected) continue;
      }
      
      // Pre-calculate rendering data
      visibleRelationships.push({
        rel: r,
        fromTag,
        toItem: toTag,
        isAnnotation: false // Connection/Installation are never annotations
      });
    }
    
    return visibleRelationships;
  }, [relationships, tagsMap, currentPage, visibilitySettings.relationships, showAllRelationships, showOnlySelectedRelationships, selectedTagIds]);
  
  const getAnnotationTargetCenter = (rawTextItemId) => {
      if (!viewport) return { x: 0, y: 0 };
      const item = rawTextMap.get(rawTextItemId) as any;
      if (!item) return { x: 0, y: 0 };
      
      // Get the center coordinates in PDF coordinate system
      const pdfCenterX = ((item.bbox?.x1 || 0) + (item.bbox?.x2 || 0)) / 2;
      const pdfCenterY = ((item.bbox?.y1 || 0) + (item.bbox?.y2 || 0)) / 2;
      
      // Transform based on rotation
      let screenX, screenY;
      
      switch (rotation) {
        case 90:
          screenX = pdfCenterY * scale;
          screenY = pdfCenterX * scale;
          break;
        case 180:
          screenX = (viewport.width / scale - pdfCenterX) * scale;
          screenY = (viewport.height / scale - pdfCenterY) * scale;
          break;
        case 270:
          // For 270-degree rotation, coordinates are already transformed in taggingService
          // Use them directly without additional transformation
          screenX = pdfCenterX * scale;
          screenY = pdfCenterY * scale;
          break;
        default: // 0 degrees
          // For non-rotated documents, coordinates are already flipped in taggingService
          screenX = pdfCenterX * scale;
          screenY = pdfCenterY * scale;
          break;
      }
      
      return { x: screenX, y: screenY };
  }

  // Helper function to transform PDF coordinates to screen coordinates
  const transformPdfCoordinates = (pdfCenterX, pdfCenterY) => {
    if (!viewport) return { x: 0, y: 0 };
    
    let screenX, screenY;
    
    switch (rotation) {
      case 90:
        // For 90-degree rotation, coordinates are already swapped in taggingService
        // Use them directly without additional transformation
        screenX = pdfCenterX * scale;
        screenY = pdfCenterY * scale;
        break;
      case 180:
        // For 180-degree rotation, coordinates are already transformed in taggingService
        // Use them directly without additional transformation
        screenX = pdfCenterX * scale;
        screenY = pdfCenterY * scale;
        break;
      case 270:
        // For 270-degree rotation, coordinates are already transformed in taggingService
        // Use them directly without additional transformation
        screenX = pdfCenterX * scale;
        screenY = pdfCenterY * scale;
        break;
      default: // 0 degrees
        // For non-rotated documents, coordinates are already flipped in taggingService
        screenX = pdfCenterX * scale;
        screenY = pdfCenterY * scale;
        break;
    }
    
    return { x: screenX, y: screenY };
  }

  // Helper function to transform PDF coordinates to screen coordinates
  const transformCoordinates = (x1, y1, x2, y2) => {
    if (!viewport) return { rectX: 0, rectY: 0, rectWidth: 0, rectHeight: 0 };
    
    let rectX, rectY, rectWidth, rectHeight;
    
    switch (rotation) {
      case 90:
        // For 90-degree rotation, coordinates are already swapped in taggingService
        // Use them directly without additional transformation
        rectX = x1 * scale;
        rectY = y1 * scale;
        rectWidth = (x2 - x1) * scale;
        rectHeight = (y2 - y1) * scale;
        break;
      case 180:
        // For 180-degree rotation, coordinates are already transformed in taggingService
        // Use them directly without additional transformation
        rectX = x1 * scale;
        rectY = y1 * scale;
        rectWidth = (x2 - x1) * scale;
        rectHeight = (y2 - y1) * scale;
        break;
      case 270:
        // For 270-degree rotation, coordinates are already transformed in taggingService
        // Use them directly without additional transformation
        rectX = x1 * scale;
        rectY = y1 * scale;
        rectWidth = (x2 - x1) * scale;
        rectHeight = (y2 - y1) * scale;
        break;
      default: // 0 degrees
        // For non-rotated documents, coordinates are already flipped in taggingService
        // Use them directly without additional y-coordinate transformation
        rectX = x1 * scale;
        rectY = y1 * scale;
        rectWidth = (x2 - x1) * scale;
        rectHeight = (y2 - y1) * scale;
        break;
    }
    
    return { rectX, rectY, rectWidth, rectHeight };
  };

  // ADD: 도면 검색 영역 오버레이 좌표 계산 (viewport 기준)
  const computeDrawingOverlayRect = () => {
    const area = (appSettings as AppSettings | undefined)?.drawingSearchArea;
    if (!viewport || !area || area.enabled === false) return null;

    const pageW = viewport.width;
    const pageH = viewport.height;
    const unit = area.unit === 'px' ? 'px' : 'percent';

    const toPxX = (v: number) => (unit === 'percent' ? (v / 100) * pageW : v);
    const toPxY = (v: number) => (unit === 'percent' ? (v / 100) * pageH : v);

    const topPx = toPxY(area.top ?? 5);
    const rightPx = toPxX(area.right ?? 95);
    const bottomPx = toPxY(area.bottom ?? 20);
    const leftPx = toPxX(area.left ?? 5);

    const x = leftPx;
    const y = topPx;
    const width = Math.max(0, rightPx - leftPx);
    const height = Math.max(0, bottomPx - topPx);

    if (width <= 0 || height <= 0) return null;

    return { x, y, width, height };
  };



  const getModeStyles = () => {
    switch(mode){
      case 'connect': return 'cursor-crosshair ring-2 ring-blue-500';
      case 'manualCreate': return 'cursor-crosshair ring-2 ring-green-500';
      default: return ''; // Inherit grab/grabbing cursor from parent
    }
  };

  return (
    <div className="relative h-full w-full">
      <div ref={scrollContainerRef} className={`h-full w-full overflow-auto ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}>
        <div className="p-4 grid place-items-center min-h-full">
            <div 
                ref={viewerRef} 
                className={`relative shadow-2xl ${getModeStyles()}`}
                onMouseDown={handleViewerMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp} // Stop dragging if mouse leaves viewer
            >
                <canvas ref={canvasRef} />
                {viewport && (
                <svg className="absolute top-0 left-0" width={viewport.width} height={viewport.height} style={{ overflow: 'visible' }}>
                    <defs>
                    <marker id="arrowhead-connect" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill={colors.relationships.connection} /></marker>
                    <marker id="arrowhead-install" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto"><polygon points="0 0, 10 3.5, 0 7" fill={colors.relationships.installation} /></marker>
                    </defs>

                    {/* 도면 검색 영역 오버레이 */}
                    {appSettings?.drawingSearchArea?.showOverlay && (() => {
                      const rect = computeDrawingOverlayRect();
                      if (!rect) return null;
                      return (
                        <g pointerEvents="none">
                          {/* 채움(옅은 블루) */}
                          <rect
                            x={rect.x}
                            y={rect.y}
                            width={rect.width}
                            height={rect.height}
                            fill="rgba(59,130,246,0.08)"  // tailwind sky-500 느낌
                            rx="6"
                          />
                          {/* 점선 테두리 */}
                          <rect
                            x={rect.x}
                            y={rect.y}
                            width={rect.width}
                            height={rect.height}
                            fill="none"
                            stroke="rgba(59,130,246,0.9)"
                            strokeWidth="2"
                            strokeDasharray="6 4"
                            rx="6"
                          />
                        </g>
                      );
                    })()}

                    {/* Render detected CV lines (piping) - shown as debug visualization */}
                    {detectedLines
                        .filter(line => line.page === currentPage)
                        .map((line, index) => {
                            const opacity = 0.3;
                            const strokeWidth = line.confidence ? Math.max(1, line.confidence * 3) : 2;
                            const strokeColor = line.type === 'horizontal' ? '#00ff00' : '#0088ff';

                            return (
                                <line
                                    key={`detected-line-${index}`}
                                    x1={line.start.x}
                                    y1={line.start.y}
                                    x2={line.end.x}
                                    y2={line.end.y}
                                    stroke={strokeColor}
                                    strokeWidth={strokeWidth}
                                    strokeOpacity={opacity}
                                    strokeLinecap="round"
                                    pointerEvents="none"
                                />
                            );
                        })}

                    {currentRawTextItems.map(item => {
                         const { x1, y1, x2, y2 } = item.bbox;
                         const { rectX, rectY, rectWidth, rectHeight } = transformCoordinates(x1, y1, x2, y2);
                         const isSelected = selectedRawTextItemIds.includes(item.id);
                         const isHighlighted = highlightedRawTextItemIds.has(item.id);
                         const isLinked = linkedRawTextItemIds.has(item.id);

                         // Check if this raw text is likely a note description (on right side of page)
                         // Using 40% of page width as threshold (same as noteDescriptionOptimizer)
                         const pageWidth = viewport ? viewport.width / scale : 800;
                         const isLikelyNoteDescription = x1 > pageWidth * 0.40;

                         // Hide unconnected note descriptions
                         const shouldHide = isLikelyNoteDescription && !isLinked && !isSelected;

                         // Check if this is part of a multi-line note selection
                         const isPartOfNoteSelection = isSelected && selectedRawTextItemIds.length > 1 &&
                             relationships.some(r =>
                                 r.type === RelationshipType.Annotation &&
                                 selectedRawTextItemIds.includes(r.to) &&
                                 r.to === item.id
                             );

                         const getRectProps = () => {
                             if (shouldHide) {
                                 // Hide unconnected note descriptions (but keep them interactive)
                                 return {
                                     fill: "rgba(255, 255, 255, 0.003)", // Ultra-low opacity for interaction
                                     stroke: "transparent",
                                     strokeWidth: "0",
                                     strokeDasharray: "none"
                                 };
                             }
                             if (isSelected) {
                                 // Special styling for multi-line note selections
                                 if (isPartOfNoteSelection) {
                                     return {
                                         fill: "rgb(251 191 36 / 0.5)", // Amber for note descriptions
                                         stroke: "#fbbf24",
                                         strokeWidth: "2.5",
                                         strokeDasharray: "none"
                                     };
                                 }
                                 return {
                                     fill: "rgb(56 189 248 / 0.5)",
                                     stroke: "#38bdf8",
                                     strokeWidth: "2.5",
                                     strokeDasharray: "none"
                                 };
                             }
                             if (isHighlighted) {
                                 // 태그 선택 시 관련 Raw Text 강조 - 진한 보라색
                                 return { 
                                     fill: "rgb(139 69 255 / 0.6)", // Violet with 60% opacity
                                     stroke: "#8b5cf6",
                                     strokeWidth: "2.5", 
                                     strokeDasharray: "none" 
                                 };
                             }
                             if (isLinked) {
                                // Annotation 연결된 상태 - 매우 연한 보라색
                                return { 
                                    fill: `${colors.relationships.annotation}4D`, // 30% opacity
                                    stroke: colors.relationships.annotation,
                                    strokeWidth: "1.5", 
                                    strokeDasharray: "none"
                                };
                             }
                             return { 
                                 fill: "transparent",
                                 stroke: "#64748b",
                                 strokeWidth: "2", 
                                 strokeDasharray: "3 3",
                                 className: "group-hover:stroke-sky-400 group-hover:fill-sky-400/30 transition-all"
                             };
                         };

                         return (
                            <g key={item.id} data-raw-text-id={item.id} onMouseDown={(e) => handleRawTextItemMouseDown(e, item.id)} className="cursor-pointer group">
                                <rect 
                                    x={rectX} y={rectY} width={rectWidth} height={rectHeight} 
                                    {...getRectProps()}
                                />
                            </g>
                         )
                    })}
                    
                    {currentRelationshipsWithData.map(({ rel, fromTag, toItem, isAnnotation }) => {
                        if (!fromTag || !toItem) return null;
                        
                        const start = getTagCenter(fromTag);
                        let end, strokeColor, marker;
                        
                        if (isAnnotation) {
                            end = getAnnotationTargetCenter(rel.to);
                            strokeColor = getRelationshipColor(rel.type);
                            marker = '';
                        } else {
                            end = getTagCenter(toItem);
                            strokeColor = getRelationshipColor(rel.type);
                            
                            if (rel.type === RelationshipType.Connection) {
                                marker = 'url(#arrowhead-connect)';
                            } else if (rel.type === RelationshipType.Installation) {
                                marker = 'url(#arrowhead-install)';
                            } else {
                                marker = '';
                            }
                        }

                        // Check if this relationship should be highlighted
                        const isPinged = pingedRelationshipId === rel.id;

                        return (
                            <RelationshipLine
                                key={rel.id}
                                rel={rel}
                                start={start}
                                end={end}
                                strokeColor={strokeColor}
                                marker={marker}
                                isPinged={isPinged}
                            />
                        );
                    })}


                    {currentTags.map(tag => {
                    const { x1, y1, x2, y2 } = tag.bbox;

                    // Skip tags with invalid coordinates to prevent NaN errors
                    if (isNaN(x1) || isNaN(y1) || isNaN(x2) || isNaN(y2)) {
                      // Skipping tag with NaN coordinates
                      return null;
                    }

                    const { rectX, rectY, rectWidth, rectHeight } = transformCoordinates(x1, y1, x2, y2);

                    // Skip if transformed coordinates are invalid
                    if (isNaN(rectX) || isNaN(rectY) || isNaN(rectWidth) || isNaN(rectHeight)) {
                      // Skipping tag with NaN transformed coordinates
                      return null;
                    }

                    const isSelected = selectedTagIds.includes(tag.id);
                    const isHighlighted = highlightedTagIds.has(tag.id); // Use highlight state for visual feedback
                    const isRelStart = tag.id === relationshipStartTag;
                    const isRelated = relatedTagIds.has(tag.id);

                    // Check if this is an unconnected NOTE tag
                    const isNoteTag = tag.category === Category.NotesAndHolds &&
                                     tag.text.toUpperCase().includes('NOTE');
                    const hasNoteConnection = relationships.some(rel =>
                      rel.type === RelationshipType.Note && rel.to === tag.id
                    );

                    // Check if this tag is connected to a NOTE
                    const isConnectedToNote = relationships.some(rel =>
                      rel.type === RelationshipType.Note &&
                      (rel.from === tag.id || rel.to === tag.id)
                    );

                    // Hide unconnected NOTE tags
                    const isVisible = isNoteTag && !hasNoteConnection ? false : isTagVisible(tag);
                    const color = getEntityColor(tag.category);

                    return (
                        <g key={tag.id} data-tag-id={tag.id} onMouseDown={(e) => {
                          e.stopPropagation();
                          isClickOnItem.current = true;
                          const isMultiSelect = e.ctrlKey || e.metaKey;

                          if (isMultiSelect) {
                            setSelectedTagIds(prev =>
                              prev.includes(tag.id)
                                ? prev.filter(id => id !== tag.id)
                                : [...prev, tag.id]
                            );
                          } else {
                            setSelectedTagIds([tag.id]);
                            setSelectedRawTextItemIds([]);
                            setSelectedDescriptionIds([]);
                            // setTagSelectionSource('pdf'); // Not passed as prop
                          }
                        }} className="cursor-pointer">
                          {/* Add glow effect for NOTE-connected tags */}
                          {isConnectedToNote && isVisible && !isNoteTag && (
                            <>
                              {/* Outer glow */}
                              <rect
                                x={rectX - 4}
                                y={rectY - 4}
                                width={rectWidth + 8}
                                height={rectHeight + 8}
                                stroke={colors.relationships.note || '#14b8a6'}
                                strokeWidth="2"
                                fill="none"
                                opacity="0.3"
                                rx="4"
                                className="animate-pulse"
                              />
                              {/* Inner glow */}
                              <rect
                                x={rectX - 2}
                                y={rectY - 2}
                                width={rectWidth + 4}
                                height={rectHeight + 4}
                                stroke={colors.relationships.note || '#14b8a6'}
                                strokeWidth="1"
                                fill={`${colors.relationships.note || '#14b8a6'}1A`} // 10% fill
                                opacity="0.5"
                                rx="2"
                              />
                            </>
                          )}
                          {/* Render all tags as rectangles */}
                          <rect
                            x={rectX}
                            y={rectY}
                            width={rectWidth}
                            height={rectHeight}
                            stroke={isVisible ? getEntityColor(tag.category) : 'transparent'}
                            strokeWidth={isSelected ? "4" : isConnectedToNote ? "3" : "2"}
                            className="transition-all duration-150"
                            fill={
                              isVisible
                                ? isSelected
                                  ? `${getEntityColor(tag.category)}CC` // 80% opacity when selected
                                  : isConnectedToNote && !isNoteTag
                                    ? `${getEntityColor(tag.category)}59` // 35% opacity when connected to NOTE
                                    : `${getEntityColor(tag.category)}33` // 20% opacity when not selected
                                : 'rgba(255, 255, 255, 0.003)'
                            }
                            strokeDasharray={isRelStart ? "4 2" : "none"}
                            style={{ pointerEvents: 'all' }}
                          />
                          {/* Unified highlight system for regular tags */}
                          <TagHighlight
                            bbox={{ x1: rectX, y1: rectY, x2: rectX + rectWidth, y2: rectY + rectHeight }}
                            type={isRelated && !isHighlighted ? "related" : "primary"}
                            effect={getHighlightEffect(isSelected, false, isRelated)}
                            isSelected={isSelected && isVisible}
                            isHighlighted={isHighlighted && isVisible}
                            isMultiSelection={selectedTagIds.length > 1}
                            colorSettings={colors}
                          />
                          {/* AI Label indicator */}
                          {isVisible && false && (
                            <>
                              <rect
                                x={rectX + rectWidth - 20}
                                y={rectY - 10}
                                width="20"
                                height="10"
                                fill="#8b5cf6"
                                rx="2"
                              />
                              <text
                                x={rectX + rectWidth - 10}
                                y={rectY - 3}
                                fontSize="7"
                                fill="white"
                                textAnchor="middle"
                                fontWeight="bold"
                              >
                                AI
                              </text>
                            </>
                          )}
                        </g>
                    );
                    })}

                    {/* Circle overlay for selected instrument tags to show NOTE connection range */}
                    {selectedTagIds.map(tagId => {
                      const tag = currentTags.find(t => t.id === tagId);
                      if (!tag || tag.category !== Category.Instrument) return null;

                      const { x1, y1, x2, y2 } = tag.bbox;
                      const { rectX, rectY, rectWidth, rectHeight } = transformCoordinates(x1, y1, x2, y2);

                      // Calculate center and diagonal radius (3x for connection range)
                      const centerX = rectX + rectWidth / 2;
                      const centerY = rectY + rectHeight / 2;
                      const diagonalRadius = Math.sqrt(rectWidth * rectWidth + rectHeight * rectHeight) / 2 * 3;

                      return (
                        <circle
                          key={`circle-${tagId}`}
                          cx={centerX}
                          cy={centerY}
                          r={diagonalRadius}
                          fill="none"
                          stroke="#fbbf24"
                          strokeWidth="1.5"
                          strokeDasharray="5 5"
                          opacity="0.6"
                          pointerEvents="none"
                        />
                      );
                    })}

                    {pingedTagId && (() => {
                      const tagToPing = currentTags.find(t => t.id === pingedTagId);
                      if (!tagToPing) return null;
                      
                      const { x1, y1, x2, y2 } = tagToPing.bbox;
                      const { rectX, rectY, rectWidth, rectHeight } = transformCoordinates(x1, y1, x2, y2);

                      return (
                        <TagHighlight
                          bbox={{ x1: rectX, y1: rectY, x2: rectX + rectWidth, y2: rectY + rectHeight }}
                          type="primary"
                          effect="box"
                          isPinged={true}
                          colorSettings={colors}
                        />
                      );
                    })()}

                    {/* Descriptions */}
                    {visibilitySettings.descriptions && currentDescriptions.map(desc => {
                      const { x1, y1, x2, y2 } = desc.bbox;
                      const { rectX, rectY, rectWidth, rectHeight } = transformCoordinates(x1, y1, x2, y2);
                      const isSelected = selectedDescriptionIds.includes(desc.id);

                      return (
                        <g key={desc.id}>
                          <rect
                            x={rectX}
                            y={rectY}
                            width={rectWidth}
                            height={rectHeight}
                            fill={isSelected ? `${colors.entities?.description || DEFAULT_COLORS.entities.description}4D` : `${colors.entities?.description || DEFAULT_COLORS.entities.description}26`}
                            stroke={colors.entities?.description || DEFAULT_COLORS.entities.description}
                            strokeWidth="2"
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              const isMultiSelect = e.ctrlKey || e.metaKey;
                              if (isMultiSelect) {
                                if (isSelected) {
                                  setSelectedDescriptionIds(prev => prev.filter(id => id !== desc.id));
                                } else {
                                  setSelectedDescriptionIds(prev => [...prev, desc.id]);
                                }
                              } else {
                                setSelectedDescriptionIds([desc.id]);
                              }
                            }}
                            rx="3"
                          />
                        </g>
                      );
                    })}

                    {/* Pinged Description highlight */}
                    {pingedDescriptionId && (() => {
                      const descToPing = descriptions.find(d => d.id === pingedDescriptionId);
                      if (!descToPing || descToPing.page !== currentPage) {
                        return null;
                      }
                      
                      const { x1, y1, x2, y2 } = descToPing.bbox;
                      const { rectX, rectY, rectWidth, rectHeight } = transformCoordinates(x1, y1, x2, y2);

                      return (
                        <TagHighlight
                          bbox={{ x1: rectX, y1: rectY, x2: rectX + rectWidth, y2: rectY + rectHeight }}
                          type="description"
                          effect="box"
                          isPinged={true}
                          colorSettings={colors}
                        />
                      );
                    })()}
                </svg>
              )}
            </div>
          </div>
        </div>

        {/* OPC Navigation Button */}
        {opcNavigationButton && (
          <div
            className="fixed z-50 pointer-events-none"
            style={{
              left: opcNavigationButton.x + 10,
              top: opcNavigationButton.y - 10,
            }}
          >
            <button
              onClick={handleOpcNavigation}
              className="pointer-events-auto bg-violet-600 hover:bg-violet-500 text-white px-3 py-2 rounded-lg shadow-lg flex items-center space-x-2 transition-all duration-200 animate-fade-in"
            >
              <span className="text-sm font-medium">Go to {opcNavigationButton.referenceText}</span>
              <span className="text-xs bg-white/20 px-1.5 py-0.5 rounded">P{opcNavigationButton.targetPage}</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>
          </div>
        )}
    </div>
  );
};

// Export memoized component for better performance
export const PdfViewer = React.memo(PdfViewerComponent, (prevProps, nextProps) => {
  // Custom comparison function for deep equality check on critical props
  return (
    prevProps.currentPage === nextProps.currentPage &&
    prevProps.scale === nextProps.scale &&
    prevProps.mode === nextProps.mode &&
    prevProps.tags === nextProps.tags &&
    prevProps.relationships === nextProps.relationships &&
    prevProps.rawTextItems === nextProps.rawTextItems &&
    prevProps.descriptions === nextProps.descriptions &&
    prevProps.selectedTagIds === nextProps.selectedTagIds &&
    prevProps.selectedRawTextItemIds === nextProps.selectedRawTextItemIds &&
    prevProps.selectedDescriptionIds === nextProps.selectedDescriptionIds &&
    prevProps.visibilitySettings === nextProps.visibilitySettings &&
    prevProps.showAutoLinkRanges === nextProps.showAutoLinkRanges &&
    prevProps.appSettings === nextProps.appSettings   // ✅ 추가
  );
});
