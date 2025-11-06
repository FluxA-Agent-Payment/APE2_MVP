// Type stub for better-sqlite3 when not installed
// Install with: npm install better-sqlite3

declare module 'better-sqlite3' {
  export default class Database {
    constructor(path: string);
    exec(sql: string): void;
    prepare(sql: string): any;
    close(): void;
    transaction(fn: () => void): () => void;
  }
}

