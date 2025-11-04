/**
 * Intent Detector
 * 
 * Detects user intents for file operations from natural language
 * Works with any LLM - no tool calling support required
 */

export interface FileOperationIntent {
  operation: 'read' | 'write' | 'list' | 'none';
  filename?: string;
  filepath?: string;
  content?: string;
  confidence: number;
}

/**
 * Detect if user is asking to read a file
 */
function detectReadIntent(message: string): FileOperationIntent | null {
  // Handle quoted filenames and filenames with spaces
  const readPatterns = [
    /read\s+(?:the\s+)?file\s+["']([^"']+)["']/i,  // Quoted: "hello friend.txt"
    /read\s+(?:the\s+)?file\s+(.+?)\s+(?:on|in|from)/i,  // Unquoted with location: hello friend.txt on desktop
    /read\s+(?:the\s+)?file\s+([^\s]+(?:\s+[^\s]+)*\.[\w]+)/i,  // Unquoted with extension: hello friend.txt
    /open\s+(?:the\s+)?file\s+["']([^"']+)["']/i,
    /open\s+(?:the\s+)?file\s+(.+?)\s+(?:on|in|from)/i,
    /show\s+(?:me\s+)?(?:the\s+)?(?:contents?\s+of\s+)?["']([^"']+)["']/i,
    /show\s+(?:me\s+)?(?:the\s+)?(?:contents?\s+of\s+)?(.+?)\s+(?:on|in|from)/i,
    /what'?s\s+in\s+(?:the\s+)?file\s+["']([^"']+)["']/i,
    /what'?s\s+in\s+(?:the\s+)?file\s+(.+?)\s+(?:on|in|from)/i,
    /can\s+you\s+read\s+(?:the\s+)?(?:file\s+)?["']([^"']+)["']/i,
    /can\s+you\s+read\s+(?:the\s+)?(?:file\s+)?(.+?)\s+(?:on|in|from)/i,
  ];

  for (const pattern of readPatterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const filename = match[1].trim();
      return {
        operation: 'read',
        filename,
        confidence: 0.8,
      };
    }
  }

  return null;
}

/**
 * Detect if user is asking to write a file
 */
function detectWriteIntent(message: string): FileOperationIntent | null {
  // Handle quoted filenames and filenames with spaces
  const writePatterns = [
    /write\s+(?:to\s+)?["']([^"']+)["']/i,  // Quoted: "my file.txt"
    /write\s+(?:to\s+)?(.+?)\s+(?:on|in|to)/i,  // Unquoted with location
    /create\s+(?:a\s+)?file\s+(?:called\s+)?["']([^"']+)["']/i,
    /create\s+(?:a\s+)?file\s+(?:called\s+)?(.+?)\s+(?:on|in|with)/i,
    /save\s+(?:to\s+)?["']([^"']+)["']/i,
    /save\s+(?:to\s+)?(.+?)\s+(?:on|in)/i,
  ];

  for (const pattern of writePatterns) {
    const match = message.match(pattern);
    if (match?.[1]) {
      const filename = match[1].trim();
      return {
        operation: 'write',
        filename,
        confidence: 0.7,
      };
    }
  }

  return null;
}

/**
 * Detect if user is asking to list files
 */
function detectListIntent(message: string): FileOperationIntent | null {
  const listPatterns = [
    /list\s+(?:the\s+)?files?\s+(?:in\s+)?(?:my\s+)?(desktop|documents?)/i,
    /show\s+(?:me\s+)?(?:all\s+)?files?\s+(?:in\s+)?(?:my\s+)?(desktop|documents?)/i,
    /what\s+files?\s+(?:are\s+)?(?:in\s+)?(?:my\s+)?(desktop|documents?)/i,
  ];

  for (const pattern of listPatterns) {
    const match = message.match(pattern);
    if (match) {
      return {
        operation: 'list',
        filepath: match[1]?.toLowerCase(),
        confidence: 0.8,
      };
    }
  }

  return null;
}

/**
 * Detect location (desktop/documents) from message
 */
function detectLocation(message: string): string | null {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('desktop')) {
    return 'desktop';
  }
  if (lowerMessage.includes('documents') || lowerMessage.includes('document')) {
    return 'documents';
  }
  
  return null;
}

/**
 * Build full file path from filename and location
 * Returns a path pattern using tilde (~) for home directory
 */
export function buildFilePath(filename: string, location: string | null): string | null {
  if (!location) return null;

  // Use tilde notation - the backend will expand this to actual home directory
  const relativePaths: Record<string, string> = {
    desktop: `~/Desktop/${filename}`,
    documents: `~/Documents/${filename}`,
  };

  return relativePaths[location.toLowerCase()] || null;
}

/**
 * Build directory path for listing
 */
export function buildDirectoryPath(location: string): string | null {
  const basePaths: Record<string, string> = {
    desktop: '~/Desktop',
    documents: '~/Documents',
  };

  return basePaths[location.toLowerCase()] || null;
}

/**
 * Main intent detection function
 * Analyzes user message and detects file operation intents
 */
export function detectFileOperationIntent(message: string): FileOperationIntent {
  // Try to detect specific operations
  const readIntent = detectReadIntent(message);
  if (readIntent) {
    const location = detectLocation(message);
    if (location && readIntent.filename) {
      const filepath = buildFilePath(readIntent.filename, location);
      if (filepath) readIntent.filepath = filepath;
    }
    return readIntent;
  }

  const writeIntent = detectWriteIntent(message);
  if (writeIntent) {
    const location = detectLocation(message);
    if (location && writeIntent.filename) {
      const filepath = buildFilePath(writeIntent.filename, location);
      if (filepath) writeIntent.filepath = filepath;
    }
    return writeIntent;
  }

  const listIntent = detectListIntent(message);
  if (listIntent && listIntent.filepath) {
    const dirPath = buildDirectoryPath(listIntent.filepath);
    if (dirPath) listIntent.filepath = dirPath;
  }
  if (listIntent) {
    return listIntent;
  }

  // No intent detected
  return {
    operation: 'none',
    confidence: 0,
  };
}

/**
 * Format file operation result for LLM context
 */
export function formatFileOperationResult(
  operation: string,
  filename: string | undefined,
  result: { success: boolean; data?: unknown; error?: string }
): string {
  if (!result.success) {
    return `[File operation failed: ${result.error}]`;
  }

  // Check if MCP returned an error in the data
  if (result.data && typeof result.data === 'object') {
    const data = result.data as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
    if (data.isError && data.content && Array.isArray(data.content)) {
      // Extract error message from content array
      const errorMessage = data.content
        .filter((item) => item.type === 'text' && item.text)
        .map((item) => item.text)
        .join('\n');
      return `[File operation failed: ${errorMessage}]`;
    }
  }

  switch (operation) {
    case 'read': {
      // MCP returns results with content array structure
      let content = '';
      if (result.data && typeof result.data === 'object') {
        const data = result.data as { content?: Array<{ type: string; text?: string }> };
        if (data.content && Array.isArray(data.content)) {
          // Extract text from content array
          content = data.content
            .filter((item) => item.type === 'text' && item.text)
            .map((item) => item.text)
            .join('\n');
        }
      }
      
      // Fallback to direct stringification if structure doesn't match
      if (!content && result.data) {
        content = typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2);
      }
      
      return `[File contents of ${filename}]:\n${content}`;
    }
    case 'write':
      return `[Successfully wrote to ${filename}]`;
    case 'list':
      return `[Files in directory]:\n${JSON.stringify(result.data, null, 2)}`;
    default:
      return `[Operation completed successfully]`;
  }
}
