/**
 * Shared types for web search functionality
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export interface PageContent {
  url: string;
  title: string;
  content: string;
  textContent: string;
  excerpt: string;
  byline?: string;
  length: number;
  fetchedAt: Date;
  metadata: {
    domain: string;
    contentType?: string;
    language?: string;
  };
}

export interface PrivacyOptions {
  userAgent?: string;
  timeout?: number;
  blockTrackers?: boolean;
  useRandomUA?: boolean;
}
