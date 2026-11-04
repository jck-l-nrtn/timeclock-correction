/**
 * End-to-end HTTP test: the real Express app against in-process dynalite,
 * Jibble stubbed (no creds). TEMPORARY.
 */
import dynalite from "dynalite";
import {
  CreateTableCommand,
  DynamoDBClient,
  type GlobalSecondaryIndex,
} from "@aws-sdk/client-dynamodb";

const PORT = 4200;
const DB_PORT = 4571;
process.env.DYNAMO_ENDPOINT = `http://localhost:${DB_PORT}`;
process.env.TABLE_NAME = "TimeclockHttp";
process.env.AWS_REGION = "us-east-1";
process.env.SESSION_SECRET = "testsecret";
process.env.MASTER_ADMIN_EMAIL = "master@co.com";
process.env.MASTER_ADMIN_PASSWORD = "master-secret";
process.env.PORT = String(PORT);
process.env.NODE_ENV = "development";
// Force the Jibble stub (override any creds from .env) so applyCorrection is
// deterministic ("manual" -> status stays approved).
process.env.JIBBLE_CLIENT_ID = "";
process.env.JIBBLE_CLIENT_SECRET = "";

const server = dynalite({ createTableMs: 0 });
await new Promise<void>((r) => server.listen(DB_PORT, () => r()));

const admin = new DynamoDBClient({
  region: "us-east-1",
  endpoint: process.env.DYNAMO_ENDPOINT,
  credentials: { accessKeyId: "local", secretAccessKey: "local" },
});
const gsi = (n: number): GlobalSecondaryIndex => ({
  IndexName: `GSI${n}`,
  KeySchema: [
    { AttributeName: `GSI${n}PK`, KeyType: "HASH" },
    { AttributeName: `GSI${n}SK`, KeyType: "RANGE" },
  ],
  Projection: { ProjectionType: "ALL" },
  ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
});
await admin.send(
  new CreateTableCommand({
    TableName: "TimeclockHttp",
    AttributeDefinitions: Array.from({ length: 4 }, (_, i) => i + 1)
      .flatMap((n) => [
        { AttributeName: `GSI${n}PK`, AttributeType: "S" as const },
        { AttributeName: `GSI${n}SK`, AttributeType: "S" as const },
      ])
      .concat([
        { AttributeName: "PK", AttributeType: "S" },
        { AttributeName: "SK", AttributeType: "S" },
      ]),
    KeySchema: [
      { AttributeName: "PK", KeyType: "HASH" },
      { AttributeName: "SK", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [gsi(1), gsi(2), gsi(3), gsi(4)],
    ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
  })
);

// Start the app.
await import("../src/index.js");
await new Promise((r) => setTimeout(r, 500));
const base = `http://localhost:${PORT}`;
const j = (r: Response) => r.json() as Promise<any>;
const ok = (c: boolean, m: string) => console.log(`${c ? "✅" : "❌"} ${m}`);

const cookieFrom = (r: Response) => (/session=[^;]+/.exec(r.headers.get("set-cookie") || "") || [""])[0];
async function devLogin(email: string, opts: Record<string, unknown> = {}): Promise<string> {
  const r = await fetch(`${base}/api/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, ...opts }),
  });
  return cookieFrom(r);
}

// Seed people via dev-login: boss (admin), jane (reports to boss), bob (reports elsewhere).
const BOSS = await devLogin("boss@co.com", { fullName: "The Boss", isAdmin: true });
const JANE = await devLogin("jane@co.com", { fullName: "Jane Doe", managerEmail: "boss@co.com" });
const BOB = await devLogin("bob@co.com", { fullName: "Bob Ross", managerEmail: "someone-else@co.com" });
ok(!!BOSS && !!JANE && !!BOB, "dev-login issues sessions");

// Master admin via break-glass login.
const MASTER = cookieFrom(
  await fetch(`${base}/api/auth/master-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "master@co.com", password: "master-secret" }),
  })
);
ok(!!MASTER, "master-login works");

// 1. health
ok((await (await fetch(`${base}/api/health`)).json()).ok === true, "health");

// 2. submit requires a session (401 without one)
ok(
  (await fetch(`${base}/api/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: "2026-06-20", eventType: "out", intendedTime: "17:00", reason: "x", affirmed: true }),
  })).status === 401,
  "POST /api/requests without session -> 401"
);

// 3. submit as jane (identity from session)
const created = await j(
  await fetch(`${base}/api/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: JANE },
    body: JSON.stringify({ date: "2026-06-20", eventType: "out", intendedTime: "17:00", reason: "forgot", affirmed: true }),
  })
);
ok(created.status === "pending" && created.employeeEmail === "jane@co.com", "submit as jane -> pending, identity from session");

// 4. jane lists her own requests
const mine = await j(await fetch(`${base}/api/requests`, { headers: { Cookie: JANE } }));
ok(Array.isArray(mine) && mine.length === 1, "jane lists her requests");

// 5. bob submits — routed to his (different) manager
const bobReq = await j(
  await fetch(`${base}/api/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: BOB },
    body: JSON.stringify({ date: "2026-06-21", eventType: "in", intendedTime: "08:00", reason: "forgot", affirmed: true }),
  })
);
ok(bobReq.status === "pending", "bob submits -> pending");

// 6. ORG ROUTING: boss sees jane's request but NOT bob's; master sees both.
const bossQueue = await j(await fetch(`${base}/api/admin/requests?status=pending`, { headers: { Cookie: BOSS } }));
ok(bossQueue.some((r: any) => r.id === created.id) && !bossQueue.some((r: any) => r.id === bobReq.id), "boss sees only direct reports' requests");
const masterQueue = await j(await fetch(`${base}/api/admin/requests?status=pending`, { headers: { Cookie: MASTER } }));
ok(masterQueue.some((r: any) => r.id === created.id) && masterQueue.some((r: any) => r.id === bobReq.id), "master sees all requests");

// 7. boss may NOT decide bob's request (not their report)
ok(
  (await fetch(`${base}/api/admin/requests/${bobReq.id}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: BOSS },
    body: JSON.stringify({ decision: "approved" }),
  })).status === 403,
  "boss cannot decide a non-report's request -> 403"
);

// 8. boss approves jane's (stub Jibble -> manual -> status approved)
const decided = await j(
  await fetch(`${base}/api/admin/requests/${created.id}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: BOSS },
    body: JSON.stringify({ decision: "approved", note: "ok" }),
  })
);
ok(decided.status === "approved" && decided.decidedBy === "The Boss" && !!decided.digitalRecord, "approve -> decidedBy + record");

// 9. acknowledge (via session)
const ack = await j(
  await fetch(`${base}/api/requests/${created.id}/acknowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: JANE },
    body: JSON.stringify({ signature: "Jane Doe" }),
  })
);
ok(ack.employeeAckSignature === "Jane Doe" && !!ack.ackAt, "acknowledge via session");

// 10. PTO request flow (jane → boss)
const pto = await j(
  await fetch(`${base}/api/pto`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: JANE },
    body: JSON.stringify({ ptoType: "vacation", startDate: "2026-12-20", endDate: "2026-12-24", reason: "Holidays" }),
  })
);
ok(pto.kind === "timeoff" && pto.status === "pending" && pto.ptoType === "vacation", "PTO submit -> pending timeoff");

const ptoDecided = await j(
  await fetch(`${base}/api/admin/requests/${pto.id}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: BOSS },
    body: JSON.stringify({ decision: "approved", note: "Enjoy" }),
  })
);
ok(ptoDecided.status === "approved" && !ptoDecided.digitalRecord, "PTO approve -> approved, no Jibble/record");

server.close();
console.log("done");
process.exit(0);
