import { randomUUID } from "node:crypto";
import {
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddb, TABLE } from "./dynamo.js";

/**
 * Single-table DynamoDB access layer. Item shapes below are the *logical*
 * records; PK/SK and GSI attributes are added on write and stripped on read.
 *
 * Keys / indexes:
 *   Employee  PK=EMPLOYEE#<email>  SK=PROFILE
 *   Admin     PK=ADMIN#<email>     SK=PROFILE
 *   Token     PK=TOKEN#<token>     SK=PROFILE   (TTL on expiresEpoch)
 *   Request   PK=REQ#<id>          SK=PROFILE
 *     GSI1  EMPREQ#<email> / createdAt   -> an employee's requests
 *     GSI2  STATUS#<status> / createdAt  -> admin queue by status
 *     GSI3  DECIDED / decidedAt          -> decision log (sparse: decided only)
 *     GSI4  CHANGE / <date>#<id>         -> report (sparse: approved/applied only)
 */

const norm = (email: string) => email.trim().toLowerCase();
const now = () => new Date().toISOString();

const KEY_ATTRS = [
  "PK", "SK", "entity",
  "GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK", "GSI3PK", "GSI3SK", "GSI4PK", "GSI4SK",
] as const;

function stripKeys<T>(item: Record<string, unknown>): T {
  const copy = { ...item };
  for (const k of KEY_ATTRS) delete copy[k];
  return copy as T;
}

// ---- Employees ------------------------------------------------------------

export interface EmployeeItem {
  id: string;
  email: string;
  fullName: string;
  passwordHash: string;
  jibblePersonId: string | null;
  createdAt: string;
}

export async function getEmployeeByEmail(email: string): Promise<EmployeeItem | null> {
  const r = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `EMPLOYEE#${norm(email)}`, SK: "PROFILE" } })
  );
  return r.Item ? stripKeys<EmployeeItem>(r.Item) : null;
}

export async function createEmployee(input: {
  email: string;
  fullName: string;
  passwordHash: string;
  jibblePersonId: string | null;
}): Promise<EmployeeItem> {
  const item: EmployeeItem = {
    id: randomUUID(),
    email: norm(input.email),
    fullName: input.fullName,
    passwordHash: input.passwordHash,
    jibblePersonId: input.jibblePersonId,
    createdAt: now(),
  };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `EMPLOYEE#${item.email}`, SK: "PROFILE", entity: "employee", ...item },
      ConditionExpression: "attribute_not_exists(PK)",
    })
  );
  return item;
}

/** Admin "existing accounts" list. Low-volume table → Scan with a filter is fine. */
export async function listEmployees(): Promise<EmployeeItem[]> {
  const r = await ddb.send(
    new ScanCommand({
      TableName: TABLE,
      FilterExpression: "entity = :e",
      ExpressionAttributeValues: { ":e": "employee" },
    })
  );
  return (r.Items ?? [])
    .map((i) => stripKeys<EmployeeItem>(i))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

// ---- Admins ---------------------------------------------------------------

export interface AdminItem {
  id: string;
  email: string;
  name: string;
  jibbleUserId: string | null;
  createdAt: string;
}

export async function getAdminByEmail(email: string): Promise<AdminItem | null> {
  const r = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `ADMIN#${norm(email)}`, SK: "PROFILE" } })
  );
  return r.Item ? stripKeys<AdminItem>(r.Item) : null;
}

export async function upsertAdmin(input: {
  email: string;
  name: string;
  jibbleUserId: string | null;
}): Promise<AdminItem> {
  const existing = await getAdminByEmail(input.email);
  const item: AdminItem = existing
    ? { ...existing, name: input.name, jibbleUserId: input.jibbleUserId ?? existing.jibbleUserId }
    : {
        id: randomUUID(),
        email: norm(input.email),
        name: input.name,
        jibbleUserId: input.jibbleUserId,
        createdAt: now(),
      };
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: { PK: `ADMIN#${item.email}`, SK: "PROFILE", entity: "admin", ...item },
    })
  );
  return item;
}

// ---- Correction requests --------------------------------------------------

export interface RequestItem {
  id: string;
  employeeName: string;
  employeeEmail: string;
  jibblePersonId: string | null;
  jibbleEntryId: string | null;
  date: string;
  eventType: string;
  intendedTime: string;
  reason: string;
  affirmed: boolean;
  status: string;
  decisionNote: string | null;
  decidedByAdminId: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  jibbleResult: string | null;
  digitalRecord: string | null;
  employeeAckSignature: string | null;
  ackAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function requestKeys(i: RequestItem): Record<string, unknown> {
  const keys: Record<string, unknown> = {
    PK: `REQ#${i.id}`,
    SK: "PROFILE",
    entity: "request",
    GSI1PK: `EMPREQ#${i.employeeEmail}`,
    GSI1SK: i.createdAt,
    GSI2PK: `STATUS#${i.status}`,
    GSI2SK: i.createdAt,
  };
  if (i.status !== "pending" && i.decidedAt) {
    keys.GSI3PK = "DECIDED";
    keys.GSI3SK = i.decidedAt;
  }
  if (i.status === "approved" || i.status === "applied") {
    keys.GSI4PK = "CHANGE";
    keys.GSI4SK = `${i.date}#${i.id}`;
  }
  return keys;
}

/** Full-item write — recomputes all index keys from the logical fields. */
export async function putRequest(item: RequestItem): Promise<RequestItem> {
  item.updatedAt = now();
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...item, ...requestKeys(item) } }));
  return item;
}

export async function createRequest(input: {
  employeeName: string;
  employeeEmail: string;
  jibblePersonId: string | null;
  jibbleEntryId: string | null;
  date: string;
  eventType: string;
  intendedTime: string;
  reason: string;
  affirmed: boolean;
}): Promise<RequestItem> {
  const ts = now();
  const item: RequestItem = {
    id: randomUUID(),
    employeeName: input.employeeName,
    employeeEmail: norm(input.employeeEmail),
    jibblePersonId: input.jibblePersonId,
    jibbleEntryId: input.jibbleEntryId,
    date: input.date,
    eventType: input.eventType,
    intendedTime: input.intendedTime,
    reason: input.reason,
    affirmed: input.affirmed,
    status: "pending",
    decisionNote: null,
    decidedByAdminId: null,
    decidedByName: null,
    decidedAt: null,
    jibbleResult: null,
    digitalRecord: null,
    employeeAckSignature: null,
    ackAt: null,
    createdAt: ts,
    updatedAt: ts,
  };
  await ddb.send(new PutCommand({ TableName: TABLE, Item: { ...item, ...requestKeys(item) } }));
  return item;
}

export async function getRequestById(id: string): Promise<RequestItem | null> {
  const r = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `REQ#${id}`, SK: "PROFILE" } })
  );
  return r.Item ? stripKeys<RequestItem>(r.Item) : null;
}

export async function listRequestsByEmployee(email: string): Promise<RequestItem[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI1",
      KeyConditionExpression: "GSI1PK = :pk",
      ExpressionAttributeValues: { ":pk": `EMPREQ#${norm(email)}` },
      ScanIndexForward: false, // newest first
    })
  );
  return (r.Items ?? []).map((i) => stripKeys<RequestItem>(i));
}

export async function listRequestsByStatus(status: string): Promise<RequestItem[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI2",
      KeyConditionExpression: "GSI2PK = :pk",
      ExpressionAttributeValues: { ":pk": `STATUS#${status}` },
      ScanIndexForward: true, // oldest first (FIFO queue)
    })
  );
  return (r.Items ?? []).map((i) => stripKeys<RequestItem>(i));
}

export async function listDecided(): Promise<RequestItem[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI3",
      KeyConditionExpression: "GSI3PK = :pk",
      ExpressionAttributeValues: { ":pk": "DECIDED" },
      ScanIndexForward: false, // newest decision first
    })
  );
  return (r.Items ?? []).map((i) => stripKeys<RequestItem>(i));
}

/** Approved/applied changes whose date is within [from, to]. */
export async function listChangesInRange(from: string, to: string): Promise<RequestItem[]> {
  const r = await ddb.send(
    new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI4",
      KeyConditionExpression: "GSI4PK = :pk AND GSI4SK BETWEEN :from AND :to",
      ExpressionAttributeValues: { ":pk": "CHANGE", ":from": `${from}#`, ":to": `${to}#￿` },
      ScanIndexForward: true,
    })
  );
  return (r.Items ?? []).map((i) => stripKeys<RequestItem>(i));
}

// ---- Magic-link tokens ----------------------------------------------------

export async function createMagicLink(email: string, token: string, ttlMs: number): Promise<void> {
  const expires = new Date(Date.now() + ttlMs);
  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        PK: `TOKEN#${token}`,
        SK: "PROFILE",
        entity: "token",
        email: norm(email),
        token,
        expiresAt: expires.toISOString(),
        expiresEpoch: Math.floor(expires.getTime() / 1000), // DynamoDB TTL
      },
    })
  );
}

export async function resolveEmailFromToken(token: string): Promise<string | null> {
  if (!token) return null;
  const r = await ddb.send(
    new GetCommand({ TableName: TABLE, Key: { PK: `TOKEN#${token}`, SK: "PROFILE" } })
  );
  if (!r.Item) return null;
  if (new Date(r.Item.expiresAt as string).getTime() < Date.now()) return null;
  return r.Item.email as string;
}
