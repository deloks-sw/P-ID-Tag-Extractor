import React, { useState, useEffect } from 'react';
import { Category, RelationshipType } from '../types.ts';

export const SelectionPanel = ({
  selectedTagIds,
  setSelectedTagIds,
  allTags,
  relationships,
  onDeselect,
  onClear,
  rawTextItems,
  selectedRawTextItemIds,
  onDeselectRawTextItem,
  onCreateTag,
  manualCreationData,
  onManualTagCreate,
  onClearManualCreation,
}) => {
  const [manualTagText, setManualTagText] = useState('');
  const [isAlphabeticalSort, setIsAlphabeticalSort] = useState(false);

  useEffect(() => {
    if (manualCreationData) {
      setManualTagText('');
    }
  }, [manualCreationData]);

  const hasSelectedTags = selectedTagIds.length > 0;
  const hasSelectedRawItems = selectedRawTextItemIds.length > 0;

  if (manualCreationData) {
    const handleCreate = (category) => {
      if (manualTagText.trim()) {
        onManualTagCreate({ text: manualTagText.trim(), category });
      } else {
        alert("태그에 텍스트를 입력해주세요.");
      }
    };

    return (
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-full max-w-3xl z-20 px-4 animate-fade-in-up">
        <div className="bg-white/95 backdrop-blur-lg border border-gray-200 rounded-xl shadow-2xl p-3">
          <div className="flex justify-between items-center mb-2 px-1">
            <h3 className="font-bold text-md text-gray-900">수동으로 태그 생성</h3>
            <button
              onClick={onClearManualCreation}
              className="text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors"
            >
              취소
            </button>
          </div>
          <div className="mb-3">
            <input
              type="text"
              placeholder="태그 텍스트 입력..."
              value={manualTagText}
              onChange={(e) => setManualTagText(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-sky-500 focus:border-sky-500"
              autoFocus
            />
          </div>
          <div className="flex items-center justify-between border-t border-slate-700 pt-2">
            <span className="text-sm font-semibold text-gray-700">카테고리 선택:</span>
            <div className="flex items-center space-x-2">
              <button onClick={() => handleCreate(Category.Uncategorized)} className="px-3 py-1.5 text-sm font-semibold text-gray-900 bg-orange-600 rounded-md hover:bg-orange-700 transition-colors flex items-center space-x-1">
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs font-mono">1</span>
                <span>장비</span>
              </button>
              <button onClick={() => handleCreate(Category.Line)} className="px-3 py-1.5 text-sm font-semibold text-gray-900 bg-rose-600 rounded-md hover:bg-rose-700 transition-colors flex items-center space-x-1">
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs font-mono">2</span>
                <span>라인</span>
              </button>
              <button onClick={() => handleCreate(Category.Uncategorized)} className="px-3 py-1.5 text-sm font-semibold text-gray-900 bg-purple-600 rounded-md hover:bg-purple-700 transition-colors flex items-center space-x-1">
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs font-mono">3</span>
                <span>특수 항목</span>
              </button>
              <button onClick={() => handleCreate(Category.Instrument)} className="px-3 py-1.5 text-sm font-semibold text-gray-900 bg-amber-500 rounded-md hover:bg-amber-600 transition-colors flex items-center space-x-1">
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs font-mono">4</span>
                <span>계기</span>
              </button>
              <button onClick={() => handleCreate(Category.NotesAndHolds)} className="px-3 py-1.5 text-sm font-semibold text-gray-900 bg-teal-600 rounded-md hover:bg-teal-700 transition-colors flex items-center space-x-1">
                <span className="bg-white/20 px-1.5 py-0.5 rounded text-xs font-mono">5</span>
                <span>노트/홀드</span>
              </button>
              <button onClick={() => handleCreate(Category.DrawingNumber)} className="px-3 py-1.5 text-sm font-semibold text-gray-900 bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors">도면 번호</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasSelectedTags && !hasSelectedRawItems) {
    return null;
  }

  return (
    <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-full max-w-4xl z-20 px-4 animate-fade-in-up">
      <div className="bg-white/95 backdrop-blur-lg border border-gray-200 rounded-xl shadow-2xl p-3">
        <div className="flex flex-col space-y-3 max-h-72 overflow-y-auto pr-1">
          {/* Section for Raw Text Items */}
          {hasSelectedRawItems && (() => {
            let selectedRawItems = selectedRawTextItemIds
              .map(id => rawTextItems.find(item => item.id === id))
              .filter(Boolean);

            // Sort based on toggle state
            if (isAlphabeticalSort) {
              selectedRawItems = [...selectedRawItems].sort((a, b) => a.text.localeCompare(b.text));
            }

            // Check if these raw text items are part of a NOTE description
            const noteConnection = relationships.find(r =>
              r.type === RelationshipType.Annotation &&
              selectedRawTextItemIds.includes(r.to)
            );

            let connectedNoteTag = null;
            if (noteConnection) {
              connectedNoteTag = allTags.find(t => t.id === noteConnection.from);
            }

            // handleCreate is no longer needed since we removed the create buttons

            return (
              <div className={hasSelectedTags ? 'pb-3 mb-3 border-b border-slate-700' : ''}>
                {connectedNoteTag && (
                  <div className="mb-2 px-1 py-1 bg-amber-500/10 rounded-md border border-amber-500/30">
                    <p className="text-xs text-amber-400">
                      📎 {connectedNoteTag.text} 설명 ({selectedRawItems.length}줄)
                    </p>
                  </div>
                )}
                <div className="flex justify-between items-center mb-2 px-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-md text-gray-900">
                      {selectedRawItems.length}개의 텍스트 선택됨
                    </h3>
                    <button
                      onClick={() => setIsAlphabeticalSort(!isAlphabeticalSort)}
                      className={`p-1.5 rounded-md transition-colors ${
                        isAlphabeticalSort
                          ? 'bg-sky-600 text-gray-900 hover:bg-sky-500'
                          : 'bg-gray-200 text-gray-600 hover:bg-gray-300 hover:text-gray-900'
                      }`}
                      title={`정렬: ${isAlphabeticalSort ? '가나다순' : '선택 순서'}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                      </svg>
                    </button>
                  </div>
                  {/* Always show clear button for raw items */}
                  <button
                    onClick={onClear}
                    className="text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors"
                  >
                    선택 취소
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 max-h-20 overflow-y-auto pr-2 mb-3">
                  {selectedRawItems.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center bg-gray-200 rounded-full py-1 pl-3 pr-2 text-sm text-gray-900"
                    >
                      <span className="font-mono text-gray-900 mr-2">{item.text}</span>
                      <button
                        onClick={() => onDeselectRawTextItem(item.id)}
                        className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-300 hover:bg-red-500 transition-colors"
                        aria-label={`Deselect ${item.text}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
                {/* Create Tag UI removed - only showing selected text and relationships */}
              </div>
            );
          })()}

          {/* Section for Selected Tags */}
          {hasSelectedTags && (() => {
            let selectedTags = selectedTagIds
              .map(id => allTags.find(tag => tag.id === id))
              .filter((tag) => !!tag);

            // Sort based on toggle state
            if (isAlphabeticalSort) {
              const categorySortOrder = {
                [Category.Line]: 0,
                [Category.Instrument]: 1,
                [Category.DrawingNumber]: 2,
                [Category.NotesAndHolds]: 3,
                [Category.Uncategorized]: 4,
              };

              selectedTags = [...selectedTags].sort((a, b) => {
                const orderA = categorySortOrder[a.category] ?? 99;
                const orderB = categorySortOrder[b.category] ?? 99;
                if (orderA !== orderB) {
                  return orderA - orderB;
                }
                return a.text.localeCompare(b.text);
              });
            }

            const singleSelectedTag = selectedTagIds.length === 1 ? allTags.find(t => t.id === selectedTagIds[0]) : null;
            let installedInstruments = [];
            if (singleSelectedTag && singleSelectedTag.category === Category.Line) {
              installedInstruments = relationships
                .filter(r => r.type === RelationshipType.Installation && r.to === singleSelectedTag.id)
                .map(r => allTags.find(t => t.id === r.from))
                .filter(Boolean);
            }

            const handleSelectInstrument = (instrumentId) => {
              if (!selectedTagIds.includes(instrumentId)) {
                setSelectedTagIds(prev => [...prev, instrumentId]);
              }
            };

            const handleSelectAllInstruments = () => {
              const instrumentIds = installedInstruments.map(inst => inst.id);
              setSelectedTagIds(prev => [...new Set([...prev, ...instrumentIds])]);
            };

            return (
              <div>
                <div className="flex justify-between items-center mb-2 px-1">
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-md text-gray-900">{selectedTags.length}개의 태그 선택됨</h3>
                    <button
                      onClick={() => setIsAlphabeticalSort(!isAlphabeticalSort)}
                      className={`p-1.5 rounded-md transition-colors ${
                        isAlphabeticalSort 
                          ? 'bg-sky-600 text-gray-900 hover:bg-sky-500' 
                          : 'bg-gray-200 text-gray-600 hover:bg-gray-300 hover:text-gray-900'
                      }`}
                      title={`정렬: ${isAlphabeticalSort ? '가나다순' : '선택 순서'}`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                      </svg>
                    </button>
                  </div>
                  <button
                    onClick={onClear}
                    className="text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors"
                  >
                    Clear Selection
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto pr-2">
                  {selectedTags.map(tag => (
                    <div
                      key={tag.id}
                      className="flex items-center bg-gray-200 rounded-full py-1 pl-3 pr-2 text-sm text-gray-900"
                    >
                      <span className="font-mono text-gray-900 mr-2">{tag.text}</span>
                      <button
                        onClick={() => onDeselect(tag.id)}
                        className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-300 hover:bg-red-500 transition-colors"
                        aria-label={`Deselect ${tag.text}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {installedInstruments.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-700">
                    <div className="flex justify-between items-center mb-2 px-1">
                      <h4 className="font-semibold text-sm text-gray-900">설치된 계기 ({installedInstruments.length})</h4>
                      <button onClick={handleSelectAllInstruments} className="text-sm font-semibold text-sky-400 hover:text-sky-300 transition-colors">모두 선택</button>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto pr-2">
                      {installedInstruments.map(inst => {
                        const isSelected = selectedTagIds.includes(inst.id);
                        return (
                          <div
                            key={inst.id}
                            className={`flex items-center rounded-full py-1 pl-3 pr-2 text-sm text-gray-900 transition-colors ${isSelected ? 'bg-gray-300' : 'bg-gray-200'}`}
                          >
                            <span className={`font-mono mr-2 ${isSelected ? 'text-gray-500' : 'text-gray-900'}`}>{inst.text}</span>
                            {!isSelected && (
                              <button
                                onClick={() => handleSelectInstrument(inst.id)}
                                className="w-5 h-5 flex items-center justify-center rounded-full bg-gray-300 hover:bg-sky-500 transition-colors"
                                aria-label={`Select ${inst.text}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};