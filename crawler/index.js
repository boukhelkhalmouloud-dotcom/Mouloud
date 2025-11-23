import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Firestore, FieldValue } from "@google-cloud/firestore";


// --- env from GitHub Secrets ---
const projectId = process.env.FIREBASE_PROJECT_ID; // e.g. "izh-news"
const sa = JSON.parse(process.env.GCP_SA_KEY);     // full JSON from service-account key
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const VK_API_TOKEN = process.env.VK_API_TOKEN || "";

// Firestore client with service account
const db = new Firestore({ projectId, credentials: sa });

// ---- AI helper: normalize an event from raw text ----
async function enrichWithGemini(text, url) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
  const prompt = `
Верни строго валидный JSON без markdown:
{"title":"","summary":"","tags":[],"startTime":null,"endTime":null,"venue":null,"city":"Ижевск","imageUrl":null}
Извлеки из текста события (RU). Даты в ISO 8601 (UTC), 3–6 тегов латиницей.
Текст:
${text}
URL: ${url}
`;
  const r = await model.generateContent(prompt);
  const raw = r.response.text().replace(/```json|```/g, "").trim();
  return JSON.parse(raw);
}

// ---- VK: latest posts for a domain ----
async function fetchVkPosts(domain) {
  if (!VK_API_TOKEN) return [];
  const u = `https://api.vk.com/method/wall.get?v=5.199&domain=${encodeURIComponent(domain)}&count=10&access_token=${VK_API_TOKEN}`;
  const r = await fetch(u);
  const data = await r.json();
  if (data.error) {
    console.error("VK error", domain, data.error);
    return [];
  }
  return (data.response?.items || []).map(p => ({
    id: `vk_${p.owner_id}_${p.id}`,
    text: p.text || "",
    link: `https://vk.com/${domain}?w=wall${p.owner_id}_${p.id}`
  }));
}

// ---- Generic HTML fallback (very simple; tweak selectors per site) ----
async function fetchHtmlPosts(sourceUrl, sourceId) {
  const html = await (await fetch(sourceUrl)).text();
  const $ = cheerio.load(html);
  const out = [];
  $("article, .post, .news-item").each((i, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length > 80) out.push({ id: `${sourceId}_${i}`, text, link: sourceUrl });
  });
  return out;
}

async function run() {
  if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY");
  if (!projectId || !sa) throw new Error("Missing FIREBASE_PROJECT_ID or GCP_SA_KEY");

  // Read sources
  const src = await db.collection("source").get();
  const sources = src.docs.map(d => ({ id: d.id, ...d.data() }));

  for (const s of source) {
    let posts = [];
    try {
      if (s.kind === "vk" && s.domain) posts = await fetchVkPosts(s.domain);
      else if (s.url) posts = await fetchHtmlPosts(s.url, s.id);
    } catch (e) {
      console.error("Fetch error", s.name || s.id, e);
      continue;
    }

    for (const p of posts) {
      const evRef = db.collection("source").doc(p.id);
      const exists = await evRef.get();
      if (exists.exists) continue; // dedupe: only new items

      try {
        const ai = await enrichWithGemini(p.text, p.link);
        await evRef.set({
          sourceId: s.id,
          sourceName: s.name || "",
          sourceUrl: s.url || "",
          originalPostUrl: p.link,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          ...ai
        });
        console.log("Saved", p.id);
      } catch (e) {
        console.error("Gemini/Save error", p.id, e.message || e);
      }
    }

    try {
      await db.collection("source").doc(s.id).update({
        lastPolledAt: FieldValue.serverTimestamp()
      });
    } catch (_) {}
  }
}

run().catch(e => {
  console.error("Fatal:", e.message || e);
  process.exit(1);
});
