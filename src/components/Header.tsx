import React from 'react';

export const Header = ({
  hasData,
  onOpenSettings,
  pdfDoc,
  currentPage,
  setCurrentPage,
  onToggleSidePanel,
}) => {

  return (
    <header className="relative flex-shrink-0 bg-white border-b border-gray-200 p-2 z-50">
      {/* Single-line layout with flex-wrap */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        {/* Logo and title */}
        <div className="flex items-center space-x-2">
          <img src="/gs-logo.png" alt="GS Logo" className="h-6 w-6 lg:h-8 lg:w-8 object-contain" />
          <h1 className="text-lg lg:text-xl font-bold text-gray-900 tracking-tight hidden sm:inline">계장태그 추출기</h1>
          <h1 className="text-lg font-bold text-gray-900 tracking-tight sm:hidden">태그추출기</h1>
          
          {/* Side Panel Toggle - next to title */}
          {hasData && (
            <button
              onClick={onToggleSidePanel}
              className="p-1.5 rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              title="사이드 패널 토글 (S)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 lg:h-5 lg:w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
            </button>
          )}
        </div>

        {/* PDF Navigation - when data is loaded */}
        {hasData && pdfDoc && (
          <div className="bg-white p-1 rounded-xl shadow-lg flex items-center gap-2 border border-gray-200">
            <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300 transition-colors text-sm text-gray-900">←</button>
            <span className="text-sm whitespace-nowrap text-gray-700">페이지 {currentPage}/{pdfDoc.numPages}</span>
            <button onClick={() => setCurrentPage(Math.min(pdfDoc.numPages, currentPage + 1))} disabled={currentPage === pdfDoc.numPages} className="px-2 py-1 bg-gray-200 rounded disabled:opacity-50 hover:bg-gray-300 transition-colors text-sm text-gray-900">→</button>
          </div>
        )}


        {/* Tools & Essential buttons */}
        <div className="flex items-center gap-1">
          {/* Always visible essential buttons */}
          <button
            onClick={onOpenSettings}
            className="p-2 text-sm font-semibold text-white bg-gray-600 rounded-md hover:bg-gray-700 transition-colors"
            title="설정"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>

    </header>
  );
};