import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { config } from "../config.js";

/**
 * Single DynamoDB document client. In AWS, credentials come from the Lambda
 * execution role. Locally (tests), DYNAMO_ENDPOINT points at an in-process
 * dynalite instance with dummy credentials.
 */
const base = new DynamoDBClient({
  region: config.aws.region,
  ...(config.aws.dynamoEndpoint
    ? {
        endpoint: config.aws.dynamoEndpoint,
        credentials: { accessKeyId: "local", secretAccessKey: "local" },
      }
    : {}),
});

export const ddb = DynamoDBDocumentClient.from(base, {
  marshallOptions: { removeUndefinedValues: true },
});

export const TABLE = config.aws.tableName;
