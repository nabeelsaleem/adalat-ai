// ============================================================
// AI ADALAT — Phase 3: Groq API via Cloudflare Worker
// ============================================================

// 👇👇👇 PASTE YOUR CLOUDFLARE WORKER URL HERE 👇👇👇
const WORKER_URL = "https://ai-adalat-proxy.ssbasemaker.workers.dev";
// 👆👆👆 (keep it without trailing slash) 👆👆👆

// ============================================================
// LEGAL GLOSSARY (Roman Urdu / Urdu → English legal terms)
// ============================================================

const LEGAL_GLOSSARY = {
    // Accidents & Injury
    "takkar": "collision accident negligent driving rash",
    "gari": "vehicle car motor",
    "gaari": "vehicle car motor",
    "bike": "motorcycle vehicle accident",
    "zakhmi": "injury hurt wound",
    "zakham": "injury wound hurt",
    "hospital": "medical treatment injury",
    "driver": "driver negligent driving",
    "bhaag": "hit and run absconding",
    "bhag": "hit and run absconding",
    "surat-e-haal": "accident circumstance",
    "surat": "circumstance",

    // Property
    "zameen": "land property immovable",
    "makan": "house property immovable",
    "kiraya": "rent lease tenancy",
    "qabza": "illegal possession dispossession",
    "jaidad": "property asset estate",
    "waris": "inheritance heir succession",
    "wirsa": "inheritance succession heir",
    "wirasat": "inheritance succession",

    // Family
    "nikah": "marriage nikah",
    "shadi": "marriage nikah wedlock",
    "talaq": "divorce dissolution",
    "khula": "khula divorce wife-initiated",
    "haq mehr": "dower mahr",
    "haqmehr": "dower mahr",
    "mehr": "dower mahr",
    "nafaqa": "maintenance alimony",
    "bachay": "children minor custody",
    "bacha": "child minor custody",
    "custody": "custody guardianship",

    // Contracts & Money
    "paisa": "money payment amount",
    "udhaar": "loan debt borrowing",
    "qarz": "loan debt",
    "contract": "agreement contract",
    "muahida": "agreement contract",
    "dhoka": "fraud cheating deception",
    "farayb": "fraud cheating",
    "cheque": "cheque negotiable instrument",
    "sod": "interest usury riba",

    // Criminal
    "chori": "theft stolen",
    "loot": "robbery dacoity",
    "daka": "dacoity robbery",
    "qatl": "murder qatl",
    "khoon": "murder blood",
    "maar": "assault beating hurt",
    "marpeet": "assault beating",
    "gali": "abuse defamation",
    "tahqeer": "defamation insult",
    "jhoot": "false accusation perjury",
    "jhooth": "false accusation",
    "zina": "zina adultery",
    "rape": "rape zina-bil-jabr",
    "zabardasti": "rape coercion",

    // Police & Courts
    "police": "police FIR investigation",
    "fir": "FIR first information report",
    "thanay": "police station FIR",
    "thana": "police station FIR",
    "adalat": "court",
    "judge": "judge court",
    "wakil": "advocate lawyer counsel",
    "muqadma": "case suit litigation",

    // Employment
    "naukri": "employment job service",
    "tankhwah": "salary wages",
    "tanakhwah": "salary wages",
    "malik": "employer master",
    "nokar": "employee servant",
};

function expandQuery(facts) {
    const lower = facts.toLowerCase();
    let expanded = facts;
    const added = [];
    for (const [term, expansion] of Object.entries(LEGAL_GLOSSARY)) {
        if (lower.includes(term)) {
            expanded += " " + expansion;
            added.push(`${term} → ${expansion}`);
        }
    }
    console.log("Glossary expansions:", added);
    return expanded;
}

// ============================================================
// LAW BOOK REGISTRY
// ============================================================

const JSONL_BOOKS = [
    { name: "Pakistan Penal Code 1860", file: "books/statutes/PPC.jsonl" },
    { name: "Criminal Procedure Code 1898", file: "books/statutes/CrPC.jsonl" },
    { name: "Civil Procedure Code 1908", file: "books/statutes/CPC.jsonl" },
    { name: "Qanun-e-Shahadat 1984", file: "books/statutes/QanoonEShahadat.jsonl" },
];

// ============================================================
// SEARCH
// ============================================================

function tokenize(text) {
    return text.toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter(w => w.length > 3);
}

function searchInJSONL(items, expandedQuery, maxResults = 8) {
    const words = tokenize(expandedQuery);
    if (words.length === 0) return [];
    const results = [];

    for (const item of items) {
        const text = (item.text || "").toLowerCase();
        let score = 0;
        for (const word of words) {
            if (text.includes(word)) score += 1;
        }
        if (item.id && expandedQuery.toLowerCase().includes(item.id.toLowerCase())) {
            score += 10;
        }
        if (score > 0) {
            results.push({ id: item.id, text: item.text, score });
        }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

async function loadJSONL(url) {
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const text = await res.text();
        return text.trim().split("\n").filter(l => l.trim()).map(l => {
            try { return JSON.parse(l); } catch { return null; }
        }).filter(Boolean);
    } catch (e) {
        console.warn("JSONL load failed:", url, e);
        return [];
    }
}

// ============================================================
// MAIN ANALYZE FUNCTION
// ============================================================

async function analyzeCase() {
    const facts = document.getElementById("case-facts").value.trim();
    const status = document.getElementById("status");
    const resultsSection = document.getElementById("results-section");
    const aiOutput = document.getElementById("ai-output");
    const resultsContent = document.getElementById("results-content");
    const btn = document.getElementById("analyze-btn");

    if (!facts) { alert("Please describe your case facts."); return; }
    if (facts.length < 15) { alert("Please describe your case in more detail (at least 15 characters)."); return; }

    btn.disabled = true;
    resultsSection.style.display = "none";
    aiOutput.innerHTML = "";

    try {
        // ---- STEP 1: Expand query ----
        status.innerHTML = '<span class="spinner"></span>Understanding your case...';
        const expandedQuery = expandQuery(facts);

        // ---- STEP 2: Retrieve provisions ----
        status.innerHTML = '<span class="spinner"></span>Searching law books...';
        const retrieved = [];

        for (const book of JSONL_BOOKS) {
            const items = await loadJSONL(book.file);
            const matches = searchInJSONL(items, expandedQuery);
            for (const m of matches) {
                retrieved.push({
                    source: book.name,
                    id: m.id,
                    text: m.text,
                    score: m.score
                });
            }
        }

        retrieved.sort((a, b) => b.score - a.score);

        const seen = new Set();
        const topProvisions = retrieved.filter(p => {
            const key = (p.id || "") + "|" + (p.text || "").substring(0, 80);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 8);

        // ---- STEP 3: Show retrieved sources ----
        if (topProvisions.length === 0) {
            aiOutput.innerHTML = `<p>No relevant provisions found. Try describing your case with more detail.</p>`;
            resultsSection.style.display = "block";
            return;
        }

        let sourcesHtml = `<p><strong>Retrieved ${topProvisions.length} provisions from the law books:</strong></p>`;
        for (const p of topProvisions) {
            sourcesHtml += `
                <div class="citation">
                    <strong>📖 ${escapeHtml(p.source)}</strong>
                    ${p.id ? `<span style="color:#f0c040;"> — ${escapeHtml(p.id)}</span>` : ""}
                    <p style="margin-top:8px;">${escapeHtml((p.text || "").substring(0, 600))}${(p.text || "").length > 600 ? "..." : ""}</p>
                </div>`;
        }
        resultsContent.innerHTML = sourcesHtml;

        // ---- STEP 4: Build prompt ----
        const provisionsText = topProvisions.map((p, i) =>
            `[${i + 1}] ${p.source}${p.id ? " — " + p.id : ""}\n${(p.text || "").substring(0, 800)}`
        ).join("\n\n");

        const systemPrompt = `You are AI Adalat, a legal reasoning assistant specializing in Pakistani law and Islamic Shariah. You provide educational legal analysis, not binding verdicts.

CRITICAL RULES:
1. ONLY cite legal provisions from the RETRIEVED PROVISIONS section below. Never invent section numbers.
2. If the retrieved provisions don't cover the case, say so honestly.
3. Write in clear, simple language a non-lawyer can understand.
4. Use markdown formatting with ## headings.
5. Never claim to issue a binding judgment.
6. End with practical next steps for the person.
7. The user may write in English, Urdu, or Roman Urdu. Respond in the SAME language they used.`;

        const userPrompt = `CASE FACTS (may be in English, Urdu, or Roman Urdu):
${facts}

RETRIEVED PROVISIONS FROM OFFICIAL LAW BOOKS:
${provisionsText}

Analyze this case using ONLY the retrieved provisions above. Structure your response with these exact markdown headings:

## Legal Issues Identified
List the legal questions this case raises (2-4 bullet points).

## Applicable Law
Identify which retrieved provisions apply and why. Quote the section numbers.

## Analysis
Explain in simple language how the law applies to these facts. If facts are insufficient, state what additional information is needed.

## Suggested Next Steps
Give 3-5 practical steps the person should take (e.g., file FIR, consult advocate, gather evidence, approach family court).

## Limitations
Briefly state what this analysis cannot determine.

Be honest and cautious. If uncertain, say so.`;

        // ---- STEP 5: Stream from Worker ----
        status.innerHTML = '<span class="spinner"></span>AI is reasoning through your case...';
        resultsSection.style.display = "block";
        aiOutput.innerHTML = '<div class="ai-response cursor-blink"></div>';
        const responseDiv = aiOutput.querySelector(".ai-response");

        const response = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.3,
                max_tokens: 1500
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("Worker error:", errText);
            responseDiv.innerHTML = `<p>⚠️ AI service error. Please try again in a moment.</p>`;
            responseDiv.classList.remove("cursor-blink");
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullText = "";

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop(); // keep last incomplete line

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith("data:")) continue;
                const data = trimmed.slice(5).trim();
                if (data === "[DONE]") continue;

                try {
                    const parsed = JSON.parse(data);
                    const delta = parsed.choices?.[0]?.delta?.content;
                    if (delta) {
                        fullText += delta;
                        responseDiv.innerHTML = renderMarkdown(fullText);
                    }
                } catch {
                    // partial JSON, ignore
                }
            }
        }

        responseDiv.classList.remove("cursor-blink");
        responseDiv.innerHTML = renderMarkdown(fullText);

    } catch (err) {
        console.error("Analysis failed:", err);
        aiOutput.innerHTML = `<p>⚠️ Something went wrong. Please try again.</p>`;
    } finally {
        status.textContent = "";
        btn.disabled = false;
    }
}

// ============================================================
// MINIMAL MARKDOWN RENDERER
// ============================================================

function renderMarkdown(md) {
    let html = escapeHtml(md);

    html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
    html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Lists
    html = html.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
    html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, "<ul>$1</ul>");

    // Paragraphs
    html = html.split(/\n{2,}/).map(block => {
        const t = block.trim();
        if (/^<(h[1-6]|ul|ol|li|div)/.test(t)) return block;
        if (!t) return "";
        return `<p>${block.replace(/\n/g, "<br>")}</p>`;
    }).join("\n");

    return html;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// EXPOSE TO WINDOW
// ============================================================

window.analyzeCase = analyzeCase;

// ============================================================
// INIT
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
    console.log("AI Adalat Phase 3 initialized (Groq API).");
    console.log("Worker URL:", WORKER_URL);

    if (WORKER_URL.includes("YOUR-SUBDOMAIN")) {
        const status = document.getElementById("model-status");
        if (status) {
            status.innerHTML = "⚠️ Worker URL not configured. Edit js/app.js and paste your Cloudflare Worker URL.";
        }
    }
});
