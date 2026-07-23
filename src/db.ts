import { Database } from "bun:sqlite";

const DB_PATH = "paywise.db";

let db: Database;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.run("PRAGMA journal_mode=WAL");
    db.run("PRAGMA foreign_keys=ON");
    initSchema(db);
    seedResources(db);
  }
  return db;
}

function initSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pay_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      hourly_rate REAL NOT NULL DEFAULT 0,
      pay_frequency TEXT NOT NULL DEFAULT 'bi-weekly' CHECK(pay_frequency IN ('weekly','bi-weekly','monthly')),
      region TEXT NOT NULL DEFAULT '',
      custom_tax_rate REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pay_periods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      pay_profile_id INTEGER NOT NULL,
      hours_worked REAL NOT NULL DEFAULT 0,
      gross_pay REAL NOT NULL DEFAULT 0,
      tax_amount REAL NOT NULL DEFAULT 0,
      net_pay REAL NOT NULL DEFAULT 0,
      insurance_deductions REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (pay_profile_id) REFERENCES pay_profiles(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      due_date TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other' CHECK(category IN ('housing','utilities','subscriptions','food','transportation','insurance','other')),
      priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
      recurring INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS insurance_deductions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      percentage REAL NOT NULL DEFAULT 0,
      fixed_amount REAL,
      per_pay_period INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      url TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function seedResources(db: Database) {
  const count = db.query("SELECT COUNT(*) as c FROM resources").get() as { c: number };
  if (count.c > 0) return;

  const resources = [
    {
      title: "National Foundation for Credit Counseling",
      description: "Free and low-cost financial counseling from certified professionals. Get help with budgeting, debt management, and housing.",
      category: "counseling",
      url: "https://www.nfcc.org",
      phone: "1-800-388-2227",
      region: "US",
    },
    {
      title: "211 Financial Assistance",
      description: "Free, confidential referral service connecting you to local financial assistance programs, food banks, and utility help.",
      category: "assistance",
      url: "https://www.211.org",
      phone: "211",
      region: "US",
    },
    {
      title: "Consumer Financial Protection Bureau",
      description: "Government resources on managing finances, understanding credit, and filing complaints about financial products.",
      category: "education",
      url: "https://www.consumerfinance.gov",
      phone: "1-855-411-2372",
      region: "US",
    },
    {
      title: "Find Your Local Food Bank",
      description: "Feeding America's network of 200 food banks. Find free food and grocery assistance near you.",
      category: "food",
      url: "https://www.feedingamerica.org/find-your-local-foodbank",
      phone: "1-800-771-2303",
      region: "US",
    },
    {
      title: "LIHEAP - Energy Assistance",
      description: "Low Income Home Energy Assistance Program helps families with heating and cooling costs.",
      category: "utilities",
      url: "https://www.acf.hhs.gov/ocs/programs/liheap",
      phone: "1-866-674-6327",
      region: "US",
    },
  ];

  const insert = db.prepare(
    "INSERT INTO resources (title, description, category, url, phone, region) VALUES (?, ?, ?, ?, ?, ?)"
  );

  for (const r of resources) {
    insert.run(r.title, r.description, r.category, r.url, r.phone, r.region);
  }
}

// Ensure a default user exists (single-user mode)
export function ensureUser(): number {
  const db = getDb();
  const row = db.query("SELECT id FROM users LIMIT 1").get() as { id: number } | null;
  if (row) return row.id;
  db.run("INSERT INTO users DEFAULT VALUES");
  return (db.query("SELECT last_insert_rowid() as id").get() as { id: number }).id;
}
