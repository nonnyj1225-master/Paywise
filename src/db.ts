import { Database } from "bun:sqlite";

const DB_PATH = "paywise.db";

let db: Database;

export function getDb(): Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.run("PRAGMA journal_mode=WAL");
    db.run("PRAGMA foreign_keys=ON");
    initSchema(db);
    migrateAuth(db);
    migratePayProfiles(db);
    migratePayPeriods(db);
    migrateBillsFrequencyAndSoftDelete(db);
    migrateSavingsGoals(db);
    addIndexes(db);
    seedResources(db);
  }
  return db;
}

function initSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password_hash TEXT,
      session_token TEXT,
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
      active INTEGER NOT NULL DEFAULT 1,
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

// ── Migration: add auth columns to existing users table ──
function migrateAuth(db: Database) {
  const tableInfo = db
    .query("PRAGMA table_info(users)")
    .all() as Array<{ name: string }>;

  const hasEmail = tableInfo.some((col) => col.name === "email");
  if (!hasEmail) {
    db.run("ALTER TABLE users ADD COLUMN email TEXT UNIQUE");
  }

  const hasPasswordHash = tableInfo.some((col) => col.name === "password_hash");
  if (!hasPasswordHash) {
    db.run("ALTER TABLE users ADD COLUMN password_hash TEXT");
  }

  const hasSessionToken = tableInfo.some((col) => col.name === "session_token");
  if (!hasSessionToken) {
    db.run("ALTER TABLE users ADD COLUMN session_token TEXT");
  }
}

// ── Migration: add job history columns to pay_profiles ──
function migratePayProfiles(db: Database) {
  const tableInfo = db
    .query("PRAGMA table_info(pay_profiles)")
    .all() as Array<{ name: string }>;

  const hasLabel = tableInfo.some((col) => col.name === "label");
  if (!hasLabel) {
    db.run("ALTER TABLE pay_profiles ADD COLUMN label TEXT");
  }

  const hasIsActive = tableInfo.some((col) => col.name === "is_active");
  if (!hasIsActive) {
    db.run("ALTER TABLE pay_profiles ADD COLUMN is_active INTEGER DEFAULT 1");
  }

  const hasStartedAt = tableInfo.some((col) => col.name === "started_at");
  if (!hasStartedAt) {
    db.run("ALTER TABLE pay_profiles ADD COLUMN started_at TEXT");
  }

  const hasEndedAt = tableInfo.some((col) => col.name === "ended_at");
  if (!hasEndedAt) {
    db.run("ALTER TABLE pay_profiles ADD COLUMN ended_at TEXT");
  }

  // Set defaults for existing rows: if no label, use a generic one; if no started_at, use created_at
  db.run("UPDATE pay_profiles SET label = 'My Job' WHERE label IS NULL OR label = ''");
  db.run("UPDATE pay_profiles SET is_active = 1 WHERE is_active IS NULL");
  db.run("UPDATE pay_profiles SET started_at = created_at WHERE started_at IS NULL");
}

// ── Migration: pay period what-if inclusion ──
function migratePayPeriods(db: Database) {
  const tableInfo = db
    .query("PRAGMA table_info(pay_periods)")
    .all() as Array<{ name: string }>;

  if (!tableInfo.some((col) => col.name === "active")) {
    db.run("ALTER TABLE pay_periods ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
  }

  db.run("UPDATE pay_periods SET active = 1 WHERE active IS NULL");
}

// ── Migration: bills frequency + soft delete ──
function migrateBillsFrequencyAndSoftDelete(db: Database) {
  const tableInfo = db
    .query("PRAGMA table_info(bills)")
    .all() as Array<{ name: string }>;

  const hasFrequency = tableInfo.some((col) => col.name === "frequency");
  if (!hasFrequency) {
    db.run("ALTER TABLE bills ADD COLUMN frequency TEXT NOT NULL DEFAULT 'monthly'");
  }

  const hasDeletedAt = tableInfo.some((col) => col.name === "deleted_at");
  if (!hasDeletedAt) {
    db.run("ALTER TABLE bills ADD COLUMN deleted_at TEXT");
  }
}

// ── Migration: savings_goals table ──
function migrateSavingsGoals(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS savings_goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      category TEXT DEFAULT 'other',
      target_date TEXT,
      icon TEXT DEFAULT '🎯',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
}

// ── Performance indexes on user_id columns ──
function addIndexes(db: Database) {
  db.run("CREATE INDEX IF NOT EXISTS idx_pay_profiles_user_id ON pay_profiles(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_pay_periods_user_id ON pay_periods(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_bills_user_id ON bills(user_id)");
  db.run("CREATE INDEX IF NOT EXISTS idx_insurance_deductions_user_id ON insurance_deductions(user_id)");
}

// ── Seed shared resources (public, not user-scoped) ──
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
    {
      title: "California Department of Financial Protection & Innovation",
      description: "CA state agency offering financial education, consumer protection, and free counseling referrals for California residents.",
      category: "counseling",
      url: "https://dfpi.ca.gov",
      phone: "1-866-275-2677",
      region: "CA",
    },
    {
      title: "Texas Financial Education Endowment",
      description: "Free financial coaching, budgeting workshops, and debt management programs for Texans. Available in English and Spanish.",
      category: "education",
      url: "https://www.tfee.org",
      phone: "1-512-555-0190",
      region: "TX",
    },
    {
      title: "NYC Financial Empowerment Centers",
      description: "Free one-on-one professional financial counseling for New Yorkers. Help with debt, budgeting, savings, and credit.",
      category: "counseling",
      url: "https://www.nyc.gov/site/dca/consumers/get-free-financial-counseling.page",
      phone: "311",
      region: "NY",
    },
    {
      title: "Florida Prosperity Partnership",
      description: "Statewide coalition providing free financial coaching, tax preparation assistance, and benefits screening for Florida residents.",
      category: "assistance",
      url: "https://www.floridaprosperity.org",
      phone: "1-850-555-0170",
      region: "FL",
    },
    {
      title: "Illinois Financial Wellness Hub",
      description: "Free financial literacy resources, workshops, and one-on-one coaching for Illinois residents through the state treasurer's office.",
      category: "education",
      url: "https://www.illinoistreasurer.gov",
      phone: "1-312-555-0180",
      region: "IL",
    },
  ];

  const insert = db.prepare(
    "INSERT INTO resources (title, description, category, url, phone, region) VALUES (?, ?, ?, ?, ?, ?)"
  );

  for (const r of resources) {
    insert.run(r.title, r.description, r.category, r.url, r.phone, r.region);
  }
}
