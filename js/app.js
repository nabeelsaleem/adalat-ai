// ============================================================
// AI ADALAT — Main Application Logic
// ============================================================

const LAW_BOOKS = {
    statutes: [
        { name: "Constitution of Pakistan 1973", file: "books/statutes/Constitution_of_Pakistan_1973.pdf" },
        { name: "Pakistan Penal Code 1860", file: "books/statutes/Pakistan_Penal_Code_1860.pdf" },
        { name: "Qanun-e-Shahadat 1984", file: "books/statutes/Qanun_e_Shahadat_1984.pdf" },
        { name: "CrPC 1898", file: "books/statutes/CrPC_1898.pdf" },
        { name: "CPC 1908", file: "books/statutes/CPC_1908.pdf" },
        { name: "Muslim Family Laws Ordinance 1961", file: "books/statutes/Muslim_Family_Laws_Ordinance_1961.pdf" },
        { name: "Contract Act 1872", file: "books/statutes/Contract_Act_1872.pdf" },
        { name: "Transfer of Property Act 1882", file: "books/statutes/Transfer_of_Property_Act_1882.pdf" },
        { name: "Arbitration Act 1940", file: "books/statutes/Arbitration_Act_1940.pdf" }
    ],
    shariah: [
        { name: "Quran (Urdu Translation)", file: "books/shariah/Quran_Urdu_Translation.pdf" },
        { name: "Tafseer Ibn Kathir (Urdu)", file: "books/shariah/Tafseer_Ibn_Kathir_Urdu_Jild1.pdf" },
        { name: "Sahih Bukhari (Urdu)", file: "books/shariah/Sahih_Bukhari_Urdu_Vol1.pdf" }
    ]
};

// Structured JSONL data (much more accurate than PDF parsing)
const JSONL_BOOKS = [
    { name: "PPC (Structured)", file: "books/statutes/PPC.jsonl" },
    { name: "CrPC (Structured)", file: "books/statutes/CrPC.jsonl" },
    { name: "CPC (Structured)", file: "books/statutes/CPC.jsonl" },
    { name: "Qanun-e-Shahadat (Structured)", file: "books/statutes/QanoonEShahadat.jsonl" }
];

// ============================================================
// PDF TEXT EXTRACTION (using PDF.js)
// ============================================================

async function extractTextFromPDF(url) {
    try {
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        let fullText = "";
        const maxPages = Math.min(pdf.numPages, 50); // Limit for performance

        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(" ");
            fullText += pageText + "\n";
        }
        return fullText;
    } catch (error) {
        console.error(`Failed to extract from ${url}:`, error);
        return "";
    }
}

// ============================================================
// JSONL PARSING (for structured legal data)
// ============================================================

async function loadJSONL(url) {
    try {
        const response = await fetch(url);
        const text = await response.text();
        const lines = text.trim().split("\n").filter(line => line.trim());
        return lines.map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        }).filter(Boolean);
    } catch (error) {
        console.error(`Failed to load JSONL: ${url}`, error);
        return [];
    }
}

// ============================================================
// SIMPLE TEXT SEARCH (keyword matching)
// ============================================================

function searchInText(text, query, maxResults = 5) {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (words.length === 0) return [];

    const sentences = text.split(/[.!?]\s+/);
    const results = [];

    for (const sentence of sentences) {
        let score = 0;
        const lower = sentence.toLowerCase();
        for (const word of words) {
            if (lower.includes(word)) score++;
        }
        if (score > 0) {
            results.push({ sentence: sentence.trim(), score });
        }
    }

    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
}

function searchInJSONL(items, query, maxResults = 5) {
    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const results = [];

    for (const item of items) {
        const text = (item.text || "").toLowerCase();
        let score = 0;
        for (const word of words) {
            if (text.includes(word)) score++;
        }
        if (score > 0) {
            results.push({
                id: item.id,
                text: item.text,
                score
            });
        }
    }

    return results
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
}

// ============================================================
// MAIN ANALYSIS FUNCTION
// ============================================================

async function analyzeCase() {
    const facts = document.getElementById("case-facts").value.trim();
    const lawType = document.getElementById("law-type").value;
    const status = document.getElementById("status");
    const resultsSection = document.getElementById("results-section");
    const resultsContent = document.getElementById("results-content");
    const btn = document.getElementById("analyze-btn");

    if (!facts) {
        alert("Please describe your case facts.");
        return;
    }

    btn.disabled = true;
    status.innerHTML = '<span class="spinner"></span>Analyzing your case... This may take a moment.';
    resultsSection.style.display = "none";

    let allFindings = [];

    // Step 1: Search structured JSONL data (most accurate)
    status.innerHTML = '<span class="spinner"></span>Searching structured legal data...';

    for (const book of JSONL_BOOKS) {
        const items = await loadJSONL(book.file);
        if (items.length > 0) {
            const matches = searchInJSONL(items, facts);
            for (const match of matches) {
                allFindings.push({
                    source: book.name,
                    id: match.id,
                    text: match.text,
                    relevance: match.score
                });
            }
        }
    }

    // Step 2: Search PDFs (fallback / supplementary)
    status.innerHTML = '<span class="spinner"></span>Searching law books...';

    const pdfBooks = lawType === "shariah" ? LAW_BOOKS.shariah :
                     lawType === "pakistani" ? LAW_BOOKS.statutes :
                     [...LAW_BOOKS.statutes, ...LAW_BOOKS.shariah];

    for (const book of pdfBooks) {
        const text = await extractTextFromPDF(book.file);
        if (text.length > 0) {
            const matches = searchInText(text, facts);
            for (const match of matches) {
                allFindings.push({
                    source: book.name,
                    text: match.sentence,
                    relevance: match.score
                });
            }
        }
    }

    // Step 3: Sort by relevance and deduplicate
    allFindings.sort((a, b) => b.relevance - a.relevance);

    const seen = new Set();
    const uniqueFindings = allFindings.filter(f => {
        const key = f.text.substring(0, 100);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, 10);

    // Step 4: Display results
    displayResults(uniqueFindings, facts);
    btn.disabled = false;
    status.textContent = "";
}

function displayResults(findings, facts) {
    const section = document.getElementById("results-section");
    const content = document.getElementById("results-content");

    if (findings.length === 0) {
        content.innerHTML = `
            <p>No relevant legal provisions found for your query.</p>
            <p>Try describing your case with more specific legal terms, or consult a licensed advocate.</p>
        `;
        section.style.display = "block";
        return;
    }

    let html = `<p><strong>Your case:</strong> ${escapeHtml(facts.substring(0, 200))}...</p>`;
    html += `<h3>Relevant Legal Provisions Found (${findings.length})</h3>`;

    for (const finding of findings) {
        html += `
            <div class="citation">
                <strong>📖 ${escapeHtml(finding.source)}</strong>
                ${finding.id ? `<span style="color:#f0c040;"> — ${escapeHtml(finding.id)}</span>` : ""}
                <p style="margin-top:8px;">${escapeHtml(finding.text.substring(0, 500))}${finding.text.length > 500 ? "..." : ""}</p>
            </div>
        `;
    }

    html += `
        <div class="verdict-box">
            <h3>📋 How to Use This</h3>
            <p>These are the legal provisions most relevant to your described facts. This is <strong>not a verdict</strong>.</p>
            <p>Show these citations to a licensed advocate. They will assess how the law applies to your specific situation.</p>
            <p style="margin-top:12px; color:#8888aa; font-size:0.85rem;">
                ⚠️ This tool is for legal education only. It does not provide legal advice or binding judgments.
            </p>
        </div>
    `;

    content.innerHTML = html;
    section.style.display = "block";
    section.scrollIntoView({ behavior: "smooth" });
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// INITIALIZATION
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
    // Set up PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    console.log("AI Adalat initialized.");
    console.log("Books available:", LAW_BOOKS.statutes.length + LAW_BOOKS.shariah.length);
});