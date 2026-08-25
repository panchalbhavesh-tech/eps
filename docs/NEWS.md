# Latest News & News Sentiment Logic

This document explains the architecture and implementation of the **LATEST NEWS** and **N. SENTIMENT** columns in the EPS Grid. This is intended to help other developers understand how data is fetched, cached, and displayed efficiently without hammering APIs or causing excessive re-renders.

---

## 1. Backend Architecture (`backend/main.py`)

### A. Latest News Fetching (`/api/news/{ticker}`)
The backend fetches recent articles using RSS feeds (Google News, Yahoo Finance, Moneycontrol, etc.). 
- **Caching**: Results are stored in an in-memory dictionary `_news_cache` with a Time-To-Live (TTL) of 2 hours. 
- **Deduplication & Sorting**: Articles are deduplicated, sorted newest first, and capped at 12 articles per company.

### B. News Sentiment Analysis (`/api/news-sentiment/{ticker}`)
This endpoint provides the intelligent sentiment analysis seen in the grid.
1. **Reuse Existing Data**: It calls the same `get_company_news()` function. Since that function is cached, evaluating sentiment does *not* cause additional external RSS fetches.
2. **Hash-based LLM Caching**: It hashes the titles of the fetched articles. It only calls the Gemini 1.5 Flash LLM if the hash changes (meaning new articles were published). If the hash matches the cached version, it immediately returns the cached sentiment.
3. **LLM Evaluation**: If new articles exist, they are passed to Gemini with a strict JSON schema prompt to evaluate overall sentiment, confidence, key drivers, and article breakdown (Bullish/Bearish/Neutral).
4. **Fallback Mechanism**: If the Gemini API key is missing or the request fails, it falls back to a deterministic keyword-based heuristic (counting words like "surge", "plunge", "profit", "loss").

### C. Scoring and Tagging Logic (`overallSentiment` and `sentimentScore`)
The core value provided by this module is the categorization of news into tags and an aggregate score.

#### The `sentimentScore` (-100 to +100)
- **Calculation**: Represents the net positivity or negativity of the news flow.
- **LLM Mode**: The LLM assigns this integer based on the severity and impact of the news. A minor contract win might be `+10`, while a massive earnings beat might be `+80`. A regulatory penalty could be `-50`.
- **Fallback Mode**: Calculated mathematically as `((bull_count - bear_count) / total_articles) * 100`, weighted by recency (newer articles count for more).

#### The `overallSentiment` Tags
- **`BULLISH`**: The overarching narrative of the recent news is positive (usually a score > 20).
- **`BEARISH`**: The overarching narrative is negative (usually a score < -20).
- **`NEUTRAL`**: The news is purely informational, immaterial, or lacks strong directional bias (score between -20 and +20).
- **`MIXED`**: Positive and negative news of comparable significance coexist simultaneously (e.g., strong revenue growth but a severe regulatory fine).
- **`INSUFFICIENT_DATA`**: No relevant news was found, or the news retrieved was unrelated to the company.

---

## 2. Frontend Caching Layer (`frontend/src/store/sentimentCache.ts`)

A critical requirement was ensuring that scrolling up/down or paginating the grid does not repeatedly trigger sentiment API calls.

To solve this, we implemented a **Smart Cached Refresh System**:
- **Centralized Store**: `sentimentCache` is a singleton class that holds all fetched sentiment data in a `Map`.
- **Deduplication**: It tracks "in-flight" promises (`_promises`). If 5 different components request the sentiment for "RELIANCE" simultaneously, only *one* network request is made. The other 4 wait for the same promise to resolve.
- **Persistence**: Once data is fetched, it stays in the cache for the entire user session.
- **Manual Refresh**: The `refresh(ticker)` and `refreshBatch(tickers)` methods allow the user to bypass the cache and force an update, which is triggered via the UI.

---

## 3. Frontend UI Components (`frontend/src/pages/Home.tsx`)

### A. LATEST NEWS Column (`NewsCell`)
- Renders a simple `VIEW ↗` button.
- **Lazy Loading**: It only fetches the news data (`/api/news`) when the user clicks the button.
- **Popup Dialog**: Displays the articles in a clean scrollable list with external links and source tags.

### B. N. SENTIMENT Column (`NewsSentimentCell`)
- **Intersection Observer**: The cell only requests data when it actually scrolls into the user's viewport. 
- **Cache Subscription**: The component uses a React `useEffect` to subscribe to the `sentimentCache`. When the cache updates, the component re-renders.
- **Visuals**: Displays the primary score (e.g., `BULLISH +40`) and a sub-line showing confidence and dominant theme.
- **Refresh Icon**: A small refresh icon allows forcing a refresh for that specific row.
- **Header Refresh**: A master refresh icon in the column header collects all currently visible rows and calls `sentimentCache.refreshBatch()` to update them sequentially without overloading the server.
- **Details Popover**: Clicking the cell opens a popover showing the detailed LLM analysis (Key Drivers, Contradictions, and Article Breakdown visual bar).

---

## 4. Summary of Data Flow for Sentiment

1. User scrolls `TCS` into view.
2. `NewsSentimentCell` fires `sentimentCache.fetch('TCS')`.
3. Cache checks memory. Not found. Fires API request to `/api/news-sentiment/TCS`.
4. Backend fetches RSS feeds for TCS (or uses backend cache).
5. Backend hashes article titles. Hash is new.
6. Backend sends articles to Gemini LLM.
7. Gemini returns JSON sentiment. Backend caches it and returns it to frontend.
8. Frontend `sentimentCache` stores it and notifies the `NewsSentimentCell`.
9. `NewsSentimentCell` updates the UI.
10. User scrolls `TCS` out of view, then back into view. `NewsSentimentCell` fires `fetch('TCS')` again. Cache returns data instantly from memory. Zero network requests.
