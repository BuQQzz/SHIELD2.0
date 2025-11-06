# Web Search & Local Caching Feature

## Overview

Enable SHIELD's local LLM to optionally search the web, fetch content, and cache it locally for offline access. This feature maintains SHIELD's privacy-first philosophy while adding powerful internet-connected capabilities.

## Core Principles (Priority Order)

### 1. 🔒 Privacy First

- **Zero Tracking**: No telemetry, analytics, or user behavior tracking
- **User Control**: Explicit opt-in for all web access
- **Local Storage**: All fetched data stored locally, never sent to external servers
- **Privacy-Focused Providers**: DuckDuckGo, SearXNG (self-hosted), Brave Search
- **Request Anonymization**: Custom user agents, no cookies, no persistent identifiers
- **Transparent Operation**: Clear visual indicators when web access occurs
- **Data Ownership**: Users can export, inspect, and delete all cached data

### 2. ✨ Ease of Use

- **Simple Toggle**: One-click enable/disable in settings
- **Auto-Detection**: LLM automatically determines when web search is needed
- **Visual Feedback**: Clear indicators showing web sources in responses
- **Minimal Configuration**: Works out-of-box with sensible defaults
- **Graceful Fallback**: Works offline with cached data
- **Clear Documentation**: In-app help explains feature and privacy implications

### 3. ⚡ Performance

- **Local Caching**: Fetch once, use offline forever
- **Lightweight Scraping**: Efficient HTML parsing, text extraction only
- **Background Operations**: Non-blocking web requests
- **Smart Caching**: Deduplicate content, compression
- **Resource Limits**: Configurable cache size, automatic cleanup

## Architecture

### High-Level Flow

```
┌─────────────┐
│   User      │
│   Query     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│  LLM Analyzes Query                 │
│  "Does this need web search?"       │
└──────┬──────────────────────────────┘
       │
       ▼
   ┌───┴───┐
   │ Yes?  │
   └───┬───┘
       │
       ▼
┌─────────────────────────────────────┐
│  Check Local Cache First            │
│  (Semantic search if RAG enabled)   │
└──────┬──────────────────────────────┘
       │
       ▼
   ┌───┴───────┐
   │ Cached?   │
   └───┬───────┘
       │ No
       ▼
┌─────────────────────────────────────┐
│  Privacy-Focused Search             │
│  (DuckDuckGo / SearXNG)             │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Fetch & Parse Content              │
│  (Text only, strip trackers)        │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  Cache Locally                      │
│  (Encrypted JSON/SQLite)            │
└──────┬──────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  LLM Generates Response             │
│  with Sources Attribution           │
└─────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Basic Web Search (MVP) - 2 weeks

**Goal**: Fetch web content and cache locally with privacy focus

**Features**:

- ✅ DuckDuckGo search integration (privacy-focused, no API key needed)
- ✅ Simple web page fetching with content extraction
- ✅ Local JSON-based cache with metadata
- ✅ Manual trigger (button in chat interface)
- ✅ Privacy settings (enable/disable, clear cache)
- ✅ Visual source attribution in responses

**Privacy Measures**:

- No cookies or persistent storage in browser
- Random user agent rotation
- No referrer headers
- DNS-over-HTTPS (DoH) support
- Request sanitization

**Components**:

```typescript
// electron/services/WebSearchService.ts
interface WebSearchService {
  search(query: string, options: PrivacyOptions): Promise<SearchResult[]>;
  fetchPage(url: string): Promise<PageContent>;
  cacheContent(content: PageContent): Promise<void>;
  getCached(url: string): Promise<PageContent | null>;
  clearCache(): Promise<void>;
  exportCache(): Promise<string>; // Export as JSON for user inspection
}

interface PrivacyOptions {
  userAgent?: string;
  useDoH?: boolean; // DNS-over-HTTPS
  maxRetries?: number;
  timeout?: number;
}
```

### Phase 2: LLM Tool Integration - 1 week

**Goal**: Let LLM decide when to search automatically

**Features**:

- ✅ Tool/function calling support in llama.cpp
- ✅ LLM decides when web search is needed
- ✅ Multi-turn conversations with web context
- ✅ Source tracking and citation

**Privacy Measures**:

- User confirmation before first web search in session
- Privacy notice in UI
- Per-conversation web access toggle

**Tool Definition**:

```typescript
const webSearchTool = {
  type: "function",
  function: {
    name: "search_web",
    description:
      "Search the internet for current information when local knowledge is insufficient. Use for: recent events, current data, specific facts not in training data.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query optimized for search engines",
        },
        numResults: {
          type: "number",
          description: "Number of results to fetch (1-5)",
          default: 3,
        },
      },
      required: ["query"],
    },
  },
};
```

### Phase 3: RAG Enhancement - 2-3 weeks

**Goal**: Semantic search over cached content

**Features**:

- ✅ Embedding model integration (all-MiniLM-L6-v2, 80MB)
- ✅ Vector database for semantic search (LanceDB)
- ✅ Chunking and indexing of cached content
- ✅ Hybrid search (keyword + semantic)
- ✅ Automatic context expansion

**Privacy Measures**:

- All embeddings generated locally
- No external API calls for embeddings
- Vector DB stored locally

**Storage Structure**:

```typescript
interface CachedContent {
  id: string;
  url: string;
  title: string;
  content: string;
  chunks: ContentChunk[];
  metadata: {
    fetchedAt: Date;
    source: string;
    contentType: string;
    wordCount: number;
    language?: string;
  };
  privacy: {
    userAgent: string;
    searchQuery?: string;
    cacheExpiry?: Date;
  };
}

interface ContentChunk {
  id: string;
  text: string;
  embedding?: number[]; // 384-dim vector
  position: number;
  metadata: {
    heading?: string;
    relevanceScore?: number;
  };
}
```

## User Interface Design

### Settings Panel - Internet Access

```
⚙️ Settings → Internet Access

┌─────────────────────────────────────────┐
│ 🌐 Web Search Capabilities             │
├─────────────────────────────────────────┤
│                                         │
│ Enable Web Search           [Toggle: ON]│
│ Let AI access the internet for current │
│ information and facts.                  │
│                                         │
│ 🔒 Privacy Protection: All searches use│
│    privacy-focused providers with no   │
│    tracking or data collection.        │
│                                         │
├─────────────────────────────────────────┤
│ Search Provider                         │
│ ○ DuckDuckGo (Recommended)             │
│   Privacy-focused, no API key needed    │
│ ○ SearXNG (Self-hosted)                │
│   Complete privacy, requires setup      │
│ ○ Brave Search                         │
│   Requires API key, $5/month           │
│                                         │
├─────────────────────────────────────────┤
│ Behavior                                │
│                                         │
│ □ Automatic Search                     │
│   Let AI decide when to search web     │
│                                         │
│ □ Always Ask Permission                │
│   Confirm before each web request      │
│                                         │
│ Max Results per Search: [3] ▼          │
│                                         │
├─────────────────────────────────────────┤
│ Local Cache                             │
│                                         │
│ Cache Size: 127 MB / 500 MB           │
│ [████████░░░░░░] 25%                   │
│                                         │
│ Cached Pages: 48                       │
│ Last Cleanup: 2 hours ago              │
│                                         │
│ [Clear Cache] [Export Cache] [Settings]│
│                                         │
├─────────────────────────────────────────┤
│ Privacy Controls                        │
│                                         │
│ User Agent                              │
│ [Custom...]                      ▼     │
│                                         │
│ □ Save Search History                  │
│ □ Enable DNS-over-HTTPS                │
│ ☑ Strip Tracking Parameters            │
│ ☑ Block Third-Party Resources          │
│                                         │
│ [Advanced Privacy Settings...]          │
└─────────────────────────────────────────┘
```

### Chat Interface Integration

**Input Area**:

```
┌─────────────────────────────────────────┐
│ Type your message...                    │
│                                         │
│ [🌐 Web Search: ON] [📎] [⚙️] [Send]   │
└─────────────────────────────────────────┘
```

**AI Response with Web Sources**:

```
┌─────────────────────────────────────────┐
│ 🤖 Assistant                            │
├─────────────────────────────────────────┤
│ According to recent research, quantum   │
│ computing has made significant advances │
│ in error correction. The new technique  │
│ reduces errors by 90% compared to...    │
│                                         │
│ ───────────────────────────────────────│
│ 📚 Sources:                            │
│ • Nature - Quantum Error Correction     │
│   ↗️ Cached 5 mins ago                 │
│ • MIT News - Breakthrough in Quantum... │
│   ↗️ Cached 2 hours ago (expires in 1d)│
│                                         │
│ [View Source Details] [Update Cache]    │
└─────────────────────────────────────────┘
```

**Web Search Indicator** (while searching):

```
┌─────────────────────────────────────────┐
│ 🔍 Searching the web...                │
│ • Querying DuckDuckGo                   │
│ • Found 5 results                       │
│ • Fetching top 3 pages... (2/3)        │
│                                         │
│ 🔒 Privacy: Using anonymized requests  │
└─────────────────────────────────────────┘
```

## Privacy-First Technical Implementation

### 1. Privacy-Focused Search

**DuckDuckGo HTML Scraping** (No API Key, No Tracking):

```typescript
async searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const sanitizedQuery = this.sanitizeQuery(query)
  const userAgent = this.getRandomUserAgent()

  const response = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(sanitizedQuery)}`,
    {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': '', // No referrer
        'DNT': '1', // Do Not Track
      },
      // No cookies, no credentials
    }
  )

  // Parse results, strip all tracking links
  return this.parseResults(await response.text())
}
```

### 2. Content Fetching with Privacy

```typescript
async fetchPage(url: string): Promise<PageContent> {
  // Strip tracking parameters
  const cleanUrl = this.removeTrackingParams(url)

  // Check robots.txt
  if (!await this.isAllowedByRobots(cleanUrl)) {
    throw new Error('Blocked by robots.txt')
  }

  const page = await this.browser.newPage()

  // Block trackers, ads, analytics
  await page.setRequestInterception(true)
  page.on('request', (req) => {
    const blockedDomains = [
      'google-analytics.com',
      'facebook.com/tr',
      'doubleclick.net',
      // ... comprehensive tracker list
    ]

    if (blockedDomains.some(d => req.url().includes(d))) {
      req.abort()
    } else {
      req.continue()
    }
  })

  await page.goto(cleanUrl, { waitUntil: 'domcontentloaded' })

  // Extract clean text content only
  const content = await page.evaluate(() => {
    // Use Readability.js or similar
    return document.body.innerText
  })

  await page.close()

  return {
    url: cleanUrl,
    content: this.sanitizeContent(content),
    fetchedAt: new Date()
  }
}
```

### 3. Encrypted Local Storage

```typescript
class PrivacyCache {
  private encryptionKey: Buffer;

  async cacheContent(content: PageContent): Promise<void> {
    const encrypted = await this.encrypt(JSON.stringify(content));

    await this.db.put({
      id: this.hashUrl(content.url),
      data: encrypted,
      metadata: {
        domain: new URL(content.url).hostname,
        cachedAt: Date.now(),
        size: encrypted.length,
      },
    });
  }

  private encrypt(data: string): Promise<Buffer> {
    // AES-256-GCM encryption
    const cipher = crypto.createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    // ... encryption logic
  }
}
```

## Privacy Documentation for Users

We'll add an in-app privacy notice:

```
┌─────────────────────────────────────────┐
│ 🔒 Web Search Privacy Notice           │
├─────────────────────────────────────────┤
│                                         │
│ When you enable web search, SHIELD:    │
│                                         │
│ ✅ Uses privacy-focused search engines │
│ ✅ Stores all data locally on your PC  │
│ ✅ Never sends your data to servers    │
│ ✅ Blocks trackers and analytics       │
│ ✅ Uses anonymous requests             │
│                                         │
│ ❌ No telemetry or usage tracking      │
│ ❌ No data collection or profiling     │
│ ❌ No persistent identifiers           │
│                                         │
│ You can export or delete all cached    │
│ data at any time.                       │
│                                         │
│ [Learn More] [Accept] [Decline]         │
└─────────────────────────────────────────┘
```

## Performance Optimizations

### Caching Strategy

- **Memory Cache**: 50 most recent/frequent pages in RAM
- **Disk Cache**: Encrypted SQLite database for persistence
- **Compression**: gzip compression for text content
- **Deduplication**: Hash-based deduplication of identical content

### Background Processing

- **Queue System**: Non-blocking web requests
- **Batch Fetching**: Fetch multiple pages concurrently (max 3)
- **Timeout Management**: 10s timeout per request
- **Retry Logic**: Exponential backoff for failed requests

### Resource Limits

```typescript
interface CacheConfig {
  maxSizeMB: 500; // Max cache size
  maxPages: 1000; // Max cached pages
  maxAgeHours: 168; // 7 days default expiry
  cleanupThresholdMB: 450; // Auto-cleanup trigger
  compressionLevel: 6; // gzip level 1-9
}
```

## Dependencies

### Core Dependencies

```json
{
  "dependencies": {
    "cheerio": "^1.0.0", // HTML parsing (500KB)
    "@mozilla/readability": "^0.5.0", // Content extraction (50KB)
    "playwright-core": "^1.40.0", // Headless browser (minimal)
    "better-sqlite3": "^9.2.0", // Local database (fast)
    "duckduckgo-search": "^6.0.0" // DDG search wrapper
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.8"
  }
}
```

**Total Bundle Impact**: ~15-20MB (mostly Playwright)

### Optional (Phase 3 - RAG)

```json
{
  "dependencies": {
    "vectordb": "^0.4.0", // LanceDB (2MB)
    "@xenova/transformers": "^2.10.0" // Embedding model (local)
  }
}
```

## Testing Strategy

### Privacy Testing

- ✅ Verify no external API calls without user consent
- ✅ Confirm tracker blocking works
- ✅ Validate encryption at rest
- ✅ Test cache export/delete functionality
- ✅ Verify no telemetry in production builds

### Functional Testing

- ✅ Search accuracy and relevance
- ✅ Content extraction quality
- ✅ Cache hit/miss logic
- ✅ Offline operation with cached data
- ✅ Error handling (network failures, timeouts)

### Performance Testing

- ✅ Cache lookup speed (<50ms)
- ✅ Web fetch timing (3-10s acceptable)
- ✅ Memory usage under load
- ✅ Cache size management

## Security Considerations

### Threats & Mitigations

**1. Malicious Web Content**

- ✅ Content sanitization (strip scripts, iframes)
- ✅ Text-only extraction
- ✅ Sandboxed browser context

**2. Privacy Leaks**

- ✅ No cookies or localStorage persistence
- ✅ Request header sanitization
- ✅ URL parameter cleaning

**3. Cache Poisoning**

- ✅ URL validation
- ✅ Content hash verification
- ✅ Source attribution

## Success Metrics

### Privacy (Most Important)

- ✅ Zero external tracking detected
- ✅ All data stored locally
- ✅ User has full control (export/delete)
- ✅ Privacy audit passes

### Ease of Use

- ✅ One-click enable in settings
- ✅ Auto-detection works 90%+ of time
- ✅ Clear source attribution
- ✅ No configuration required for basic use

### Performance

- ✅ Cache hit rate >70%
- ✅ Web fetch <10s average
- ✅ Memory usage <100MB additional
- ✅ No UI blocking during fetch

## Future Enhancements (Post-MVP)

### Advanced Privacy

- Tor integration for anonymous requests
- VPN compatibility testing
- I2P support for ultimate privacy

### Advanced Features

- PDF and document parsing
- YouTube transcript extraction
- Academic paper search (arXiv, PubMed)
- Code repository search (GitHub, GitLab)

### Performance

- Predictive prefetching
- Smart cache preloading
- Distributed caching (optional)

---

**Next Steps**:

1. Review this specification
2. Approve Phase 1 scope
3. Create implementation branch
4. Start with privacy-focused search integration

**Timeline**:

- Phase 1 MVP: 2 weeks
- Phase 2 Tool Integration: 1 week
- Phase 3 RAG: 2-3 weeks
- **Total**: 5-6 weeks to full feature
