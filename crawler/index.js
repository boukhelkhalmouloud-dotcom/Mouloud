// Minimal test crawler: just read from "source" and print how many docs

import { Firestore } from "@google-cloud/firestore";

const projectId = process.env.FIREBASE_PROJECT_ID;
const saKey = JSON.parse(process.env.GCP_SA_KEY || "{}");

const db = new Firestore({
  projectId,
  credentials: saKey,
});

async function run() {
  console.log("Test crawler started…");
  console.log("Project ID:", projectId);
  if (!saKey || !saKey.client_email) {
    throw new Error("GCP_SA_KEY is missing or invalid");
  }

  const snap = await db.collection("source").get();
  console.log("Docs in source collection:", snap.size);
}

run().catch((e) => {
  console.error("Fatal test error:", e);
  process.exit(1);
});
