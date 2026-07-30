import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config, isProd } from "./config.js";
import { requestsRouter } from "./routes/requests.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { timesheetRouter } from "./routes/timesheet.js";
import { employeeRouter } from "./routes/employee.js";
import { reportsRouter } from "./routes/reports.js";

/** The configured Express app — shared by the local server and the Lambda handler. */
export const app = express();

app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

/** Liveness check. */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, env: config.nodeEnv });
});

app.use("/api/requests", requestsRouter);
app.use("/api/timesheet", timesheetRouter);
app.use("/api/employee", employeeRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);

// Serve the built React app from the same origin — but NOT on Lambda, where
// CloudFront serves the static site from S3 and only routes /api/* to the function.
const onLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
if (isProd && !onLambda) {
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}
