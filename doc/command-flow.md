# Sideways/Inbound Reply System - Command Flow

## Quick Reference

### Full Cycle (Complete Workflow)

```bash
# Step 1: Amplify Pelpa tweets (alts reply directly to Pelpa)
npm run cli swarm respond

# Step 2: Monitor detects sideways opportunities
npm run cli swarm monitor

# Step 3: Process and post sideways replies
npm run cli swarm sideways

# Step 4: Monitor detects inbound opportunities (replies to our alts)
npm run cli swarm monitor

# Step 5: Process and post inbound replies
npm run cli swarm inbound
```

---

## Convenience Commands

### Option 1: Use `engage` command (runs sideways + inbound together)

```bash
npm run cli swarm respond      # Amplify Pelpa tweets
npm run cli swarm monitor      # Detect sideways opportunities
npm run cli swarm engage       # Process sideways + inbound together
npm run cli swarm monitor      # Detect new inbound opportunities
```

### Option 2: Run individually

```bash
npm run cli swarm respond      # Amplify
npm run cli swarm monitor      # Detect sideways
npm run cli swarm sideways     # Post sideways replies
npm run cli swarm monitor      # Detect inbound
npm run cli swarm inbound      # Post inbound replies
```

---

## Individual Commands Explained

### `npm run cli swarm respond`
**Purpose:** Initial amplification - alts reply directly to Pelpa tweets  
**Sets:** `response_queue.status = 'posted'`  
**Required for:** Sideways detection (monitor checks for `status='posted'` tweets)

### `npm run cli swarm monitor`
**Purpose:** Detect opportunities (sideways and inbound)  
**Does:**
- Scrapes Pelpa timeline
- Flags sideways opportunities (requires `status='posted'` tweets)
- Flags inbound opportunities (requires `sideways_replies` entries)  
**Run:** After `respond` and after `sideways`

### `npm run cli swarm sideways`
**Purpose:** Process and post sideways replies  
**Does:**
- Claims opportunities atomically
- Generates persona-based replies
- Posts replies to comments
- Saves to `sideways_replies` table

### `npm run cli swarm inbound`
**Purpose:** Process and post inbound replies  
**Does:**
- Gets unreplied inbound mentions
- Checks rate limits
- Generates persona-based replies
- Posts replies to @mentions

### `npm run cli swarm engage`
**Purpose:** Run both sideways + inbound together  
**Does:** Runs `sideways` then `inbound` sequentially

### `npm run cli swarm recover`
**Purpose:** Recover stuck opportunities  
**Does:** Resets opportunities stuck in `processed=true` state without `reply_tweet_id`

---

## Typical Daily Workflow

```bash
# Morning: Initial amplification
npm run cli swarm respond

# After respond completes: Detect sideways opportunities
npm run cli swarm monitor

# Process sideways replies
npm run cli swarm sideways

# After sideways posts: Detect inbound opportunities
npm run cli swarm monitor

# Process inbound replies
npm run cli swarm inbound
```

---

## Monitoring Commands

### Check opportunities
```bash
npx ts-node src/test/check-opportunities.ts
```

### Check results
```bash
npx ts-node src/test/check-results.ts
```

### Check migration status
```bash
npx ts-node src/test/check-migration.ts
```

---

## Troubleshooting

### No opportunities detected?
```bash
# Check if tweets are posted
npm run cli swarm respond

# Then run monitor
npm run cli swarm monitor
```

### Stuck opportunities?
```bash
npm run cli swarm recover
```

### Check what's in database
```bash
npx ts-node src/test/check-results.ts
```

---

## Execution Order (CRITICAL)

**MUST run in this order:**

1. `respond` → Creates posted tweets
2. `monitor` → Detects sideways (needs `status='posted'`)
3. `sideways` → Posts sideways replies
4. `monitor` → Detects inbound (needs `sideways_replies`)
5. `inbound` → Posts inbound replies

**Why this order?**
- Monitor checks `response_queue.status='posted'` for sideways detection
- Monitor checks `sideways_replies` table for inbound detection
- Each step depends on the previous step completing

---

## Quick Copy-Paste Sequence

```bash
# Full cycle (copy-paste all at once)
npm run cli swarm respond && \
npm run cli swarm monitor && \
npm run cli swarm sideways && \
npm run cli swarm monitor && \
npm run cli swarm inbound
```

Or use convenience command:
```bash
npm run cli swarm respond && \
npm run cli swarm monitor && \
npm run cli swarm engage && \
npm run cli swarm monitor
```

