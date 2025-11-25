// Crawler: read VK sources from Firestore, normalize with Gemini,
// write structured events into the "events" collection.

import fetch from "node-fetch";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Firestore, FieldValue } from "@google-cloud/firestore";

// ------------ ENVIRONMENT (from GitHub Secrets) ------------
const projectId = process.env.FIREBASE_PROJECT_ID;
const saKeyRaw = process.env.GCP_SA_KEY || "";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const VK_API_TOKEN = process.env.VK_API_TOKEN || "";

// Firestore client
let saKey;
try {
  saKey = saKeyRaw ? JSON.parse(saKeyRaw) : null;
} catch (e) {
  console.error("Could not parse GCP_SA_KEY:", e.message);
  saKey = null;
}

const db = new Firestore({
  projectId,
  credentials: saKey || undefined,
});

// ------------ Helpers ------------

// Ask Gemini to turn free text into structured event JSON
async function normalizeWithGemini(text, url) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing");
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const prompt = `
Верни строго валидный JSON без markdown:

{
  "title": "",
  "summary": "",
  "tags": [],
  "startTime": null,
  "endTime": null,
  "venue": null,
  "city": "Ижевск",
  "imageUrl": null
}

Извлеки поля события из текста (на русском). Даты в ISO 8601 (UTC),
3–6 тегов латиницей, короткий summary.

Текст:
${text}

URL:
${url}
`;

  const result = await model.generateContent(prompt);
  const raw = result.response.text().replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Gemini returned non-JSON:", raw);
    throw new Error("Failed to parse Gemini JSON");
  }
}

// Fetch last posts from VK wall by domain
async function fetchVkPosts(domain) {
  if (!VK_API_TOKEN) {
    console.warn("VK_API_TOKEN missing, skip VK fetch for", domain);
    return [];
  }

  const url =
    `https://api.vk.com/method/wall.get` +
    `?v=5.199&domain=${encodeURIComponent(domain)}` +
    `&count=10&access_token=${VK_API_TOKEN}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.error) {
    console.error("VK error for", domain, data.error);
    return [];
  }

  const items = data.response?.items || [];
  return items.map((p) => ({
    id: `vk_${p.owner_id}_${p.id}`,
    text: p.text || "",
    link: `https://vk.com/${domain}?w=wall${p.owner_id}_${p.id}`,
  }));
}

// (Optional) Fallback for non-VK HTML sources – very simple extraction
async function fetchHtmlPosts(sourceUrl, sourceId) {
  const res = await fetch(sourceUrl);
  const html = await res.text();
  // Minimal text scraping without cheerio to keep things simple
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (!text || text.length < 80) return [];
  return [{ id: `${sourceId}_0`, text, link: sourceUrl }];
}

// ------------ Main crawler logic ------------

async function run() {
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID is missing");
  if (!saKey || !saKey.client_email) {
    throw new Error("GCP_SA_KEY is missing or invalid");
  }

  console.log("Crawler started…");
  console.log("Project:", projectId);

  // 1) read sources
  const snap = await db.collection("source").get();
  const sources = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log(`Found ${sources.length} sources`);

  for (const src of sources) {
    console.log("Processing source:", src.name || src.id, src.domain || src.url);

    let posts = [];

    try {
      if (src.kind === "vk" && src.domain) {
        posts = await fetchVkPosts(src.domain);
      } else if (src.url) {
        posts = await fetchHtmlPosts(src.url, src.id);
      } else {
        console.warn("Source has no domain/url:", src.id);
      }
    } catch (e) {
      console.error("Fetch error for source", src.id, e.message || e);
      continue;
    }

    console.log(`  Fetched ${posts.length} posts`);

    for (const p of posts) {
      const evRef = db.collection("events").doc(p.id);
      const existing = await evRef.get();
      if (existing.exists) {
        // already have this event
        continue;
      }

      try {
        const ai = await normalizeWithGemini(p.text, p.link);

        await evRef.set({
          sourceId: src.id,
          sourceName: src.name || "",
          sourceUrl: src.url || "",
          originalPostUrl: p.link,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ...ai,
        });

        console.log("    Saved event", p.id);
      } catch (e) {
        console.error("    Gemini/save error for", p.id, e.message || e);
      }
    }

    // update lastPolledAt (optional)
    try {
      await db.collection("source").doc(src.id).update({
        lastPolledAt: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.warn("  Could not update lastPolledAt for", src.id, e.message);
    }
  }

  console.log("Crawler finished.");
}

run().catch((e) => {
  console.error("Fatal:", e.message || e);
  process.exit(1);
});
