import { DatabaseSync } from "node:sqlite";
import { setDb } from "../src/db/index.js";
import { SCHEMA_SQL } from "../src/db/schema.js";

// Set required env vars for tests
process.env.FINCRA_API_BASE_URL = "http://localhost:4000";
process.env.FINCRA_SECRET_KEY = "sk_test_afrikart_secret";
process.env.FINCRA_PUBLIC_KEY = "pk_test_afrikart_public";
process.env.FINCRA_WEBHOOK_SECRET = "whsec_afrikart_secret";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "error"; // suppress logs during tests

// Fresh in-memory DB for each test file
const testDb = new DatabaseSync(":memory:");
testDb.exec(SCHEMA_SQL);
setDb(testDb);
