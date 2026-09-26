---
name: tdd-workflows
description: Enforces test-driven development (TDD) red-green-refactor cycle, automated unit testing with Node.js built-in test runner, mock strategies, and regression assertions.
source: rmyndharis/antigravity-skills
risk: safe
---

# Test-Driven Development (TDD) Skill

## Overview
Enforces the strict Red-Green-Refactor cycle for MapShield Pro. Every critical subsystem (Repositories, Encryption Vault, Network Guard, State Machine, Parser) must have automated, deterministic unit and integration tests.

## The TDD Cycle

### 1. Phase 1 — Red (Write Failing Test First)
Before writing implementation code, write a test defining the exact expected behavior:
```javascript
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

describe('AccountRepo.claimAtomic', () => {
  test('returns null when all accounts are in cooldown or exceeded quota', () => {
    const result = accountRepo.claimAtomic('test-token');
    assert.equal(result, null);
  });
});
```

### 2. Phase 2 — Green (Minimal Implementation to Pass)
Implement only what is necessary to satisfy the test assertions:
- Keep methods focused and small (< 30 lines).
- Avoid premature optimizations.

### 3. Phase 3 — Refactor (Clean Code & Performance)
- Eliminate duplicate logic.
- Extract common SQL helper statements or sanitizers.
- Verify that all tests still pass (`node --test`).

## Core Testing Directives for MapShield Pro
- Use Node.js built-in test runner (`node --test tests/**/*.test.js`) — zero external test runner bloat.
- Use `node:assert/strict` for all equality, exception, and regex checks.
- Isolate SQLite tests using in-memory databases (`:memory:`) or dedicated test files to avoid contaminating production data.
