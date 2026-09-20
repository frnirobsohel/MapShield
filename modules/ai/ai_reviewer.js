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

      // Reviewer Name Extraction
      let reviewerName = 'Anonymous';
      
      // 1. Try finding from action menu or tooltip (contains exact name: "Actions for <Name>'s review")
      const actionBtn = document.querySelector('button[aria-label*="Actions for"], button[data-tooltip*="Actions for"], [aria-label*="\'s review"]');
      if (actionBtn) {
        const aria = actionBtn.getAttribute('aria-label') || actionBtn.getAttribute('data-tooltip') || '';
        const match = aria.match(/Actions for (?:the )?(?:user )?(.+?)'s review/i) || aria.match(/(.+?)'s review/i);
        if (match && match[1] && match[1].trim()) {
          reviewerName = match[1].trim();
        }
      }

      // 2. Fallback to DOM elements if not found via aria-label
      if (reviewerName === 'Anonymous') {
        const nameSelectors = [
          'button.WEBImb div.d4r55',
          'div.d4r55',
          'button.al6KDe .WNxdp',
          'div.WNxdp',
          'button[data-href*="contrib"]',
          'h1.DUwDvf',
          'div.fontHeadlineSmall'
        ];
        for (const sel of nameSelectors) {
          const el = document.querySelector(sel);
          if (el && el.innerText && el.innerText.trim() && el.innerText.trim().length < 60) {
            reviewerName = el.innerText.trim();
            break;
          }
        }
      }

      // Rating Extraction (detect exact number of stars)
      let rating = 'Unknown';
      const allStars = Array.from(document.querySelectorAll('[aria-label*="star"], [aria-label*="Star"]'));
      for (const el of allStars) {
        const aria = (el.getAttribute('aria-label') || '').trim();
        const m = aria.match(/\b([1-5])\s*stars?\b/i);
        if (m) {
          rating = `${m[1]} star${m[1] === '1' ? '' : 's'}`;
          break;
        }
      }

      // Business Name Extraction from Google Maps Listing
      let businessName = '';
      const bTitleEl = document.querySelector('h1.DUwDvf, h1.fontHeadlineLarge, h2.fontHeadlineLarge, .fontHeadlineLarge');
      if (bTitleEl && bTitleEl.innerText && bTitleEl.innerText.trim().length > 1) {
        businessName = bTitleEl.innerText.trim();
      } else if (document.title && document.title.includes('- Google Maps')) {
        businessName = document.title.replace(/- Google Maps.*/i, '').trim();
      }

      return { reviewText, reviewerName, rating, businessName };
    });

    return details;
  } catch (e) {
    return { reviewText: '', reviewerName: 'Unknown', rating: 'Unknown', businessName: '' };
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
 * Builds prompt asking for top 1 to 3 violation categories
 */
function buildMultiCategoryPrompt(reviewText, reviewerName, rating) {
  return `You are an expert Google Maps content moderation policy engine.
Analyze the following Google Maps review and select the TOP 1 to 3 MOST APPLICABLE violation categories from Google Maps policy under which this review can be reported and removed.

OFFICIAL GOOGLE MAPS VIOLATION CATEGORIES:
- "spam": Review is fake, bot-generated, promotional, or paid.
- "conflict": Conflict of interest (competitor, disgruntled employee, competitor's affiliate).
- "offtopic": Doesn't describe a genuine personal customer experience with the business.
- "bullying": Bullying, personal attacks against specific staff/individuals, or harassment.
- "profanity": Offensive, profane, or inappropriate language.
- "harmful": Depicts or encourages harm, illegal acts, or dangerous content.
- "discrimination": Hate speech, identity-based insults.
- "personal_info": Contains private phone numbers, full addresses, or personal identity info.
- "not_helpful": Unhelpful rating or irrelevant gibberish.

REVIEW DATA:
Reviewer: ${reviewerName || 'Anonymous'}
Rating: ${rating || 'Unknown'}
Review Text: "${reviewText || '(No text content, rating only)'}"

INSTRUCTIONS:
1. Select between 1 and 3 categories from the list above, ordered by strongest relevance first.
2. If the review text is empty or generic 1-star rating with no text, default to: ["spam", "conflict", "offtopic"].
3. Provide a brief 1-sentence reasoning for the selection.

Respond ONLY with valid JSON in this exact structure:
{
  "categories": ["spam", "conflict", "offtopic"],
  "reasoning": "1-sentence explanation"
}`;
}

/**
 * Analyzes review and returns up to 3 best-fitting violation categories
 */
async function analyzeReviewMultiCategoriesWithAI({ reviewText, reviewerName, rating, provider = 'gemini', apiKey, model }) {
  if (!apiKey) {
    return {
      categories: ['spam', 'conflict', 'offtopic'],
      reasoning: 'No AI API Key provided; defaulted to top standard violation categories.'
    };
  }

  const prompt = buildMultiCategoryPrompt(reviewText, reviewerName, rating);
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
    console.error(`❌ AI Multi-category analysis failed with ${provider}:`, err.message);
    return {
      categories: ['spam', 'conflict', 'offtopic'],
      reasoning: `AI Error: ${err.message}`
    };
  }

  const validCategories = [
    'offtopic', 'spam', 'conflict', 'profanity', 'harmful',
    'bullying', 'discrimination', 'personal_info', 'not_helpful'
  ];

  let cats = Array.isArray(result?.categories) ? result.categories : [];
  if (cats.length === 0 && result?.category) {
    cats = [result.category];
  }

  // Normalize aliases
  cats = cats.map(c => {
    let clean = String(c || '').toLowerCase().trim();
    if (clean === 'personal_information') clean = 'personal_info';
    if (clean === 'nothelpful') clean = 'not_helpful';
    if (clean === 'harassment') clean = 'bullying';
    return clean;
  }).filter(c => validCategories.includes(c));

  // Deduplicate and cap at 3
  cats = [...new Set(cats)].slice(0, 3);
  if (cats.length === 0) {
    cats = ['spam', 'conflict', 'offtopic'];
  }

  return {
    categories: cats,
    reasoning: result?.reasoning || 'Selected by AI Policy Moderation Engine'
  };
}

/**
 * Builds legal removal prompt for AI evaluation tailored for Google's 1000-char legal textarea
 */
function buildLegalPrompt(reviewText, reviewerName, rating, businessName = 'the business') {
  const isBlank = !reviewText || reviewText.trim().length === 0 || reviewText.trim() === '(No text content, rating only)';
  
  return `You are a certified legal content removal specialist specializing in Google Maps Defamation, 16 C.F.R. Part 465 (FTC Fake Review Rule), and Commercial Libel Per Se.
Analyze the following Google Maps review and generate a formal legal complaint text specifically designed for Google's Legal Removal Webform ("Explain in detail why you believe the content on the above URL is unlawful").

TARGET REVIEW DATA:
Reviewer Name: ${reviewerName || 'Anonymous'}
Rating: ${rating || '1 star'}
Business Name: ${businessName}
Review Content: "${isBlank ? '[BLANK 1-STAR RATING WITH ZERO TEXT]' : reviewText.trim()}"

STRICT CONSTRAINTS:
1. "legalClaimText" MUST BE BETWEEN 650 AND 920 CHARACTERS IN LENGTH. Under NO circumstances exceed 950 characters (Google has a strict 1000 character limit).
2. For reviews WITH text:
   - Establish lack of consumer nexus: State that business audited CRM/billing records and confirms reviewer was never a client, violating 16 C.F.R. § 465.2.
   - Establish Defamation Per Se: State that the false factual allegations impute dishonesty/unlawful acts, causing tortious interference with business operations.
   - Demand immediate removal under Google UGC Content Policy & applicable civil defamation laws.
3. For BLANK reviews (no text):
   - Cite 16 C.F.R. Part 465 & Google Fake Engagement Policy: unverified 1-star rating attack with zero commercial transaction, published with malicious intent to distort the public rating index.
4. Do NOT use bullet points or markdown headings. Write as a continuous, formal legal paragraph suitable for a webform textarea.

Respond ONLY with valid JSON in this exact structure:
{
  "isLegalViolation": true,
  "legalGrounds": "Defamation Per Se and Deceptive Fake Review (16 CFR § 465.2)",
  "severity": "high",
  "infringingExcerpts": ["key quote or blank indicator"],
  "legalClaimText": "formal legal justification paragraph (650 to 920 characters max)",
  "formalNoticeSummary": "Demand for immediate removal under Google Policy and Applicable Civil Law"
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
  const cleanText = (reviewText || '').trim();
  const isBlank = !cleanText || cleanText === '(No text content, rating only)';
  const revName = (reviewerName || 'Anonymous').trim();

  // High-success battle-tested fallback legal templates (<900 chars)
  const defaultTextLegal = `This review published by "${revName}" contains false and defamatory factual allegations that inflict commercial injury on ${businessName}. A thorough audit of all point-of-sale, appointment, and CRM records confirms this individual has never been a client or patron of this establishment. Fabricating consumer interactions violates 16 C.F.R. § 465.2 (FTC Rule on Fake Consumer Reviews) and constitutes Defamation Per Se and tortious interference with prospective economic advantage. The statements lack factual basis and were posted with malice to damage business reputation. We formally demand immediate removal under Google's Prohibited and Restricted Content Policy and applicable defamation laws.`;

  const defaultBlankLegal = `This 1-star rating submitted by "${revName}" contains zero descriptive feedback and represents a deceptive, unverified attack against ${businessName}. An internal audit confirms the poster is not a registered client or patron. Under 16 C.F.R. Part 465 (FTC Rule on Fake Reviews and Deceptive Practices) and Google's Fake Engagement policy, publishing ratings without genuine commercial experience is an unlawful deceptive practice intended solely to artificially manipulate public rating metrics. Because there is no consumer transaction supporting this submission, it constitutes tortious commercial disparagement. We formally demand immediate removal of this rating from Google Maps.`;

  const defaultLegalNotice = {
    isLegalViolation: true,
    legalGrounds: isBlank ? 'Deceptive Fake Engagement (16 C.F.R. § 465.2)' : 'Defamation Per Se & 16 C.F.R. § 465.2',
    severity: 'high',
    infringingExcerpts: isBlank ? ['Blank 1-star rating attack'] : [cleanText.slice(0, 100)],
    legalClaimText: isBlank ? defaultBlankLegal : defaultTextLegal,
    formalNoticeSummary: `Formal Legal Removal Demand under 16 C.F.R. Part 465 and Google Maps Policy.`
  };

  // If no AI key, return deterministic battle-tested legal template
  if (!apiKey) {
    console.log('⚖️ [Legal Template] Using deterministic high-compliance legal template (No AI key).');
    return defaultLegalNotice;
  }

  const prompt = buildLegalPrompt(cleanText, revName, rating, businessName);
  console.log(`⚖️ [AI Legal Decision] Generating tailored legal justification with ${(provider || 'gemini').toUpperCase()}...`);

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

  let finalClaim = (result?.legalClaimText || defaultLegalNotice.legalClaimText).trim();
  // Strictly enforce Google's 1000 character limit by capping at 950 characters
  if (finalClaim.length > 950) {
    finalClaim = finalClaim.slice(0, 940).trim() + '... Immediate removal demanded under applicable law.';
  }

  return {
    isLegalViolation: result?.isLegalViolation !== undefined ? result.isLegalViolation : true,
    legalGrounds: result?.legalGrounds || defaultLegalNotice.legalGrounds,
    severity: result?.severity || defaultLegalNotice.severity,
    infringingExcerpts: Array.isArray(result?.infringingExcerpts) ? result.infringingExcerpts : defaultLegalNotice.infringingExcerpts,
    legalClaimText: finalClaim,
    formalNoticeSummary: result?.formalNoticeSummary || defaultLegalNotice.formalNoticeSummary
  };
}

module.exports = {
  extractReviewDetails,
  analyzeReviewWithAI,
  analyzeReviewMultiCategoriesWithAI,
  generateLegalNoticeWithAI,
  buildPrompt,
  buildMultiCategoryPrompt,
  reviewViolationWithGemini: analyzeReviewWithAI
};
