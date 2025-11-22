// functions/index.js — minimal secure webhook that deploys cleanly

const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
try { require("dotenv").config(); } catch (_) {}

setGlobalOptions({ maxInstances: 10, timeoutSeconds: 300 });

admin.initializeApp();
const db = admin.firestore();

// Export an HTTP endpoint so Firebase has something to deploy.
exports.pollNow = onRequest(async (req, res) => {
  // simple key check (protects your endpoint)
  const key = req.query.key || req.headers["x-sched-key"];
  if (!key || key !== process.env.SCHED_KEY) {
    res.status(401).send("Unauthorized");
    return;
  }

  // TEMP: do nothing else yet, just prove it deploys & runs
  // (we’ll paste the VK + Gemini logic after it deploys)
  console.log("pollNow triggered OK");
  res.send("Poll complete ✅");
});
