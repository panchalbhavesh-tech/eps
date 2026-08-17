export interface SentimentData {
  overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'MIXED' | 'INSUFFICIENT_DATA';
  sentimentScore: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  trend: 'IMPROVING' | 'STABLE' | 'DETERIORATING' | 'VOLATILE';
  dominantTheme: string | null;
  articleBreakdown: { bullish: number; bearish: number; neutral: number; mixed: number };
  keyDrivers: string;
  contradictions: string | null;
  articleCount: number;
  lastUpdated: string;
}

type Listener = (data: SentimentData | null, error: boolean) => void;

class SentimentCache {
  private cache = new Map<string, { data: SentimentData; timestamp: number }>();
  private inFlight = new Map<string, Promise<SentimentData | null>>();
  private listeners = new Map<string, Set<Listener>>();
  
  // 4 hour TTL to match backend
  private readonly TTL = 4 * 60 * 60 * 1000; 

  get(ticker: string): SentimentData | null {
    const entry = this.cache.get(ticker);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > this.TTL) {
      // It's stale, but we return it anyway as per requirement: 
      // "Do NOT automatically re-analyze merely because the user scrolls... 
      // explicitly refresh behavior"
      return entry.data;
    }
    
    return entry.data;
  }

  subscribe(ticker: string, listener: Listener): () => void {
    if (!this.listeners.has(ticker)) {
      this.listeners.set(ticker, new Set());
    }
    this.listeners.get(ticker)!.add(listener);

    return () => {
      const set = this.listeners.get(ticker);
      if (set) {
        set.delete(listener);
        if (set.size === 0) {
          this.listeners.delete(ticker);
        }
      }
    };
  }

  private notify(ticker: string, data: SentimentData | null, error: boolean = false) {
    const set = this.listeners.get(ticker);
    if (set) {
      set.forEach(listener => listener(data, error));
    }
  }

  async fetch(ticker: string, name: string, forceRefresh: boolean = false): Promise<SentimentData | null> {
    if (!forceRefresh) {
      const existing = this.get(ticker);
      if (existing) {
        // Already cached, just notify in case
        this.notify(ticker, existing);
        return existing;
      }
    }

    if (this.inFlight.has(ticker)) {
      return this.inFlight.get(ticker)!;
    }

    const promise = (async () => {
      try {
        const res = await window.fetch(`/api/news-sentiment/${ticker}?name=${encodeURIComponent(name || ticker)}`);
        if (!res.ok) throw new Error('API Error');
        const data: SentimentData = await res.json();
        
        if (data) {
          this.cache.set(ticker, { data, timestamp: Date.now() });
          this.notify(ticker, data, false);
          return data;
        } else {
          this.notify(ticker, null, true);
          return null;
        }
      } catch (err) {
        this.notify(ticker, null, true);
        return null;
      } finally {
        this.inFlight.delete(ticker);
      }
    })();

    this.inFlight.set(ticker, promise);
    return promise;
  }

  async refreshBatch(items: { ticker: string; name: string }[], concurrencyLimit: number = 3) {
    const queue = [...items];
    const inProgress = new Set<Promise<void>>();

    while (queue.length > 0 || inProgress.size > 0) {
      while (inProgress.size < concurrencyLimit && queue.length > 0) {
        const item = queue.shift()!;
        // Force refresh
        const p = this.fetch(item.ticker, item.name, true).then(() => {}).catch(() => {});
        inProgress.add(p);
        p.finally(() => inProgress.delete(p));
      }
      if (inProgress.size > 0) {
        await Promise.race(inProgress);
      }
    }
  }
}

export const sentimentCache = new SentimentCache();
