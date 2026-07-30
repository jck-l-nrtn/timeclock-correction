/**
 * End-to-end HTTP test: the real Express app against in-process dynalite,
 * Jibble stubbed (no creds). TEMPORARY.
 */
import { createHmac } from "node:crypto";
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

// Seed an admin so requireAdmin passes, and forge its session cookie.
const data = await import("../src/db/data.js");
await data.upsertAdmin({ email: "boss@co.com", name: "The Boss", jibbleUserId: null });
function adminCookie(email: string): string {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + 3_600_000 })).toString("base64url");
  const sig = createHmac("sha256", "testsecret").update(payload).digest("base64url");
  return `admin_session=${payload}.${sig}`;
}
const AC = adminCookie("boss@co.com");

// Start the app.
await import("../src/index.js");
await new Promise((r) => setTimeout(r, 500));
const base = `http://localhost:${PORT}`;
const j = (r: Response) => r.json() as Promise<any>;
const ok = (c: boolean, m: string) => console.log(`${c ? "✅" : "❌"} ${m}`);

// 1. health
ok((await (await fetch(`${base}/api/health`)).json()).ok === true, "health");

// 2. submit (anonymous)
const created = await j(
  await fetch(`${base}/api/requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employeeName: "Jane Doe", employeeEmail: "jane@co.com", date: "2026-06-20",
      eventType: "out", intendedTime: "17:00", reason: "forgot", affirmed: true,
    }),
  })
);
ok(!!created.id && created.status === "pending", "POST /api/requests -> pending");

// 3. get by id
ok((await (await fetch(`${base}/api/requests/${created.id}`)).json()).id === created.id, "GET /api/requests/:id");

// 4. magic link -> token -> my requests
const ml = await j(await fetch(`${base}/api/auth/magic-link`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "jane@co.com" }) }));
const token = new URL(ml.devLink).searchParams.get("token")!;
const mine = await j(await fetch(`${base}/api/requests?token=${token}`));
ok(Array.isArray(mine) && mine.length === 1, "magic-link + list my requests");

// 5. admin queue
const queue = await j(await fetch(`${base}/api/admin/requests?status=pending`, { headers: { Cookie: AC } }));
ok(queue.length === 1, "admin queue lists pending");

// 6. approve (stub Jibble -> manual -> status approved)
const decided = await j(
  await fetch(`${base}/api/admin/requests/${created.id}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: AC },
    body: JSON.stringify({ decision: "approved", note: "ok" }),
  })
);
ok(decided.status === "approved" && decided.decidedBy === "The Boss" && !!decided.digitalRecord, "approve -> decidedBy + record");

// 7. log + queue empties
ok((await j(await fetch(`${base}/api/admin/log`, { headers: { Cookie: AC } }))).length === 1, "decision log");
ok((await j(await fetch(`${base}/api/admin/requests?status=pending`, { headers: { Cookie: AC } }))).length === 0, "queue empty after decision");

// 8. acknowledge (via magic-link token)
const ack = await j(
  await fetch(`${base}/api/requests/${created.id}/acknowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, signature: "Jane Doe" }),
  })
);
ok(ack.employeeAckSignature === "Jane Doe" && !!ack.ackAt, "acknowledge");

server.close();
console.log("done");
process.exit(0);
