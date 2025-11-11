import React, { useState, useEffect } from 'react';
import { Category, AppSettings, ColorSettings } from '../types.ts';
import { DEFAULT_PATTERNS, DEFAULT_TOLERANCES, DEFAULT_SETTINGS, DEFAULT_COLORS, EXTERNAL_LINKS } from '../constants.ts';
import { generateRegexFromSamples } from '../services/regexGenerator.ts';
import { generateRegexWithOpenAI, getStoredAPIKey, saveAPIKey, testOpenAIAPIKey } from '../services/openaiApi.ts';

const RegexHelp = () => {
  const cheatSheet = [
    { char: '^', desc: '문자열의 시작과 일치' },
    { char: '$', desc: '문자열의 끝과 일치' },
    { char: '.', desc: '개행을 제외한 모든 단일 문자와 일치' },
    { char: '\\d', desc: '숫자 (0-9)' },
    { char: '\\w', desc: '단어 문자 (a-z, A-Z, 0-9, _)' },
    { char: '\\s', desc: '공백 문자' },
    { char: '[ABC]', desc: '괄호 안의 문자 중 하나' },
    { char: '[A-Z]', desc: 'A부터 Z 범위의 문자' },
    { char: '*', desc: '앞의 토큰이 0회 이상 반복' },
    { char: '+', desc: '앞의 토큰이 1회 이상 반복' },
    { char: '?', desc: '앞의 토큰이 0회 또는 1회' },
    { char: '{n}', desc: '정확히 n회 반복 (예: \\d{3})' },
    { char: '{n,}', desc: 'n회 이상 반복' },
    { char: '{n,m}', desc: 'n회 이상 m회 이하 반복' },
    { char: '|', desc: 'OR 연산자 (예: A|B)' },
    { char: '(...)', desc: '여러 토큰을 그룹화' },
  ];

  return (
    <div className="mt-1 text-xs text-gray-600 bg-gray-100 p-4 rounded-md border border-gray-300 animate-fade-in-up" style={{ animationDuration: '0.3s' }}>
      <h4 className="font-semibold text-gray-700 mb-3 text-sm">정규식 (Regex) 빠른 참조</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
        {cheatSheet.map(({ char, desc }) => (
          <div key={char} className="flex items-center space-x-3">
            <code className="bg-gray-200 px-2 py-1 rounded text-sky-600 font-mono w-20 text-center">{char}</code>
            <span>{desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SettingsModal = ({ patterns, tolerances, appSettings, colorSettings, onSaveOnly, onSaveAndRescan, onClose }) => {
  const [localPatterns, setLocalPatterns] = useState(patterns);
  const [localTolerances, setLocalTolerances] = useState(tolerances);
  const [localAppSettings, setLocalAppSettings] = useState(appSettings);
  const [localColorSettings, setLocalColorSettings] = useState(colorSettings || DEFAULT_COLORS);
  const [localInstrumentMappings, setLocalInstrumentMappings] = useState(appSettings.instrumentMappings || DEFAULT_SETTINGS.instrumentMappings || {});
  const [localLoopRules, setLocalLoopRules] = useState(appSettings.loopRules || DEFAULT_SETTINGS.loopRules || {});
  const [showRegexHelp, setShowRegexHelp] = useState(false);
  const [activeTab, setActiveTab] = useState('patterns');

  // Clear search queries when tab changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setInstrumentSearchQuery('');
    setLoopRulesSearchQuery('');
  };

  // Search states for instrument mappings and loop rules
  const [instrumentSearchQuery, setInstrumentSearchQuery] = useState('');
  const [loopRulesSearchQuery, setLoopRulesSearchQuery] = useState('');

  // State for AI regex generation
  const [sampleLine, setSampleLine] = useState('');
  const [sampleInstrument, setSampleInstrument] = useState('');
  const [sampleDrawing, setSampleDrawing] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [apiKey, setApiKey] = useState(getStoredAPIKey() || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyValid, setApiKeyValid] = useState<boolean | null>(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSaveOnly = () => {
    // Include instrument mappings and loop rules in app settings
    const updatedAppSettings = {
      ...localAppSettings,
      instrumentMappings: localInstrumentMappings,
      loopRules: localLoopRules
    };
    onSaveOnly(localPatterns, localTolerances, updatedAppSettings, localColorSettings);
  };

  const handleSaveAndRescan = () => {
    // Include instrument mappings and loop rules in app settings
    const updatedAppSettings = {
      ...localAppSettings,
      instrumentMappings: localInstrumentMappings,
      loopRules: localLoopRules
    };
    onSaveAndRescan(localPatterns, localTolerances, updatedAppSettings, localColorSettings, activeTab);
  };
  
  const handleReset = () => {
    setLocalPatterns(DEFAULT_PATTERNS);
    setLocalTolerances(DEFAULT_TOLERANCES);
    setLocalAppSettings({
      ...DEFAULT_SETTINGS,
      drawingSearchArea: DEFAULT_SETTINGS.drawingSearchArea ?? {
        unit: 'percent', enabled: true, top: 5, right: 95, bottom: 20, left: 5, showOverlay: false,
      },
      sheetNoPattern: DEFAULT_SETTINGS.sheetNoPattern ?? '^\\d{3}$',
      combineDrawingAndSheet: DEFAULT_SETTINGS.combineDrawingAndSheet ?? true,
    });
    setLocalLoopRules(DEFAULT_SETTINGS.loopRules || {});
    setLocalInstrumentMappings(DEFAULT_SETTINGS.instrumentMappings || {});
    setInstrumentSearchQuery('');
    setLoopRulesSearchQuery('');
  }

  const handlePatternChange = (category, value) => {
    setLocalPatterns(prev => ({...prev, [category]: value}));
  };

  const handleInstrumentPartChange = (part: 'func' | 'num', value: string) => {
    setLocalPatterns(prev => ({ 
        ...prev, 
        [Category.Instrument]: {
            ...prev[Category.Instrument],
            [part]: value
        }
    }));
  };
  
  const handleToleranceChange = (property: 'vertical' | 'horizontal' | 'autoLinkDistance', value: string) => {
      const numValue = parseInt(value, 10);
      if (!isNaN(numValue) && numValue >= 0) {
          setLocalTolerances(prev => ({
              ...prev,
              [Category.Instrument]: {
                  ...prev[Category.Instrument],
                  [property]: numValue
              }
          }));
      }
  };
  
  const categoryInfo = {
    [Category.Line]: {
        description: "배관 라인 태그를 매칭하기 위한 정규식 패턴입니다."
    },
    [Category.Instrument]: {
        description: "기능 코드와 번호로 구성된 계기 태그를 매칭하기 위한 두 부분 패턴입니다."
    },
    [Category.DrawingNumber]: {
        description: "도면 번호를 식별하기 위한 패턴입니다. 페이지당 하나만 선택되며, 우하단에서 선택됩니다."
    },
    [Category.NotesAndHolds]: {
        description: "노트 및 홀드 주석을 매칭하기 위한 패턴입니다."
    }
  };

  const categories = [Category.Line, Category.Instrument, Category.DrawingNumber, Category.NotesAndHolds];
  
  const instrumentCurrentTolerances = localTolerances[Category.Instrument] || { vertical: 0, horizontal: 0, autoLinkDistance: 50 };


  return (
    <div 
        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in-up" 
        style={{ animationDuration: '0.2s' }}
        onClick={onClose}
    >
      <div 
        className="bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-7xl text-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-lg font-bold text-gray-900">설정</h2>
            <button onClick={onClose} className="p-1 rounded-full text-gray-600 hover:bg-gray-100">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex space-x-1">
            <button
              onClick={() => handleTabChange('patterns')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'patterns'
                  ? 'bg-gray-200 text-gray-900'
                  : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              패턴 설정
            </button>
            <button
              onClick={() => handleTabChange('instruments')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'instruments'
                  ? 'bg-gray-200 text-gray-900'
                  : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              계기 타입
            </button>
            <button
              onClick={() => handleTabChange('loops')}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === 'loops'
                  ? 'bg-gray-200 text-gray-900'
                  : 'bg-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              Loop Number
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">

        {activeTab === 'patterns' ? (

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            
            {/* Left Column - Regex Patterns */}
            <div className="lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-800">정규식 패턴</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Left sub-column */}
                <div className="space-y-4">
                  {/* Line and Special Item combined card */}
                  <div className="p-3 bg-gray-100 rounded-lg">
                    <h4 className="text-sm font-semibold mb-3 text-gray-800">라인</h4>

                    {/* Line Section */}
                    <div className="mb-4">
                      <label htmlFor="pattern-Line" className="block text-xs font-medium text-gray-700 mb-1">라인</label>
                      <input
                        id="pattern-Line"
                        type="text"
                        value={localPatterns[Category.Line]}
                        onChange={(e) => handlePatternChange(Category.Line, e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm font-mono text-gray-900 focus:ring-sky-500 focus:border-sky-500"
                        placeholder="라인을 위한 정규식 패턴 입력..."
                      />
                      <div className="mt-1 text-xs text-gray-600">
                        <p>{categoryInfo[Category.Line].description}</p>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Right sub-column */}
                <div className="space-y-4">
                  {/* Instrument */}
                  {(() => {
                      const info = categoryInfo[Category.Instrument];
                      
                      return (
                          <div key={Category.Instrument} className="p-3 bg-white border border-gray-300 rounded-lg">
                            <label className="block text-sm font-semibold mb-2 text-gray-800">계기</label>
                            <div className="space-y-3">
                              <div>
                                <label htmlFor="pattern-inst-func" className="block text-xs font-medium text-gray-600 mb-1">기능 부분</label>
                                <input
                                  id="pattern-inst-func"
                                  type="text"
                                  value={localPatterns[Category.Instrument]?.func || ''}
                                  onChange={(e) => handleInstrumentPartChange('func', e.target.value)}
                                  className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm font-mono text-gray-900 focus:ring-sky-500 focus:border-sky-500"
                                />
                              </div>
                              <div>
                                <label htmlFor="pattern-inst-num" className="block text-xs font-medium text-gray-600 mb-1">번호 부분</label>
                                <input
                                  id="pattern-inst-num"
                                  type="text"
                                  value={localPatterns[Category.Instrument]?.num || ''}
                                  onChange={(e) => handleInstrumentPartChange('num', e.target.value)}
                                  className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm font-mono text-gray-900 focus:ring-sky-500 focus:border-sky-500"
                                />
                              </div>
                            </div>
                            {info && (
                              <div className="mt-3 text-xs text-gray-600">
                                <p>{info.description}</p>
                              </div>
                            )}
                          </div>
                      )
                  })()}

                  {/* Notes And Holds */}
                  {(() => {
                      const info = categoryInfo[Category.NotesAndHolds];
                      return (
                          <div key={Category.NotesAndHolds} className="p-3 bg-white border border-gray-300 rounded-lg">
                              <label htmlFor={`pattern-${Category.NotesAndHolds}`} className="block text-sm font-semibold mb-2 text-gray-800">노트 및 홀드</label>
                              <input
                                  id={`pattern-${Category.NotesAndHolds}`}
                                  type="text"
                                  value={localPatterns[Category.NotesAndHolds]}
                                  onChange={(e) => handlePatternChange(Category.NotesAndHolds, e.target.value)}
                                  className="w-full bg-white border border-gray-300 rounded-md p-3 text-sm font-mono text-gray-900 focus:ring-sky-500 focus:border-sky-500"
                                  placeholder="노트 및 홀드를 위한 정규식 패턴 입력..."
                              />
                              {info && (
                                  <div className="mt-2 text-xs text-gray-600">
                                      <p>{info.description}</p>
                                  </div>
                              )}
                          </div>
                      )
                  })()}

                  {/* Drawing Number */}
                  {(() => {
                      const info = categoryInfo[Category.DrawingNumber];
                      return (
                          <div key={Category.DrawingNumber} className="p-3 bg-white border border-gray-300 rounded-lg">
                              <label htmlFor={`pattern-${Category.DrawingNumber}`} className="block text-sm font-semibold mb-2 text-gray-800">Drawing Number</label>
                              <input
                                  id={`pattern-${Category.DrawingNumber}`}
                                  type="text"
                                  value={localPatterns[Category.DrawingNumber]}
                                  onChange={(e) => handlePatternChange(Category.DrawingNumber, e.target.value)}
                                  className="w-full bg-white border border-gray-300 rounded-md p-3 text-sm font-mono text-gray-900 focus:ring-sky-500 focus:border-sky-500"
                                  placeholder="Enter regex pattern for Drawing Number..."
                              />
                              {info && (
                                  <div className="mt-2 text-xs text-gray-600">
                                      <p>{info.description}</p>
                                  </div>
                              )}
                          </div>
                      )
                  })()}
                </div>
              </div>
            </div>

            {/* Right Column - AI Regex Generation */}
            <div className="lg:col-span-1">
              <div className="p-4 bg-gray-100 rounded-lg">
                <h3 className="text-sm font-semibold text-gray-800 mb-4">정규식 생성</h3>
                <p className="text-xs text-gray-600 mb-4">
                  실제 P&ID 예시 데이터를 입력하면 AI가 적합한 정규식을 생성합니다.
                </p>

                {/* Sample Input Fields */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      라인 넘버 예시
                    </label>
                    <input
                      type="text"
                      value={sampleLine}
                      onChange={(e) => setSampleLine(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs font-mono text-gray-900"
                      placeholder='42"-7300-P-037-11051XR-PP'
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      계기 태그 예시
                    </label>
                    <input
                      type="text"
                      value={sampleInstrument}
                      onChange={(e) => setSampleInstrument(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs font-mono text-gray-900"
                      placeholder="TT-205, FIC-301A, PSV-102"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Drawing Number 예시
                    </label>
                    <input
                      type="text"
                      value={sampleDrawing}
                      onChange={(e) => setSampleDrawing(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs font-mono text-gray-900"
                      placeholder="00342GS-7300-PRP-D-105"
                    />
                  </div>
                </div>

                {/* Open API Key Input */}
                <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded">
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    OpenAI API Key (ChatGPT)
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        saveAPIKey(e.target.value);
                        setApiKeyValid(null);
                      }}
                      className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-xs font-mono text-gray-900 pr-20"
                      placeholder="sk-..."
                    />
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1">
                      <button
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="p-1 text-gray-500 hover:text-gray-700"
                        type="button"
                      >
                        {showApiKey ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={async () => {
                          if (apiKey) {
                            const isValid = await testOpenAIAPIKey(apiKey);
                            setApiKeyValid(isValid);
                            if (isValid) {
                              alert('API 키가 유효합니다.');
                            } else {
                              alert('API 키가 유효하지 않습니다.');
                            }
                          }
                        }}
                        className="px-2 py-0.5 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                        type="button"
                      >
                        테스트
                      </button>
                    </div>
                  </div>
                  {apiKeyValid !== null && (
                    <p className={`text-xs mt-1 ${apiKeyValid ? 'text-green-600' : 'text-red-600'}`}>
                      {apiKeyValid ? '✓ API 키 유효함' : '✗ API 키 유효하지 않음'}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    ChatGPT를 사용하여 더 정확한 정규식을 생성합니다.{' '}
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-600 hover:text-sky-700 underline"
                    >
                      API 키 받기
                    </a>
                  </p>
                </div>

                {/* Generate Button */}
                <button
                  onClick={async () => {
                    setIsGenerating(true);
                    try {
                      let patterns;

                      // Use OpenAI API if API key is available
                      if (apiKey) {
                        try {
                          patterns = await generateRegexWithOpenAI(
                            apiKey,
                            sampleLine,
                            sampleInstrument,
                            sampleDrawing
                          );
                        } catch (apiError) {
                          // OpenAI API failed, falling back to rule-based
                          // Fall back to rule-based generation if API fails
                          patterns = generateRegexFromSamples(
                            sampleLine,
                            sampleInstrument,
                            sampleDrawing
                          );
                          alert(`ChatGPT API 실패: ${apiError.message}\n규칙 기반 생성을 사용합니다.`);
                        }
                      } else {
                        // Use rule-based generation if no API key
                        patterns = generateRegexFromSamples(
                          sampleLine,
                          sampleInstrument,
                          sampleDrawing
                        );
                      }

                      // Update the pattern fields
                      if (patterns.line && sampleLine) {
                        handlePatternChange(Category.Line, patterns.line);
                      }
                      if (patterns.instrument && sampleInstrument) {
                        handleInstrumentPartChange('func', patterns.instrument.func);
                        handleInstrumentPartChange('num', patterns.instrument.num);
                      }
                      if (patterns.drawing && sampleDrawing) {
                        handlePatternChange(Category.DrawingNumber, patterns.drawing);
                      }

                      // Show success message
                      alert(apiKey ? 'ChatGPT로 정규식이 생성되었습니다.' : '규칙 기반으로 정규식이 생성되었습니다.');
                    } catch (error) {
                      // Failed to generate regex
                      alert(`정규식 생성 실패: ${error.message}`);
                    } finally {
                      setIsGenerating(false);
                    }
                  }}
                  disabled={isGenerating || (!sampleLine && !sampleInstrument && !sampleDrawing)}
                  className={`
                    w-full mt-4 px-4 py-2 text-sm font-semibold rounded-md transition-colors
                    ${
                      isGenerating || (!sampleLine && !sampleInstrument && !sampleDrawing)
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : apiKey
                          ? 'bg-violet-600 text-white hover:bg-violet-700'
                          : 'bg-sky-600 text-white hover:bg-sky-700'
                    }
                  `}
                >
                  {isGenerating ? '생성 중...' : apiKey ? 'ChatGPT로 정규식 생성' : '규칙 기반 정규식 생성'}
                </button>

                {/* Info Box */}
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-xs">
                  <p className="text-blue-800 font-semibold mb-1">팁:</p>
                  <ul className="text-blue-700 space-y-1">
                    <li>• 실제 사용 중인 태그 예시를 입력하세요</li>
                    <li>• 여러 개의 예시는 쉼표로 구분합니다</li>
                    <li>• 생성된 패턴은 수동 조정 가능합니다</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* === P&ID No. & Sheet No. 검색 영역 (NEW) === */}
            <div className="lg:col-span-3 p-3 bg-white border border-gray-300 rounded-lg">
              <h4 className="text-sm font-semibold mb-3 text-gray-800">P&ID No. & Sheet No. 검색 영역</h4>

              <div className="flex flex-wrap items-center gap-3 mb-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={localAppSettings?.drawingSearchArea?.enabled ?? true}
                    onChange={(e) =>
                      setLocalAppSettings(prev => ({
                        ...prev,
                        drawingSearchArea: { ...(prev?.drawingSearchArea ?? {}), enabled: e.target.checked }
                      }))
                    }
                  />
                  영역 사용
                </label>

                <label className="flex items-center gap-2 text-sm">
                  단위:
                  <select
                    value={localAppSettings?.drawingSearchArea?.unit ?? 'percent'}
                    onChange={(e) =>
                      setLocalAppSettings(prev => ({
                        ...prev,
                        drawingSearchArea: {
                          ...(prev?.drawingSearchArea ?? {}),
                          unit: e.target.value as 'px' | 'percent'
                        }
                      }))
                    }
                    className="border rounded px-2 py-1"
                  >
                    <option value="percent">%</option>
                    <option value="px">px</option>
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={localAppSettings?.drawingSearchArea?.showOverlay ?? false}
                    onChange={(e) =>
                      setLocalAppSettings(prev => ({
                        ...prev,
                        drawingSearchArea: { ...(prev?.drawingSearchArea ?? {}), showOverlay: e.target.checked }
                      }))
                    }
                  />
                  뷰어에 영역 표시(점선)
                </label>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                {(['top','right','bottom','left'] as const).map(side => (
                  <label key={side} className="text-sm">
                    {side.toUpperCase()}
                    <input
                      type="number"
                      value={localAppSettings?.drawingSearchArea?.[side] ?? (side==='right'||side==='bottom' ? 95 : 5)}
                      onChange={(e) =>
                        setLocalAppSettings(prev => ({
                          ...prev,
                          drawingSearchArea: {
                            ...(prev?.drawingSearchArea ?? {}),
                            [side]: Number(e.target.value)
                          }
                        }))
                      }
                      className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm"
                    />
                  </label>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label className="text-sm">
                  Sheet No. 패턴 (정규식)
                  <input
                    type="text"
                    value={localAppSettings?.sheetNoPattern ?? '^\\d{3}$'}
                    onChange={(e) =>
                      setLocalAppSettings(prev => ({ ...prev, sheetNoPattern: e.target.value }))
                    }
                    className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm font-mono"
                    placeholder="예: ^\\d{3}$"
                  />
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={localAppSettings?.combineDrawingAndSheet ?? true}
                    onChange={(e) =>
                      setLocalAppSettings(prev => ({ ...prev, combineDrawingAndSheet: e.target.checked }))
                    }
                  />
                  도면번호와 시트번호 결합 저장 (예: EB-114739-001)
                </label>
              </div>

              {/* Sheet No. 탐색 허용 오차 (좌/우 전용) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                <label className="text-sm">
                  Sheet No. 탐색 허용 오차 (px, 좌/우 전용)
                  <input
                    type="number"
                    min={0}
                    value={
                      Number.isFinite(localAppSettings?.sheetNoTolerancePx as number)
                        ? (localAppSettings?.sheetNoTolerancePx as number)
                        : 60
                    }
                    onChange={(e) => {
                      const v = Math.max(0, Number(e.target.value || 0));
                      setLocalAppSettings(prev => ({ ...prev, sheetNoTolerancePx: v }));
                    }}
                    className="w-full bg-white border border-gray-300 rounded-md p-2 text-sm"
                    placeholder="예: 60"
                  />
                </label>
              </div>

              <p className="mt-2 text-xs text-gray-500">
                * 영역 단위가 <b>%</b>인 경우 페이지 폭/높이 대비 상대값입니다. (top/bottom/right/left)
              </p>
            </div>
          </div>

        ) : activeTab === 'instruments' ? (
          /* Instrument Mappings Tab Content */
          <div className="space-y-6">
            <div className="border border-gray-300 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">계기 타입 및 I/O 타입 설정</h3>
              <p className="text-sm text-gray-600 mb-4">
                인식된 계기 태그 패턴에 대한 기본 계기 타입과 I/O 타입을 설정하세요.
              </p>

              {/* Add New Mapping */}
              <div className="mb-4 p-3 bg-gray-100 rounded">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">새 매핑 추가</h4>
                <div className="grid grid-cols-4 gap-2">
                  <input
                    type="text"
                    placeholder="패턴 (예: PT)"
                    className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                    id="new-pattern"
                  />
                  <input
                    type="text"
                    placeholder="계기 타입"
                    className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                    id="new-instrument-type"
                  />
                  <select
                    className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                    id="new-io-type"
                    defaultValue=""
                  >
                    <option value="" disabled>I/O 타입 선택</option>
                    <option value="AI">AI (Analog Input)</option>
                    <option value="AO">AO (Analog Output)</option>
                    <option value="DI">DI (Digital Input)</option>
                    <option value="DO">DO (Digital Output)</option>
                    <option value="Local">Local</option>
                  </select>
                  <button
                    onClick={() => {
                      const pattern = (document.getElementById('new-pattern') as HTMLInputElement)?.value.toUpperCase();
                      const instrumentType = (document.getElementById('new-instrument-type') as HTMLInputElement)?.value;
                      const ioType = (document.getElementById('new-io-type') as HTMLSelectElement)?.value;

                      if (pattern && instrumentType && ioType) {
                        setLocalInstrumentMappings(prev => ({
                          ...prev,
                          [pattern]: { instrumentType, ioType }
                        }));

                        // Clear inputs
                        (document.getElementById('new-pattern') as HTMLInputElement).value = '';
                        (document.getElementById('new-instrument-type') as HTMLInputElement).value = '';
                        (document.getElementById('new-io-type') as HTMLSelectElement).value = '';
                      }
                    }}
                    className="bg-sky-600 hover:bg-sky-700 text-white font-semibold px-2 py-1 rounded text-sm"
                  >
                    추가
                  </button>
                </div>
              </div>

              </div>

              {/* Existing Mappings */}
              <div className="space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-gray-700">현재 매핑</h4>
                  {/* Search Bar for Instrument Mappings */}
                  <div className="relative w-48">
                    <input
                      type="text"
                      placeholder="계기 검색..."
                      value={instrumentSearchQuery}
                      onChange={(e) => setInstrumentSearchQuery(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-md px-2 py-1 pr-8 text-sm text-gray-900 focus:ring-sky-500 focus:border-sky-500"
                    />
                    {instrumentSearchQuery && (
                      <button
                        onClick={() => setInstrumentSearchQuery('')}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded"
                        title="검색 지우기"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <div className="h-96 overflow-y-auto bg-gray-50 border border-gray-200 rounded">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-100">
                      <tr className="border-b border-gray-300">
                        <th className="text-left py-2 px-2 text-gray-700">패턴</th>
                        <th className="text-left py-2 px-2 text-gray-700">계기 타입</th>
                        <th className="text-left py-2 px-2 text-gray-700">I/O 타입</th>
                        <th className="py-2 px-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const filteredMappings = Object.entries(localInstrumentMappings)
                          .filter(([pattern, mapping]: [string, any]) => {
                            // Filter by search query
                            const searchLower = instrumentSearchQuery.toLowerCase();
                            return pattern.toLowerCase().includes(searchLower) ||
                                   mapping.instrumentType.toLowerCase().includes(searchLower) ||
                                   mapping.ioType.toLowerCase().includes(searchLower);
                          })
                          .sort();

                        if (filteredMappings.length === 0) {
                          return (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-gray-500">
                                검색 결과가 없습니다
                              </td>
                            </tr>
                          );
                        }

                        return filteredMappings.map(([pattern, mapping]: [string, any]) => (
                        <tr key={pattern} className="border-b border-gray-200 hover:bg-gray-50">
                          <td className="py-2 px-2 font-mono text-gray-900">{pattern}</td>
                          <td className="py-2 px-2">
                            <input
                              type="text"
                              value={mapping.instrumentType}
                              onChange={(e) => {
                                setLocalInstrumentMappings(prev => ({
                                  ...prev,
                                  [pattern]: { ...prev[pattern], instrumentType: e.target.value }
                                }));
                              }}
                              className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 w-full"
                            />
                          </td>
                          <td className="py-2 px-2">
                            <select
                              value={mapping.ioType}
                              onChange={(e) => {
                                setLocalInstrumentMappings(prev => ({
                                  ...prev,
                                  [pattern]: { ...prev[pattern], ioType: e.target.value }
                                }));
                              }}
                              className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 w-full"
                            >
                              <option value="AI">AI (Analog Input)</option>
                              <option value="AO">AO (Analog Output)</option>
                              <option value="DI">DI (Digital Input)</option>
                              <option value="DO">DO (Digital Output)</option>
                              <option value="Local">Local</option>
                            </select>
                          </td>
                          <td className="py-2 px-2">
                            <button
                              onClick={() => {
                                const newMappings = { ...localInstrumentMappings };
                                delete newMappings[pattern];
                                setLocalInstrumentMappings(newMappings);
                              }}
                              className="text-red-400 hover:text-red-300"
                              title="삭제"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      ));
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'loops' ? (
          /* Loop Number Rules Tab Content */
          <div className="space-y-6">
            <div className="border border-gray-300 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4 text-gray-900">Loop Number 추출 규칙</h3>
              <p className="text-sm text-gray-600 mb-4">
                각 계기 태그 패턴에 대한 Loop Number 추출 규칙을 설정하세요.
                예: FXI, FXLL, FXT → FX, TT-205 → T-205
              </p>

              {/* Add New Loop Rule */}
              <div className="mb-4 p-3 bg-gray-100 rounded">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">새 규칙 추가</h4>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    placeholder="태그 패턴 (예: FXI, FXT)"
                    className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                    id="new-loop-pattern"
                  />
                  <input
                    type="text"
                    placeholder="Loop 추출 규칙 (예: FX)"
                    className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
                    id="new-loop-rule"
                  />
                  <button
                    onClick={() => {
                      const patterns = (document.getElementById('new-loop-pattern') as HTMLInputElement)?.value.toUpperCase();
                      const rule = (document.getElementById('new-loop-rule') as HTMLInputElement)?.value.toUpperCase();

                      if (patterns && rule) {
                        // Split comma-separated patterns
                        const patternList = patterns.split(',').map(p => p.trim()).filter(p => p);

                        patternList.forEach(pattern => {
                          setLocalLoopRules(prev => ({
                            ...prev,
                            [pattern]: rule
                          }));
                        });

                        // Clear inputs
                        (document.getElementById('new-loop-pattern') as HTMLInputElement).value = '';
                        (document.getElementById('new-loop-rule') as HTMLInputElement).value = '';
                      }
                    }}
                    className="bg-sky-600 hover:bg-sky-700 text-white font-semibold px-2 py-1 rounded text-sm"
                  >
                    추가
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  여러 패턴을 쉼표로 구분하여 같은 규칙을 적용할 수 있습니다.
                </p>
              </div>

              {/* Default Rule Info */}
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <h4 className="text-sm font-semibold text-gray-700 mb-1">기본 규칙 안내</h4>
                <p className="text-sm text-gray-600 mb-2">
                  아래 기본 규칙이 자동으로 적용됩니다. 필요시 수정하거나 추가 규칙을 만들 수 있습니다.
                </p>
                <p className="text-xs text-gray-500">
                  ※ 규칙에 없는 태그: 첫 번째 문자 + 숫자 (TT-205 → T-205)
                </p>
              </div>

              {/* Existing Loop Rules */}
              <div className="space-y-1">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-sm font-semibold text-gray-700">현재 규칙</h4>
                    <span className="text-xs text-gray-500">
                      (기본 {Object.keys(DEFAULT_SETTINGS.loopRules || {}).length}개 + 사용자 {Object.keys(localLoopRules).length - Object.keys(DEFAULT_SETTINGS.loopRules || {}).length}개)
                    </span>
                  </div>
                  {/* Search Bar for Loop Rules */}
                  <div className="relative w-48">
                    <input
                      type="text"
                      placeholder="Loop 규칙 검색..."
                      value={loopRulesSearchQuery}
                      onChange={(e) => setLoopRulesSearchQuery(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-md px-2 py-1 pr-8 text-sm text-gray-900 focus:ring-sky-500 focus:border-sky-500"
                    />
                    {loopRulesSearchQuery && (
                      <button
                        onClick={() => setLoopRulesSearchQuery('')}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded"
                        title="검색 지우기"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <div className="h-96 overflow-y-auto bg-gray-50 border border-gray-200 rounded">
                  {Object.keys(localLoopRules).length === 0 ? (
                    <p className="text-sm text-gray-500 py-2 px-4">규칙을 불러오는 중...</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-100">
                        <tr className="border-b border-gray-300">
                          <th className="text-left py-2 px-2 text-gray-700">태그 패턴</th>
                          <th className="text-left py-2 px-2 text-gray-700">Loop 추출 규칙</th>
                          <th className="text-left py-2 px-2 text-gray-700">예시</th>
                          <th className="py-2 px-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const filteredRules = Object.entries(localLoopRules)
                            .filter(([pattern, rule]: [string, any]) => {
                              // Filter by search query
                              const searchLower = loopRulesSearchQuery.toLowerCase();
                              const example = `${pattern}-123 → ${rule}-123`;
                              return pattern.toLowerCase().includes(searchLower) ||
                                     String(rule).toLowerCase().includes(searchLower) ||
                                     example.toLowerCase().includes(searchLower);
                            })
                            .sort((a, b) => {
                              // Sort by first letter, then by pattern
                              const firstA = String(a[1] || a[0][0]);
                              const firstB = String(b[1] || b[0][0]);
                              if (firstA !== firstB) return firstA.localeCompare(firstB);
                              return a[0].localeCompare(b[0]);
                            });

                          if (filteredRules.length === 0) {
                            return (
                              <tr>
                                <td colSpan={4} className="py-8 text-center text-gray-500">
                                  검색 결과가 없습니다
                                </td>
                              </tr>
                            );
                          }

                          return filteredRules.map(([pattern, rule]: [string, any]) => {
                          // Check if this is a default rule
                          const isDefault = DEFAULT_SETTINGS.loopRules && DEFAULT_SETTINGS.loopRules[pattern] === rule;
                          // Generate example based on pattern and rule
                          const exampleNumber = '205';
                          const example = `${pattern}-${exampleNumber} → ${rule}-${exampleNumber}`;

                          return (
                            <tr key={pattern} className={`border-b border-gray-200 hover:bg-gray-50 ${isDefault ? 'bg-gray-50' : ''}`}>
                              <td className="py-2 px-2">
                                <span className="font-mono text-gray-900">{pattern}</span>
                                {isDefault && <span className="ml-2 text-xs text-blue-600 font-normal">기본</span>}
                              </td>
                              <td className="py-2 px-2">
                                <input
                                  type="text"
                                  value={rule}
                                  onChange={(e) => {
                                    setLocalLoopRules(prev => ({
                                      ...prev,
                                      [pattern]: e.target.value.toUpperCase()
                                    }));
                                  }}
                                  className="bg-white border border-gray-300 rounded px-2 py-1 text-sm text-gray-900 font-mono w-20"
                                />
                              </td>
                              <td className="py-2 px-2 text-gray-500 text-xs">{example}</td>
                              <td className="py-2 px-2">
                                <button
                                  onClick={() => {
                                    const newRules = { ...localLoopRules };
                                    delete newRules[pattern];
                                    setLocalLoopRules(newRules);
                                  }}
                                  className="text-red-400 hover:text-red-300"
                                  title="삭제"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          );
                        });
                        })()}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}
        </div>
        <div className="p-4 border-t border-gray-200 flex justify-between items-center">
            <button
                onClick={handleReset}
                className="px-4 py-2 text-sm font-semibold text-white bg-gray-600 rounded-md hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-white"
            >
                기본값으로 재설정
            </button>
            <div className="flex space-x-2">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-transparent rounded-md hover:bg-gray-100 transition-colors"
                >
                    취소
                </button>
                <button
                    onClick={handleSaveOnly}
                    className="px-4 py-2 text-sm font-semibold text-white bg-sky-600 rounded-md hover:bg-sky-700 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-white"
                >
                    저장
                </button>
                <button
                    onClick={handleSaveAndRescan}
                    className="px-4 py-2 text-sm font-semibold text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-white"
                >
                    저장 및 다시 스캔
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};