import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { config, isProd } from "./config.js";
import { prisma } from "./db/client.js";
import { requestsRouter } from "./routes/requests.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { timesheetRouter } from "./routes/timesheet.js";
import { employeeRouter } from "./routes/employee.js";

const app = express();

app.use(cors({ origin: config.webOrigin, credentials: true }));
app.use(express.json());
app.use(cookieParser());

/** Liveness + DB connectivity check. */
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "up", env: config.nodeEnv });
  } catch (err) {
    res.status(503).json({ ok: false, db: "down", error: String(err) });
  }
});

app.use("/api/requests", requestsRouter);
app.use("/api/timesheet", timesheetRouter);
app.use("/api/employee", employeeRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminRouter);

// In production, serve the built React app from the same origin and let the SPA
// handle client-side routes (anything that isn't an /api path).
if (isProd) {
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  app.use(express.static(webDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
}

app.listen(config.port, () => {
  console.log(`[api] listening on port ${config.port} (${config.nodeEnv})`);
});
