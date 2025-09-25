/**
 * OpenAI API Integration Service
 * Handles communication with OpenAI's ChatGPT API for regex generation
 */

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface RegexPatterns {
  line?: string;
  instrument?: {
    func: string;
    num: string;
  };
  drawing?: string;
}

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
// const OPENAI_MODEL = 'gpt-5-2025-08-07'; // GPT-5 not yet available
const OPENAI_MODEL = 'gpt-4-turbo-preview'; // Using GPT-4 Turbo for now

/**
 * Calls OpenAI API to generate regex patterns from P&ID samples
 */
export async function generateRegexWithOpenAI(
  apiKey: string,
  lineSample: string,
  instrumentSample: string,
  drawingSample: string
): Promise<RegexPatterns> {
  if (!apiKey) {
    throw new Error('OpenAI API key is required');
  }

  const systemPrompt = `You are an expert regex pattern generator specialized in P&ID (Piping and Instrumentation Diagram) tag recognition across multiple industries and standards.

COMPREHENSIVE P&ID PATTERN RULES:

1. LINE NUMBERS (Process/Piping Lines):
Common formats across industries:
- Size-Service-Number: "8"-PL-30001", "1/2"-WS-10001", "DN100-CW-2001"
- Size-Number-Service-Details: "42"-7300-P-037-11051XR-PP", "12"-1234-HC-567-A1B"
- Complex with specifications: "8"-PL-30001-C1C-INS", "3"-GL-30401-N1E-H2B3"
- With material codes: "4"-SS-304L-PL-1001", "6"-CS-A106B-ST-2002"
- International formats: "100-L-12345-CS", "DN150-W-67890-SS316"

Size variations: 1/8", 1/4", 1/2", 3/4", 1", 2", 3", 4", 6", 8", 10", 12", 14", 16", 18", 20", 24", 30", 36", 42", 48"
Or metric: DN15, DN20, DN25, DN32, DN40, DN50, DN65, DN80, DN100, DN150, DN200, DN250, DN300

Service codes: PL, GL, WS, ST, CW, CHW, RW, CS, SS, HC, LC, AC, NG, FG, IA, N2, H2, O2, AR, HE

Key characteristics:
- Usually contains size (with quotes " or DN prefix)
- Multiple hyphen-separated segments (minimum 3)
- May include material specs, insulation codes, tracing info

2. INSTRUMENT TAGS (ISA Standard):
Format: [Function Letters][Loop Number][Suffix]

Function Letters (First letter + modifiers):
First Letter (Measured Variable):
- A (Analysis), B (Burner), C (Conductivity), D (Density), E (Voltage)
- F (Flow), G (Gauging), H (Hand/Manual), I (Current), J (Power)
- K (Time/Schedule), L (Level), M (Moisture), N (User Choice), O (User Choice)
- P (Pressure), Q (Quantity), R (Radiation), S (Speed), T (Temperature)
- U (Multi-variable), V (Vibration), W (Weight), X (Unclassified), Y (Event), Z (Position)

Succeeding Letters:
- A (Alarm), B (User Choice), C (Control), D (Differential), E (Element)
- F (Ratio), G (Glass/Gauge), H (High), I (Indicate), J (Scan), K (Control Station)
- L (Light/Low), M (Momentary), N (User Choice), O (Orifice), P (Point/Test)
- Q (Integrate), R (Record), S (Switch), T (Transmit), U (Multifunction)
- V (Valve), W (Well), X (Unclassified), Y (Relay), Z (Driver/Actuator)

Common combinations:
- FT, FE, FI, FIC, FICA, FCV, FV, FSL, FSH (Flow)
- PT, PE, PI, PIC, PCV, PSV, PSL, PSH, PDI, PDT (Pressure)
- LT, LE, LI, LIC, LCV, LSL, LSH, LAL, LAH (Level)
- TT, TE, TI, TIC, TCV, TSL, TSH, TW, TR (Temperature)
- XV, HV, HCV, HS, HIC, XCV (Valves/Hand)

Loop numbers: 001-9999, may include area prefix (11-FT-101, 2-PT-2001)
Suffixes: A, B, C (for multiple devices in same loop)

3. DRAWING NUMBERS:
Various company standards:
- Project-Area-Type-Sequential: "00342GS-7300-PRP-D-105"
- Simple sequential: "P&ID-001", "PID-2023-001-REV-A"
- Complex hierarchical: "PRJ-UNIT-DISC-TYPE-SHEET": "ABC-U01-PROC-PID-001"
- With revision: "DWG-12345-R1", "SK-67890-REV-B", "P123-456-789-R0"
- ISO format: "XXXX-YY-ZZ-NNNN" where X=project, Y=area, Z=type, N=number
- Company specific: "CLIENT-PLANT-AREA-DOC-NUMBER"

Common prefixes: P&ID, PID, PFD, DWG, SK, ISO, GA, PROC, INST, LOOP
Common suffixes: REV-X, R0/R1/R2, -SH1/-SH2 (sheet numbers)

REGEX GENERATION RULES:
- Be flexible enough to catch variations but specific enough to avoid false positives
- Use character classes for variable parts: [A-Z], \\d, [A-Z0-9]
- Use quantifiers appropriately: {2,4} for 2-4 chars, + for one or more, * for zero or more
- Account for optional parts with ?: (...)? for optional groups
- Consider word boundaries \\b when needed to avoid partial matches
- For hyphens in patterns, remember they're literal characters not ranges

Return ONLY a JSON object with the regex patterns, no explanation or markdown. Use double backslashes for regex escapes.`;

  const userPrompt = `Generate regex patterns for these P&ID samples. Analyze the structure and create patterns that will match similar formats:

${lineSample ? `Line Sample(s): "${lineSample}"
Analyze: Look for size indicators (numbers with " or DN prefix), service codes (2-4 letters), sequential numbers, and any suffixes. The pattern should match lines with similar structure but different values.` : 'Line Sample: (not provided)'}

${instrumentSample ? `Instrument Sample(s): "${instrumentSample}"
Analyze: Identify the function code (2-6 uppercase letters indicating instrument type), loop number (typically 3-4 digits, may have area prefix), and any suffix letters. Consider ISA naming standards.` : 'Instrument Sample: (not provided)'}

${drawingSample ? `Drawing Number Sample(s): "${drawingSample}"
Analyze: Identify the document structure - project codes, area/unit identifiers, document type, sequential numbers, and revision indicators. Look for consistent separator patterns.` : 'Drawing Number Sample: (not provided)'}

IMPORTANT PATTERN REQUIREMENTS:
- For lines: Must handle size variations (fractional, whole numbers, DN format), flexible service codes, variable segment counts
- For instruments: Separate patterns for function code (letters) and tag number (digits with optional suffix)
- For drawings: Flexible enough for various company standards but specific enough to avoid false matches
- All patterns should use proper escaping (double backslashes) and be tested against the provided samples

Return a JSON object with this exact structure:
{
  "line": "regex_pattern or null",
  "instrument": {
    "func": "function_code_pattern or null",
    "num": "tag_number_pattern or null"
  },
  "drawing": "drawing_number_pattern or null"
}

Examples of good patterns:
- Line: "(?:\\d+(?:[/\\d]+)?\\"|DN\\d+)-[A-Z]{2,4}-\\d{3,}(?:-[A-Z0-9]+)*"
- Instrument func: "[A-Z]{2,5}"
- Instrument num: "\\d{3,4}[A-Z]?"
- Drawing: "[A-Z0-9]{3,}-\\d{4}-[A-Z]{2,}-[A-Z]-\\d{3,}"

Return null for any pattern not requested. Ensure all backslashes are doubled for JSON.`;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: userPrompt
          }
        ],
        temperature: 0.2, // Lower temperature for more consistent pattern generation
        max_tokens: 500, // Use standard parameter for GPT-4
        response_format: { type: "json_object" } // Force JSON response
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      // OpenAI API error

      if (response.status === 401) {
        throw new Error('Invalid API key. Please check your OpenAI API key.');
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (response.status === 400) {
        throw new Error('Invalid request. Please check your input samples.');
      } else {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
    }

    const data: OpenAIResponse = await response.json();
    

    // Extract the text content from OpenAI's response
    const responseText = data.choices?.[0]?.message?.content || '';
    

    if (!responseText) {
      // Empty response
      throw new Error('Empty response from OpenAI API');
    }

    // Parse the JSON response
    let patterns: RegexPatterns;
    try {
      patterns = JSON.parse(responseText);
    } catch {
      // Failed to parse OpenAI response
      // Try to extract JSON from the response if it contains extra text
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        patterns = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Invalid response format from OpenAI API');
      }
    }

    // Validate the response structure
    const result: RegexPatterns = {};

    if (patterns.line && lineSample) {
      result.line = patterns.line;
    }

    if (patterns.instrument && instrumentSample) {
      result.instrument = {
        func: patterns.instrument.func || '[A-Z]{2,4}',
        num: patterns.instrument.num || '\\d{3,4}(?:\\s?[A-Z])?'
      };
    }

    if (patterns.drawing && drawingSample) {
      result.drawing = patterns.drawing;
    }

    return result;
  } catch (error) {
    // OpenAI API error
    throw error;
  }
}

/**
 * Test the API key by making a simple request
 */
export async function testOpenAIAPIKey(apiKey: string): Promise<boolean> {
  if (!apiKey) return false;

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo', // Use cheaper model for testing
        messages: [
          {
            role: 'user',
            content: 'Say "OK"'
          }
        ],
        max_tokens: 5
      })
    });

    return response.ok;
  } catch (error) {
    // API key test failed
    return false;
  }
}

/**
 * Store API key in localStorage
 */
export function saveAPIKey(apiKey: string): void {
  if (apiKey) {
    localStorage.setItem('openai_api_key', apiKey);
  } else {
    localStorage.removeItem('openai_api_key');
  }
}

/**
 * Retrieve API key from localStorage
 */
export function getStoredAPIKey(): string | null {
  return localStorage.getItem('openai_api_key');
}