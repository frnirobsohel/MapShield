/**
 * modules/ai_reviewer.js
 * Multi-provider AI Review Analyzer (Gemini, Claude, DeepSeek, ChatGPT)
 * Evaluates Google Maps reviews and makes smart reporting category decisions.
 */

/**
 * Extracts review text and metadata from the active Google Maps page
 * @param {import('rebrowser-puppeteer-core').Page} page
 * @returns {Promise<{reviewText: string, reviewerName: string, rating: string}>}
 */
async function extractReviewDetails(page) {
  try {
    const details = await page.evaluate(() => {
      // Common Google Maps review text selectors
      const textSelectors = [
        '.wiI7pd',
        'span.wiI7pd',
        '.MyEned',
        'div.MyEned span',
        '[data-review-id] .wiI7pd',
        'div.fontBodyMedium > span',
        '.d4r55',
        '.rsqaWe'
      ];

      let reviewText = '';
      for (const sel of textSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim().length > 3) {
          reviewText = el.innerText.trim();
          break;
        }
      }

      // Reviewer Name
      const nameSelectors = [
        '.d4r55',
        'button.al6KDe .WNxdp',
        'div.WNxdp',
        'h1.DUwDvf',
        'div.fontHeadlineSmall'
      ];
      let reviewerName = 'Anonymous';
      for (const sel of nameSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim()) {
          reviewerName = el.innerText.trim();
          break;
        }
      }

      // Rating
      let rating = 'Unknown';
      const starEl = document.querySelector('span[aria-label*="star"], span[aria-label*="Star"]');
      if (starEl) {
        rating = starEl.getAttribute('aria-label') || 'Unknown';
      }

      return { reviewText, reviewerName, rating };
    });

    return details;
  } catch (e) {
    return { reviewText: '', reviewerName: 'Unknown', rating: 'Unknown' };
  }
}

/**
 * Builds standard system prompt for review policy evaluation
 */
function buildPrompt(reviewText, reviewerName, rating) {
  return `You are an expert content policy evaluator for Google Maps reviews.
Analyze the following Google Maps review and decide the most accurate violation category under which this review should be reported and removed.

OFFICIAL GOOGLE MAPS VIOLATION CATEGORIES:
1. "offtopic" - Review doesn't pertain to an experience at or with this business.
2. "spam" - Review is from a bot, a fake account, or contains ads and promotions.
3. "conflict" - Review is from someone affiliated with the business or a competitor's business.
4. "profanity" - Review contains swear words, or has pornographic or sexually explicit language.
5. "harmful" - Review contains content that encourages self-harm, dangerous items, or graphic violence to people or animals.
6. "bullying" - Review personally attacks a specific individual (bullying or harassment).
7. "discrimination" - Review has harmful language about an individual or group based on identity (hate speech).
8. "personal_info" - Review contains personal information, such as an address or phone number.
9. "not_helpful" - Review doesn't help people decide whether to go to this place.
10. "legal" - Severe defamation, false criminal allegations, trademark/copyright infringement requiring formal legal notice.

REVIEW DATA:
Reviewer: ${reviewerName || 'Anonymous'}
Rating: ${rating || 'Unknown'}
Review Text: "${reviewText || '(No text content, rating only)'}"

INSTRUCTIONS:
Select the SINGLE most appropriate category: "offtopic", "spam", "conflict", "profanity", "harmful", "bullying", "discrimination", "personal_info", "not_helpful", or "legal".
Provide a concise reasoning (1-2 sentences).
If text is completely empty or generic 1-star with no text, default to "spam".

Respond ONLY with valid JSON in this exact structure:
{
  "category": "offtopic" | "spam" | "conflict" | "profanity" | "harmful" | "bullying" | "discrimination" | "personal_info" | "not_helpful" | "legal",
  "confidence": 0.95,
  "reasoning": "brief explanation",
  "recommendedMode": "standard" | "legal" | "both"
}`;
}

/**
 * Calls Gemini API
 */
async function callGemini(apiKey, model, prompt) {
  const modelName = model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API returned ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  return JSON.parse(text);
}

/**
 * Calls OpenAI ChatGPT API
 */
async function callOpenAI(apiKey, model, prompt) {
  const modelName = model || 'gpt-4o-mini';
  const url = 'https://api.openai.com/v1/chat/completions';

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: 'You are an expert Google Maps content moderation policy engine. Output valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI API returned ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content || '{}';
  return JSON.parse(text);
}

/**
 * Calls Anthropic Claude API
 */
async function callAnthropic(apiKey, model, prompt) {
  const modelName = model || 'claude-3-5-sonnet-latest';
  const url = 'https://api.anthropic.com/v1/messages';

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: modelName,
      max_tokens: 350,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Claude API returned ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data?.content?.[0]?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { category: 'spam', reasoning: text };
}

/**
 * Calls DeepSeek API
 */
async function callDeepSeek(apiKey, model, prompt) {
  const modelName = model || 'deepseek-chat';
  const url = 'https://api.deepseek.com/chat/completions';

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: 'You are an expert Google Maps policy moderation AI. Output valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1
    })
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`DeepSeek API returned ${resp.status}: ${errText}`);
  }

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content || '{}';
  return JSON.parse(text);
}

/**
 * Main AI Analyzer Entrypoint
 * @param {Object} params
 * @param {string} params.reviewText
 * @param {string} params.reviewerName
 * @param {string} params.rating
 * @param {string} params.provider - 'gemini' | 'openai' | 'anthropic' | 'deepseek'
 * @param {string} params.apiKey
 * @param {string} params.model
 * @returns {Promise<{category: string, confidence: number, reasoning: string, recommendedMode: string}>}
 */
async function analyzeReviewWithAI({ reviewText, reviewerName, rating, provider = 'gemini', apiKey, model }) {
  if (!apiKey) {
    console.warn('⚠️ No AI API Key provided. Defaulting report reason to "spam".');
    return { category: 'spam', confidence: 0.5, reasoning: 'No API Key configured', recommendedMode: 'standard' };
  }

  const prompt = buildPrompt(reviewText, reviewerName, rating);

  console.log(`🤖 [AI Smart Decision] Analyzing review with ${(provider || 'gemini').toUpperCase()} (${model || 'default'})...`);
  if (reviewText) {
    console.log(`📝 Review Text Snippet: "${reviewText.slice(0, 100)}${reviewText.length > 100 ? '...' : ''}"`);
  } else {
    console.log('📝 Review has no text body (Rating only).');
  }

  let result = null;
  const prov = (provider || 'gemini').toLowerCase();

  try {
    if (prov === 'gemini') {
      result = await callGemini(apiKey, model, prompt);
    } else if (prov === 'openai') {
      result = await callOpenAI(apiKey, model, prompt);
    } else if (prov === 'anthropic') {
      result = await callAnthropic(apiKey, model, prompt);
    } else if (prov === 'deepseek') {
      result = await callDeepSeek(apiKey, model, prompt);
    } else {
      result = await callGemini(apiKey, model, prompt);
    }
  } catch (err) {
    console.error(`❌ AI Analysis failed with ${provider}:`, err.message);
    return { category: 'spam', confidence: 0.5, reasoning: `AI Error: ${err.message}`, recommendedMode: 'standard' };
  }

  const validCategories = [
    'offtopic',
    'spam',
    'conflict',
    'profanity',
    'harmful',
    'bullying',
    'discrimination',
    'personal_info',
    'not_helpful',
    'legal'
  ];
  let chosenCategory = (result?.category || 'spam').toLowerCase().trim();
  if (chosenCategory === 'personal_information') chosenCategory = 'personal_info';
  if (chosenCategory === 'nothelpful') chosenCategory = 'not_helpful';
  if (!validCategories.includes(chosenCategory)) {
    chosenCategory = 'spam';
  }

  const mode = result?.recommendedMode || (chosenCategory === 'legal' ? 'legal' : 'standard');

  console.log(`🎯 [AI Decision Result]:`);
  console.log(`   Violation Category: ${chosenCategory.toUpperCase()}`);
  console.log(`   Report Mode:        ${mode.toUpperCase()}`);
  console.log(`   Analysis Reasoning: ${result?.reasoning || 'N/A'}`);

  return {
    category: chosenCategory,
    confidence: result?.confidence || 0.9,
    reasoning: result?.reasoning || 'Evaluated by AI moderation engine',
    recommendedMode: mode
  };
}

/**
 * Builds legal removal prompt for AI evaluation
 */
function buildLegalPrompt(reviewText, reviewerName, rating, businessName = 'the business') {
  return `You are a certified legal content specialist specializing in Online Defamation, False Representation, and Content Removal under Google Content Policy and Applicable Civil Law.
Analyze the following Google Maps review and generate a formal legal complaint and removal justification.

TARGET REVIEW DATA:
Reviewer: ${reviewerName || 'Anonymous'}
Rating: ${rating || '1 star'}
Business: ${businessName}
Review Text: "${reviewText || '(No text content, rating only)'}"

TASKS:
1. Determine if the review contains legally actionable elements:
   - Defamation / Libel (unsubstantiated false factual claims damaging commercial reputation)
   - False allegations of criminal or illegal activity
   - Harassment / Intentional infliction of economic distress
   - Conflict of interest / Extortion
2. Formulate formal legal grounds and specific legal arguments suitable for Google Legal Troubleshooter / Legal Removal Webform.

Respond ONLY with valid JSON in this exact structure:
{
  "isLegalViolation": true,
  "legalGrounds": "Defamation and Unlawful Commercial Disparagement",
  "severity": "high" | "medium" | "low",
  "infringingExcerpts": ["quote 1", "quote 2"],
  "legalClaimText": "formal legal justification explaining the violation of law and damage to business",
  "formalNoticeSummary": "Brief summary of removal demand under applicable content removal law"
}`;
}

/**
 * Generates structured legal removal notice and grounds using AI
 * @param {Object} params
 * @param {string} params.reviewText
 * @param {string} params.reviewerName
 * @param {string} params.rating
 * @param {string} params.provider
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {string} [params.businessName]
 * @returns {Promise<{
 *   isLegalViolation: boolean,
 *   legalGrounds: string,
 *   severity: string,
 *   infringingExcerpts: string[],
 *   legalClaimText: string,
 *   formalNoticeSummary: string
 * }>}
 */
async function generateLegalNoticeWithAI({
  reviewText,
  reviewerName,
  rating,
  provider = 'gemini',
  apiKey,
  model,
  businessName = 'the affected business'
}) {
  const defaultLegalNotice = {
    isLegalViolation: true,
    legalGrounds: 'Defamation and False Representation',
    severity: 'high',
    infringingExcerpts: reviewText ? [reviewText.slice(0, 120)] : ['Unsubstantiated rating attack'],
    legalClaimText: `The review published by "${reviewerName || 'Anonymous'}" contains materially false, defamatory statements that inflict commercial injury and tortious interference against ${businessName}. The claims lack factual basis and constitute unlawful defamation under applicable civil law and Google User Contributed Content policies.`,
    formalNoticeSummary: `Formal Legal Notice: Demand for immediate removal of defamatory content under applicable law.`
  };

  if (!apiKey) {
    console.warn('⚠️ No AI API Key provided for Legal Notice generation. Using standard legal template.');
    return defaultLegalNotice;
  }

  const prompt = buildLegalPrompt(reviewText, reviewerName, rating, businessName);
  console.log(`⚖️ [AI Legal Decision] Evaluating legal grounds with ${(provider || 'gemini').toUpperCase()}...`);

  let result = null;
  const prov = (provider || 'gemini').toLowerCase();

  try {
    if (prov === 'gemini') {
      result = await callGemini(apiKey, model, prompt);
    } else if (prov === 'openai') {
      result = await callOpenAI(apiKey, model, prompt);
    } else if (prov === 'anthropic') {
      result = await callAnthropic(apiKey, model, prompt);
    } else if (prov === 'deepseek') {
      result = await callDeepSeek(apiKey, model, prompt);
    } else {
      result = await callGemini(apiKey, model, prompt);
    }
  } catch (err) {
    console.error(`❌ AI Legal Notice generation failed with ${provider}:`, err.message);
    return defaultLegalNotice;
  }

  return {
    isLegalViolation: result?.isLegalViolation !== undefined ? result.isLegalViolation : true,
    legalGrounds: result?.legalGrounds || defaultLegalNotice.legalGrounds,
    severity: result?.severity || defaultLegalNotice.severity,
    infringingExcerpts: Array.isArray(result?.infringingExcerpts) ? result.infringingExcerpts : defaultLegalNotice.infringingExcerpts,
    legalClaimText: result?.legalClaimText || defaultLegalNotice.legalClaimText,
    formalNoticeSummary: result?.formalNoticeSummary || defaultLegalNotice.formalNoticeSummary
  };
}

module.exports = {
  extractReviewDetails,
  analyzeReviewWithAI,
  generateLegalNoticeWithAI,
  reviewViolationWithGemini: analyzeReviewWithAI
};
