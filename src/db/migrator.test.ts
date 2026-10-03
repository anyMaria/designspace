import { describe, expect, it } from 'vitest';
import { LATEST_SCHEMA_VERSION, migrations, splitStatements } from './migrator';

describe('splitStatements', () => {
  it('splits simple statements on semicolons', () => {
    const sql = 'CREATE TABLE a (id TEXT); CREATE TABLE b (id TEXT);';
    expect(splitStatements(sql)).toEqual(['CREATE TABLE a (id TEXT)', 'CREATE TABLE b (id TEXT)']);
  });

  it('strips line comments', () => {
    const sql = '-- a comment\nCREATE TABLE a (id TEXT); -- trailing\nCREATE TABLE b (id TEXT);';
    const statements = splitStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).not.toContain('--');
  });

  it('ignores semicolons inside quoted strings', () => {
    const sql = "INSERT INTO a (name) VALUES ('a;b'); INSERT INTO a (name) VALUES ('c');";
    expect(splitStatements(sql)).toEqual([
      "INSERT INTO a (name) VALUES ('a;b')",
      "INSERT INTO a (name) VALUES ('c')",
    ]);
  });

  it('handles the real 001_init.sql without throwing and produces multiple statements', () => {
    const statements = splitStatements(migrations[0].sql);
    expect(statements.length).toBeGreaterThan(5);
    for (const s of statements) expect(s.length).toBeGreaterThan(0);
  });

  it('has no trailing empty statement for a file ending in a comment', () => {
    const sql = 'CREATE TABLE a (id TEXT);\n-- trailing comment only\n';
    expect(splitStatements(sql)).toEqual(['CREATE TABLE a (id TEXT)']);
  });
});

describe('migrations', () => {
  it('is ordered starting at version 1 with no gaps or duplicates', () => {
    const versions = migrations.map((m) => m.version);
    const sorted = [...versions].sort((a, b) => a - b);
    expect(versions).toEqual(sorted);
    expect(new Set(versions).size).toBe(versions.length);
    expect(versions[0]).toBe(1);
    versions.forEach((v, i) => expect(v).toBe(i + 1));
    expect(LATEST_SCHEMA_VERSION).toBe(versions[versions.length - 1]);
  });

  it('migration 002 adds the four Patch 1 columns as four statements', () => {
    const statements = splitStatements(migrations[1].sql);
    expect(statements).toHaveLength(4);
    for (const s of statements) expect(s).toMatch(/^ALTER TABLE items ADD COLUMN /);
  });
});
