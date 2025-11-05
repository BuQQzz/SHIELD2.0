/**
 * Intent Detector Tests
 * 
 * Tests for file operation intent detection from natural language
 */

import { describe, it, expect } from 'vitest';
import { 
  detectFileOperationIntent, 
  buildFilePath, 
  buildDirectoryPath 
} from './intentDetector';

describe('detectFileOperationIntent', () => {
  describe('Read Intent Detection', () => {
    it('should detect read intent with quoted filename', () => {
      const result = detectFileOperationIntent('read the file "hello world.txt" on my desktop');
      expect(result.operation).toBe('read');
      expect(result.filename).toBe('hello world.txt');
      expect(result.filepath).toBe('~/Desktop/hello world.txt');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should detect read intent with unquoted filename', () => {
      const result = detectFileOperationIntent('read the file notes.txt from desktop');
      expect(result.operation).toBe('read');
      expect(result.filename).toBe('notes.txt');
      expect(result.filepath).toBe('~/Desktop/notes.txt');
    });

    it('should detect read intent with "show me"', () => {
      const result = detectFileOperationIntent('show me the contents of test.txt in documents');
      expect(result.operation).toBe('read');
      expect(result.filename).toBe('test.txt');
      expect(result.filepath).toBe('~/Documents/test.txt');
    });

    it('should detect read intent with "open"', () => {
      const result = detectFileOperationIntent('open the file data.json on desktop');
      expect(result.operation).toBe('read');
      expect(result.filename).toBe('data.json');
    });
  });

  describe('Write Intent Detection', () => {
    it('should detect write intent with quoted filename', () => {
      const result = detectFileOperationIntent('write to "my notes.txt" on desktop');
      expect(result.operation).toBe('write');
      expect(result.filename).toBe('my notes.txt');
      expect(result.filepath).toBe('~/Desktop/my notes.txt');
    });

    it('should detect write intent with "create file"', () => {
      const result = detectFileOperationIntent('create a file called test.txt on desktop');
      expect(result.operation).toBe('write');
      expect(result.filename).toBe('test.txt');
    });

    it('should detect write intent with "save"', () => {
      const result = detectFileOperationIntent('save to output.txt in documents');
      expect(result.operation).toBe('write');
      expect(result.filename).toBe('output.txt');
      expect(result.filepath).toBe('~/Documents/output.txt');
    });

    it('should detect write intent with "make file"', () => {
      const result = detectFileOperationIntent('make a file called config.json with content');
      expect(result.operation).toBe('write');
      expect(result.filename).toBe('config.json');
    });
  });

  describe('Write Intent with Content Extraction', () => {
    it('should extract content from code block', () => {
      const message = `create a file test.py on desktop
\`\`\`python
print("Hello World")
\`\`\``;
      const result = detectFileOperationIntent(message);
      expect(result.operation).toBe('write');
      expect(result.content).toBe('print("Hello World")');
      expect(result.confidence).toBe(0.9); // Higher confidence with content
    });

    it('should extract content from inline code', () => {
      const result = detectFileOperationIntent('write `Hello World` to test.txt on desktop');
      expect(result.operation).toBe('write');
      expect(result.content).toBe('Hello World');
    });

    it('should extract content from quoted text', () => {
      const result = detectFileOperationIntent('save "This is my note content for testing" to notes.txt');
      expect(result.operation).toBe('write');
      expect(result.content).toBe('This is my note content for testing');
    });

    it('should extract content from "with content:" phrase', () => {
      const result = detectFileOperationIntent('create file config.json on desktop with content: {"key": "value"}');
      expect(result.operation).toBe('write');
      expect(result.content).toBe('{"key": "value"}');
    });

    it('should extract content from "containing:" phrase', () => {
      const result = detectFileOperationIntent('make file test.txt on desktop containing some text here');
      expect(result.operation).toBe('write');
      expect(result.content).toBe('some text here');
    });

    it('should have lower confidence without content', () => {
      const result = detectFileOperationIntent('create file test.txt on desktop');
      expect(result.operation).toBe('write');
      expect(result.content).toBeUndefined();
      expect(result.confidence).toBe(0.7);
    });
  });

  describe('List Intent Detection', () => {
    it('should detect list intent for desktop', () => {
      const result = detectFileOperationIntent('list files in my desktop');
      expect(result.operation).toBe('list');
      expect(result.filepath).toBe('~/Desktop');
    });

    it('should detect list intent for documents', () => {
      const result = detectFileOperationIntent('list files in my documents folder');
      expect(result.operation).toBe('list');
      expect(result.filepath).toBe('~/Documents');
    });

    it('should detect list intent with "what files"', () => {
      const result = detectFileOperationIntent('what files are in my desktop?');
      expect(result.operation).toBe('list');
      expect(result.filepath).toBe('~/Desktop');
    });
  });

  describe('No Intent Detection', () => {
    it('should return none for unrelated messages', () => {
      const result = detectFileOperationIntent('what is the weather today?');
      expect(result.operation).toBe('none');
      expect(result.confidence).toBe(0);
    });

    it('should return none for ambiguous messages', () => {
      const result = detectFileOperationIntent('tell me about files');
      expect(result.operation).toBe('none');
    });
  });
});

describe('buildFilePath', () => {
  it('should build desktop path', () => {
    const path = buildFilePath('test.txt', 'desktop');
    expect(path).toBe('~/Desktop/test.txt');
  });

  it('should build documents path', () => {
    const path = buildFilePath('notes.md', 'documents');
    expect(path).toBe('~/Documents/notes.md');
  });

  it('should return null for unknown location', () => {
    const path = buildFilePath('file.txt', 'unknown');
    expect(path).toBeNull();
  });

  it('should return null for null location', () => {
    const path = buildFilePath('file.txt', null);
    expect(path).toBeNull();
  });

  it('should handle filenames with spaces', () => {
    const path = buildFilePath('my file.txt', 'desktop');
    expect(path).toBe('~/Desktop/my file.txt');
  });
});

describe('buildDirectoryPath', () => {
  it('should build desktop directory path', () => {
    const path = buildDirectoryPath('desktop');
    expect(path).toBe('~/Desktop');
  });

  it('should build documents directory path', () => {
    const path = buildDirectoryPath('documents');
    expect(path).toBe('~/Documents');
  });

  it('should return null for unknown location', () => {
    const path = buildDirectoryPath('downloads');
    expect(path).toBeNull();
  });

  it('should be case insensitive', () => {
    const path1 = buildDirectoryPath('Desktop');
    const path2 = buildDirectoryPath('DESKTOP');
    expect(path1).toBe('~/Desktop');
    expect(path2).toBe('~/Desktop');
  });
});
