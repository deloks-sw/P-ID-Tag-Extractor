import { Category, ColorSettings } from './types.ts';

export const DEFAULT_PATTERNS = {
  // Line pattern: matches line numbers like 8"-PL-30001-C1C, 3"-GL-30401-N1E, 2"-WS-10001, etc.
  // Format: [size]"-[service code]-[number]-[optional suffix]
  // Examples: 8"-PL-30001-C1C-INS, 3"-GL-30401-N1E, 1/2"-WS-10001
  // IMPORTANT: Must contain a quotation mark (") to be detected as a line
  [Category.Line]: '^.*".*-.*-.*$',
  [Category.Instrument]: {
    func: '[A-Z]{2,4}',
    num: '\\d{3,4}(?:\\s?[A-Z])?'
  },
  // Pattern to match drawing numbers - prioritizes complete format
  // Good matches: 00342GS-7300-PRP-D-105, P&ID-001-REV-A, DWG-12345-ABCD-678
  // Avoids: -7300-P-034-31051 (partial/truncated)
  [Category.DrawingNumber]: '[A-Z0-9][A-Z0-9\\-]{10,}',
  [Category.NotesAndHolds]: '^(NOTE|HOLD).*',
};

export const DEFAULT_TOLERANCES = {
    [Category.Instrument]: {
        vertical: 15, // px for combining parts
        horizontal: 20, // px for combining parts
        autoLinkDistance: 30, // px for auto-linking notes
    },
};

export const DEFAULT_SETTINGS = {
    autoGenerateLoops: true, // Auto-generate loops after tag extraction
    autoRemoveWhitespace: true, // Auto-remove whitespace from tags (except NotesAndHolds)
    hyphenSettings: {
        line: false,
        instrument: true, // Default to true for instruments
        drawingNumber: false,
        notesAndHolds: false,
    },

    drawingSearchArea: {
      unit: 'percent',
      enabled: true,
      top: 5,
      right: 95,
      bottom: 20,
      left: 5,
      showOverlay: false,
    },
    sheetNoPattern: '^\\d{3}$',
    combineDrawingAndSheet: true,

    loopRules: {
        // Default loop extraction rules
        // Format: Function Code → Loop Prefix
        // Common multi-letter patterns that should be grouped
        'TT': 'T',
        'TE': 'T',
        'TI': 'T',
        'TC': 'T',
        'TCV': 'T',
        'TSH': 'T',
        'TSL': 'T',
        'TIS': 'T',
        'TXT': 'T',

        'PT': 'P',
        'PE': 'P',
        'PI': 'P',
        'PC': 'P',
        'PCV': 'P',
        'PSH': 'P',
        'PSL': 'P',
        'PIT': 'P',
        'PDT': 'P',
        'PSV': 'P',

        'FT': 'F',
        'FE': 'F',
        'FI': 'F',
        'FC': 'F',
        'FCV': 'F',
        'FSH': 'F',
        'FSL': 'F',
        'FIT': 'F',
        'FIC': 'F',
        'FICA': 'F',

        'LT': 'L',
        'LE': 'L',
        'LI': 'L',
        'LC': 'L',
        'LCV': 'L',
        'LSH': 'L',
        'LSL': 'L',
        'LIT': 'L',
        'LIC': 'L',

        'AT': 'A',
        'AE': 'A',
        'AI': 'A',
        'AC': 'A',
        'AIC': 'A',

        'XV': 'X',
        'XCV': 'X',

        'HV': 'H',
        'HCV': 'H',
        'HS': 'H',
        'HC': 'H',
        'HIC': 'H',

        'ZT': 'Z',
        'ZI': 'Z',
        'ZS': 'Z',

        'VT': 'V',
        'VE': 'V',
        'VSH': 'V',
    },
    instrumentMappings: {
        // Temperature
        'TE': { instrumentType: 'TEMPERATURE ELEMENT', ioType: 'AI' },
        'TT': { instrumentType: 'TEMPERATURE TRANSMITTER', ioType: 'AI' },
        'TC': { instrumentType: 'TEMPERATURE CONTROLLER', ioType: 'AO' },
        'TI': { instrumentType: 'TEMPERATURE INDICATOR', ioType: 'Local' },
        'TCV': { instrumentType: 'TEMPERATURE CONTROL VALVE', ioType: 'AO' },
        'TSH': { instrumentType: 'TEMPERATURE SWITCH HIGH', ioType: 'DI' },
        'TSL': { instrumentType: 'TEMPERATURE SWITCH LOW', ioType: 'DI' },
        'TIS': { instrumentType: 'TEMPERATURE INDICATOR WITH SWITCH', ioType: 'DI' },
        'TXT': { instrumentType: 'TEMPERATURE SWITCH', ioType: 'DI' },
        'TIC': { instrumentType: 'TEMPERATURE INDICATING CONTROLLER', ioType: 'AO' },

        // Pressure
        'PE': { instrumentType: 'PRESSURE ELEMENT', ioType: 'AI' },
        'PT': { instrumentType: 'PRESSURE TRANSMITTER', ioType: 'AI' },
        'PI': { instrumentType: 'PRESSURE INDICATOR', ioType: 'Local' },
        'PC': { instrumentType: 'PRESSURE CONTROLLER', ioType: 'AO' },
        'PCV': { instrumentType: 'PRESSURE CONTROL VALVE', ioType: 'AO' },
        'PSH': { instrumentType: 'PRESSURE SWITCH HIGH', ioType: 'DI' },
        'PSL': { instrumentType: 'PRESSURE SWITCH LOW', ioType: 'DI' },
        'PIT': { instrumentType: 'PRESSURE INDICATING TRANSMITTER', ioType: 'AI' },
        'PIC': { instrumentType: 'PRESSURE INDICATING CONTROLLER', ioType: 'AO' },
        'PY': { instrumentType: 'PRESSURE CONVERTER/COMPUTER', ioType: 'AI' },

        // Level
        'LE': { instrumentType: 'LEVEL ELEMENT', ioType: 'AI' },
        'LT': { instrumentType: 'LEVEL TRANSMITTER', ioType: 'AI' },
        'LI': { instrumentType: 'LEVEL INDICATOR', ioType: 'Local' },
        'LC': { instrumentType: 'LEVEL CONTROLLER', ioType: 'AO' },
        'LCV': { instrumentType: 'LEVEL CONTROL VALVE', ioType: 'AO' },
        'LSH': { instrumentType: 'LEVEL SWITCH HIGH', ioType: 'DI' },
        'LSL': { instrumentType: 'LEVEL SWITCH LOW', ioType: 'DI' },
        'LIT': { instrumentType: 'LEVEL INDICATING TRANSMITTER', ioType: 'AI' },

        // Flow
        'FE': { instrumentType: 'FLOW ELEMENT', ioType: 'AI' },
        'FT': { instrumentType: 'FLOW TRANSMITTER', ioType: 'AI' },
        'FI': { instrumentType: 'FLOW INDICATOR', ioType: 'Local' },
        'FC': { instrumentType: 'FLOW CONTROLLER', ioType: 'AO' },
        'FCV': { instrumentType: 'FLOW CONTROL VALVE', ioType: 'AO' },
        'FSH': { instrumentType: 'FLOW SWITCH HIGH', ioType: 'DI' },
        'FSL': { instrumentType: 'FLOW SWITCH LOW', ioType: 'DI' },
        'FIT': { instrumentType: 'FLOW INDICATING TRANSMITTER', ioType: 'AI' },
        'FDI': { instrumentType: 'FLOW DIFFERENTIAL INDICATOR', ioType: 'Local' },

        // Analysis
        'AE': { instrumentType: 'ANALYSIS ELEMENT', ioType: 'AI' },
        'AT': { instrumentType: 'ANALYSIS TRANSMITTER', ioType: 'AI' },
        'AI': { instrumentType: 'ANALYSIS INDICATOR', ioType: 'Local' },
        'AC': { instrumentType: 'ANALYSIS CONTROLLER', ioType: 'AO' },

        // Valves
        'HV': { instrumentType: 'HAND VALVE', ioType: 'Local' },
        'HCV': { instrumentType: 'HAND CONTROL VALVE', ioType: 'Local' },
        'PSV': { instrumentType: 'PRESSURE SAFETY VALVE', ioType: 'Local' },
        'XV': { instrumentType: 'ON/OFF VALVE', ioType: 'DO' },
        'XCV': { instrumentType: 'ON/OFF CONTROL VALVE', ioType: 'DO' },

        // Hand/Status
        'HS': { instrumentType: 'HAND SWITCH', ioType: 'DI' },
        'HC': { instrumentType: 'HAND CONTROLLER', ioType: 'DO' },
        'ZI': { instrumentType: 'POSITION INDICATOR', ioType: 'Local' },
        'ZT': { instrumentType: 'POSITION TRANSMITTER', ioType: 'AI' },
        'ZS': { instrumentType: 'POSITION SWITCH', ioType: 'DI' },

        // Vibration
        'VE': { instrumentType: 'VIBRATION ELEMENT', ioType: 'AI' },
        'VT': { instrumentType: 'VIBRATION TRANSMITTER', ioType: 'AI' },
        'VSH': { instrumentType: 'VIBRATION SWITCH HIGH', ioType: 'DI' },

        // Additional Temperature instruments
        'TG': { instrumentType: 'TEMPERATURE GAUGE', ioType: 'Local' },
        'TV': { instrumentType: 'TEMPERATURE VALVE', ioType: 'AO' },
        'TAG': { instrumentType: 'TEMPERATURE ALARM GENERAL', ioType: 'DO' },
        'TXE': { instrumentType: 'TEMPERATURE ELEMENT (STATUS)', ioType: 'AI' },
        'TXI': { instrumentType: 'TEMPERATURE STATUS INDICATOR', ioType: 'DI' },
        'TXHH': { instrumentType: 'TEMPERATURE ALARM VERY HIGH', ioType: 'DO' },

        // Additional Pressure instruments
        'PG': { instrumentType: 'PRESSURE GAUGE', ioType: 'Local' },
        'PDI': { instrumentType: 'PRESSURE DIFFERENTIAL INDICATOR', ioType: 'Local' },
        'PDT': { instrumentType: 'PRESSURE DIFFERENTIAL TRANSMITTER', ioType: 'AI' },
        'PDY': { instrumentType: 'PRESSURE DIFFERENTIAL CONVERTER', ioType: 'AI' },
        'PV': { instrumentType: 'PRESSURE VALVE', ioType: 'AO' },
        'PXI': { instrumentType: 'PRESSURE STATUS INDICATOR', ioType: 'DI' },
        'PXT': { instrumentType: 'PRESSURE STATUS TRANSMITTER', ioType: 'AI' },
        'PXLL': { instrumentType: 'PRESSURE ALARM VERY LOW', ioType: 'DO' },
        'PDV': { instrumentType: 'PRESSURE DIFFERENTIAL VALVE', ioType: 'AO' },
        'PDXI': { instrumentType: 'PRESSURE DIFFERENTIAL STATUS INDICATOR', ioType: 'DI' },
        'PDXT': { instrumentType: 'PRESSURE DIFFERENTIAL STATUS TRANSMITTER', ioType: 'AI' },
        'PDIC': { instrumentType: 'PRESSURE DIFFERENTIAL INDICATING CONTROLLER', ioType: 'AO' },

        // Additional Flow instruments
        'FIC': { instrumentType: 'FLOW INDICATING CONTROLLER', ioType: 'AO' },
        'FV': { instrumentType: 'FLOW VALVE', ioType: 'AO' },
        'FY': { instrumentType: 'FLOW CONVERTER/COMPUTER', ioType: 'AI' },
        'FXI': { instrumentType: 'FLOW STATUS INDICATOR', ioType: 'DI' },
        'FXT': { instrumentType: 'FLOW STATUS TRANSMITTER', ioType: 'AI' },
        'FXY': { instrumentType: 'FLOW STATUS CONVERTER', ioType: 'AI' },
        'FXLL': { instrumentType: 'FLOW ALARM VERY LOW', ioType: 'DO' },

        // Additional Level instruments
        'LG': { instrumentType: 'LEVEL GAUGE', ioType: 'Local' },
        'LIC': { instrumentType: 'LEVEL INDICATING CONTROLLER', ioType: 'AO' },
        'LXI': { instrumentType: 'LEVEL STATUS INDICATOR', ioType: 'DI' },
        'LXT': { instrumentType: 'LEVEL STATUS TRANSMITTER', ioType: 'AI' },
        'LXHH': { instrumentType: 'LEVEL ALARM VERY HIGH', ioType: 'DO' },

        // Additional Hand/Control instruments
        'HIC': { instrumentType: 'HAND INDICATING CONTROLLER', ioType: 'AO' },
        'HSW': { instrumentType: 'HAND SWITCH', ioType: 'DI' },

        // Emergency/Safety
        'ESD': { instrumentType: 'EMERGENCY SHUTDOWN', ioType: 'DI' },

        // Additional Control/Safety
        'XPB': { instrumentType: 'AUXILIARY PUSH BUTTON', ioType: 'DI' },
    }
};

export const CATEGORY_COLORS = {
  [Category.Line]: {
    border: 'border-rose-400',
    bg: 'bg-rose-500/20',
    text: 'text-rose-400',
  },
  [Category.Instrument]: {
    border: 'border-amber-400',
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
  },
  [Category.DrawingNumber]: {
    border: 'border-indigo-400',
    bg: 'bg-indigo-500/20',
    text: 'text-indigo-400',
  },
  [Category.NotesAndHolds]: {
    border: 'border-teal-400',
    bg: 'bg-teal-500/20',
    text: 'text-teal-400',
  },
  [Category.Uncategorized]: {
    border: 'border-slate-500',
    bg: 'bg-slate-500/20',
    text: 'text-slate-400',
  },
};

export const DEFAULT_COLORS: ColorSettings = {
  entities: {
    line: '#fb7185',           // Rose
    instrument: '#fbbf24',     // Amber
    drawingNumber: '#818cf8',  // Indigo
    notesAndHolds: '#14b8a6',  // Teal
    uncategorized: '#94a3b8',  // Slate
    description: '#a855f7'     // Purple (for Note & Hold descriptions)
  },
  relationships: {
    connection: '#38bdf8',      // Sky blue (arrow line)
    installation: '#facc15',    // Yellow (arrow line)
    annotation: '#a78bfa',      // Purple-400 (line & linked raw text)
    note: '#14b8a6',           // Teal (line connecting to notes)
  },
  highlights: {
    primary: '#ef4444',        // Red-500 (primary selection/ping)
    note: '#8b5cf6',          // Violet-500 (note-related items)
    description: '#a855f7',   // Purple-500 (description items)
    related: '#6366f1',       // Indigo-500 (related tags)
    // Legacy support
    noteRelated: '#6366f1',   // Keep for backward compatibility
    selected: '#ef4444',      // Keep for backward compatibility
  },
};

export const EXTERNAL_LINKS = {
  NOTION_GUIDE: 'https://www.notion.so/gs-enc/P-ID-Smart-Digitizer-262e12e04a1080f49111c88cd60a32dc',
  REGEX_HELPER: 'https://chatgpt.com/g/g-dB9e8cEts-regex-helper',
};
