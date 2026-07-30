/**
 * Local verification of the DynamoDB data layer against in-process dynalite.
 * Run: tsx scripts/dynamo-test.ts   (TEMPORARY — not part of the app)
 */
import dynalite from "dynalite";
import {
  CreateTableCommand,
  DynamoDBClient,
  type GlobalSecondaryIndex,
} from "@aws-sdk/client-dynamodb";

const PORT = 4567;
process.env.DYNAMO_ENDPOINT = `http://localhost:${PORT}`;
process.env.TABLE_NAME = "TimeclockTest";
process.env.AWS_REGION = "us-east-1";

const server = dynalite({ createTableMs: 0 });
await new Promise<void>((r) => server.listen(PORT, () => r()));

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
    TableName: "TimeclockTest",
    AttributeDefinitions: [
      { AttributeName: "PK", AttributeType: "S" },
      { AttributeName: "SK", AttributeType: "S" },
      { AttributeName: "GSI1PK", AttributeType: "S" },
      { AttributeName: "GSI1SK", AttributeType: "S" },
      { AttributeName: "GSI2PK", AttributeType: "S" },
      { AttributeName: "GSI2SK", AttributeType: "S" },
      { AttributeName: "GSI3PK", AttributeType: "S" },
      { AttributeName: "GSI3SK", AttributeType: "S" },
      { AttributeName: "GSI4PK", AttributeType: "S" },
      { AttributeName: "GSI4SK", AttributeType: "S" },
    ],
    KeySchema: [
      { AttributeName: "PK", KeyType: "HASH" },
      { AttributeName: "SK", KeyType: "RANGE" },
    ],
    GlobalSecondaryIndexes: [gsi(1), gsi(2), gsi(3), gsi(4)],
    ProvisionedThroughput: { ReadCapacityUnits: 1, WriteCapacityUnits: 1 },
  })
);

const d = await import("../src/db/data.js");
const assert = (cond: boolean, msg: string) => console.log(`${cond ? "✅" : "❌"} ${msg}`);

// Employees
const emp = await d.createEmployee({
  email: "Jane@Co.com",
  fullName: "Jane Doe",
  passwordHash: "hash",
  jibblePersonId: "p1",
});
const gotEmp = await d.getEmployeeByEmail("jane@co.com");
assert(gotEmp?.fullName === "Jane Doe" && gotEmp?.email === "jane@co.com", "employee create + get (email normalized)");

// Admin upsert
await d.upsertAdmin({ email: "boss@co.com", name: "The Boss", jibbleUserId: "j1" });
const adm = await d.getAdminByEmail("boss@co.com");
assert(adm?.name === "The Boss", "admin upsert + get");

// Requests
const r1 = await d.createRequest({
  employeeName: "Jane Doe", employeeEmail: "jane@co.com", jibblePersonId: "p1",
  jibbleEntryId: null, date: "2026-06-20", eventType: "out", intendedTime: "17:00",
  reason: "forgot", affirmed: true,
});
await d.createRequest({
  employeeName: "Bob", employeeEmail: "bob@co.com", jibblePersonId: null,
  jibbleEntryId: null, date: "2026-06-21", eventType: "in", intendedTime: "08:00",
  reason: "late", affirmed: true,
});

const pending = await d.listRequestsByStatus("pending");
assert(pending.length === 2, `queue lists pending (got ${pending.length})`);

const mine = await d.listRequestsByEmployee("jane@co.com");
assert(mine.length === 1 && mine[0].id === r1.id, "list by employee");

// Decide r1 -> applied (approved change)
const item = (await d.getRequestById(r1.id))!;
item.status = "applied";
item.decisionNote = "ok";
item.decidedByAdminId = adm!.id;
item.decidedByName = "The Boss";
item.decidedAt = new Date().toISOString();
item.jibbleResult = "Jibble entry x";
await d.putRequest(item);

const pending2 = await d.listRequestsByStatus("pending");
assert(pending2.length === 1, `pending drops to 1 after decision (got ${pending2.length})`);

const decided = await d.listDecided();
assert(decided.length === 1 && decided[0].decidedByName === "The Boss", "decision log (denormalized approver)");

const changes = await d.listChangesInRange("2026-06-01", "2026-06-30");
assert(changes.length === 1 && changes[0].id === r1.id, "changes-in-range (report)");
const noChanges = await d.listChangesInRange("2026-07-01", "2026-07-31");
assert(noChanges.length === 0, "changes-in-range excludes out-of-range");

// Magic link
await d.createMagicLink("jane@co.com", "tok123", 60_000);
const resolved = await d.resolveEmailFromToken("tok123");
assert(resolved === "jane@co.com", "magic link resolve");
await d.createMagicLink("jane@co.com", "expired", -1000);
const expired = await d.resolveEmailFromToken("expired");
assert(expired === null, "magic link expiry");

// Employee list (scan)
const emps = await d.listEmployees();
assert(emps.length === 1 && emps[0].email === "jane@co.com", "list employees");

server.close();
console.log("done");
