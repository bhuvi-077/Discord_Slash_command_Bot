/**
 * AI integration — supports either Google Gemini or Groq (both free, no card).
 * Used to summarize/triage /report commands.
 * Falls back gracefully if no API key is set or the call fails.
 *
 * Provider is chosen automatically: if GROQ_API_KEY is set, Groq is used.
 * Otherwise, if GEMINI_API_KEY is set, Gemini is used. If neither is set,
 * analyzeReport() returns null and the bot just skips AI triage.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.1-8b-instant'; // fast + free tier friendly

function buildPrompt(reportText, severity) {
  return `You are a triage assistant. Analyze this user-submitted report and respond ONLY with valid JSON (no markdown, no code fences).

Report: "${reportText}"
User-selected severity: ${severity || 'not specified'}

Respond with exactly this JSON structure:
{
  "summary": "one sentence summary of the issue",
  "tags": ["tag1", "tag2", "tag3"],
  "suggested_priority": "low|medium|high|critical",
  "action_required": true|false,
  "triage_note": "brief note for the admin (max 20 words)"
}`;
}

function cleanAndParse(text) {
  if (!text) return null;
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned);
}

async function callGemini(prompt, apiKey) {
  const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[AI] Gemini error:', res.status, err.substring(0, 200));
    return null;
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return cleanAndParse(text);
}

async function callGroq(prompt, apiKey) {
  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: 'You are a triage assistant. Always respond with valid JSON only, no markdown.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 256,
      response_format: { type: 'json_object' }, // Groq supports forced JSON mode
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[AI] Groq error:', res.status, err.substring(0, 200));
    return null;
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  return cleanAndParse(text);
}

/**
 * Analyze a report submission with AI.
 * Returns { summary, tags, suggested_priority, action_required, triage_note } or null on failure.
 */
async function analyzeReport(reportText, severity) {
  const groqKey = process.env.GROQ_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!groqKey && !geminiKey) return null;

  const prompt = buildPrompt(reportText, severity);

  try {
    if (groqKey) {
      return await callGroq(prompt, groqKey);
    }
    return await callGemini(prompt, geminiKey);
  } catch (err) {
    console.error('[AI] Analysis failed:', err.message);
    return null;
  }
}

/**
 * Format AI result for display in Discord message.
 */
function formatAiResultForDiscord(aiResult) {
  if (!aiResult) return '';
  const priorityEmoji = { low: '🟢', medium: '🟡', high: '🔴', critical: '🚨' };
  const emoji = priorityEmoji[aiResult.suggested_priority] || '⚪';
  const tags = aiResult.tags?.map(t => `\`${t}\``).join(' ') || '';
  return `\n\n🤖 **AI Triage**: ${emoji} ${aiResult.suggested_priority?.toUpperCase()}\n📋 ${aiResult.summary}\n🏷️ ${tags}${aiResult.triage_note ? `\n💡 ${aiResult.triage_note}` : ''}`;
}

module.exports = { analyzeReport, formatAiResultForDiscord };