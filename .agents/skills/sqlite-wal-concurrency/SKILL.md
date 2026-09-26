---
name: sqlite-wal-concurrency
description: SQLite 3 Write-Ahead Logging (WAL) concurrency, atomic reservation locks, BEGIN IMMEDIATE transactions, leak-free connection pooling, and compound indices.
source: mapshield-pro / better-sqlite3
risk: safe
---

# SQLite WAL & Atomic Concurrency Skill

## Overview
High-concurrency desktop applications using SQLite must avoid database lock contention (`SQLITE_BUSY`), race conditions among worker threads, and memory leaks. This skill defines strict guidelines for 100% ACID consistency and concurrent performance.

## Mandatory Rules & Patterns

### 1. Connection-Time PRAGMA Configuration
Every `better-sqlite3` instance must configure these PRAGMAs immediately upon opening:
```javascript
const db = new Database('data/mapshield.db', { timeout: 5000 });

db.pragma('journal_mode = WAL');        // Concurrent readers & single writer without blocking
db.pragma('synchronous = NORMAL');      // Fast, safe for WAL mode (prevents unnecessary fsync)
db.pragma('busy_timeout = 5000');       // Automatically wait up to 5s on locked tables
db.pragma('cache_size = -64000');       // 64MB dedicated memory cache
db.pragma('foreign_keys = ON');         // Enforce referential integrity
db.pragma('temp_store = MEMORY');       // Keep temporary tables/indices in RAM
```

### 2. Atomic Reservation Lock (The Anti-Race Condition Pattern)
When multiple parallel workers claim an item from a queue (e.g. Accounts or Targets), never perform a separate `SELECT` followed by an `UPDATE`. Always execute an **Atomic Reservation Query**:

```javascript
// Claim 1 ready account atomically without race conditions
const claimAccountStmt = db.prepare(`
  UPDATE accounts
  SET status = 'reserved',
      lock_token = ?,
      locked_until = datetime('now', '+5 minutes'),
      updated_at = CURRENT_TIMESTAMP
  WHERE id = (
    SELECT id FROM accounts
    WHERE status = 'ready'
      AND daily_report_count < max_daily_reports
      AND (cooldown_until IS NULL OR cooldown_until < CURRENT_TIMESTAMP)
      AND (lock_token IS NULL OR locked_until < CURRENT_TIMESTAMP)
    ORDER BY trust_score DESC, daily_report_count ASC
    LIMIT 1
  )
  RETURNING *;
`);

const reservedAccount = claimAccountStmt.get(lockToken);
```

### 3. Immediate Transactions
Wrap multi-statement writes in `db.transaction()` using `immediate` mode to acquire the write lock before executing queries, preventing deadlocks:
```javascript
const executeAtomicJob = db.transaction((jobData) => {
  // All statements inside this block run under BEGIN IMMEDIATE
  targetRepo.markProcessing(jobData.targetId);
  jobRepo.create(jobData);
});

// Run with immediate locking
executeAtomicJob.immediate(payload);
```

### 4. Compound Index Optimization
Always create compound indices whose leading columns match the `WHERE` filters and trailing columns match `ORDER BY`:
```sql
-- Fast account dispatch index
CREATE INDEX IF NOT EXISTS idx_accounts_dispatch
    ON accounts(status, cooldown_until, daily_report_count);

-- Fast target dispatch index
CREATE INDEX IF NOT EXISTS idx_targets_dispatch
    ON review_targets(status, priority DESC, locked_until);
```

### 5. WAL Checkpointing & Process Shutdown
On application exit or backup, checkpoint and truncate the WAL file:
```javascript
function gracefulShutdown(db) {
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
}
```
