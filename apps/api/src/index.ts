import { app } from "./app.js";
import { config } from "./config.js";

// Local / container entry point — long-running HTTP server.
app.listen(config.port, () => {
  console.log(`[api] listening on port ${config.port} (${config.nodeEnv})`);
});
