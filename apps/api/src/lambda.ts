import { createRequire } from "node:module";
import { app } from "./app.js";

// AWS Lambda entry point — wraps the Express app. CloudFront routes /api/* here;
// static assets are served from S3. serverless-express is CJS and callable at
// runtime, so we load it via createRequire (its ESM types aren't callable).
const require = createRequire(import.meta.url);
const serverlessExpress = require("@codegenie/serverless-express") as (opts: { app: unknown }) => unknown;

export const handler = serverlessExpress({ app });
