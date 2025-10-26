"""
twscrape reader module
Usage:
  python py/reader.py timeline pelpa333 50 out.json
  python py/reader.py search "from:pelpa333 (keyword)" 50 out.json
"""

import asyncio
import json
import os
import sys
from twscrape import API

async def run():
    if len(sys.argv) < 5:
        print("Usage: python py/reader.py <timeline|search> <query> <limit> <output_file>")
        sys.exit(1)

    kind = sys.argv[1]
    query = sys.argv[2]
    limit = int(sys.argv[3])
    out = sys.argv[4]

    # Initialize API with database path
    db = os.environ.get("TWSCRAPE_DB", "./persist/twscrape.db")
    api = API(pool=db)

    rows = []
    try:
        if kind == "timeline":
            print(f"[reader] Fetching timeline for @{query}...")
            # Use user_tweets_and_replies to get more comprehensive timeline
            async for t in api.user_tweets_and_replies(query.lstrip("@"), limit=limit):
                rows.append({
                    "id": t.id,
                    "url": f"https://x.com/i/web/status/{t.id}",
                    "text": t.rawContent,
                    "date": t.date.isoformat(),
                    "author": t.user.username,
                    "likes": t.likeCount,
                    "retweets": t.retweetCount,
                    "replies": t.replyCount,
                })
        elif kind == "search":
            print(f"[reader] Searching for: {query}...")
            async for t in api.search(query, limit=limit):
                rows.append({
                    "id": t.id,
                    "url": f"https://x.com/i/web/status/{t.id}",
                    "text": t.rawContent,
                    "date": t.date.isoformat(),
                    "author": t.user.username,
                    "likes": t.likeCount,
                    "retweets": t.retweetCount,
                    "replies": t.replyCount,
                })
        else:
            print(f"Error: kind must be 'timeline' or 'search', got '{kind}'")
            sys.exit(1)

        print(f"[reader] Found {len(rows)} tweets")
        
        with open(out, "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)
        
        print(f"[reader] ✅ Saved to {out}")

    except Exception as e:
        print(f"[reader] ❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(run())

