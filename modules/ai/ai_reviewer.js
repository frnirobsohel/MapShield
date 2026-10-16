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
      // Expand "More" / "See more" if review text is truncated
      try {
        const moreButtons = Array.from(document.querySelectorAll('button.w8nwRe, button[aria-label*="See more"], button[aria-label*="More"], span[aria-label*="See more"]'));
        for (const btn of moreButtons) {
          if (btn && btn.offsetParent !== null) {
            btn.click();
          }
        }
      } catch (e) {}

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
  return `You are an expert Google Maps content moderation policy engine.
Analyze the following Google Maps review and decide the SINGLE most accurate and actionable violation category under which this review should be reported and removed according to official Google Maps Prohibited and Restricted Content policies.

OFFICIAL GOOGLE MAPS VIOLATION CATEGORIES & DISAMBIGUATION RULES:
1. "profanity" -> Review contains explicit curse words, vulgarity, swearing, sexual innuendos, or obscene slurs.
2. "bullying" -> Review attacks, insults, or singles out an individual employee, manager, doctor, or owner by name, appearance, or personal traits (harassment/doxxing).
3. "discrimination" -> Hate speech targeting race, ethnicity, religion, disability, age, nationality, sexual orientation, or gender identity.
4. "personal_info" -> Review leaks private information such as personal phone numbers, physical residential addresses, private email addresses, or government IDs.
5. "conflict" -> Conflict of interest: review by a competitor, business owner, former/current disgruntled employee, or reviewer explicitly mentions they never visited ("never went here", "fake place", "go to [Competitor] instead").
6. "harmful" -> Encourages, depicts, or threatens physical violence, illegal weapon use, drug abuse, self-harm, or severe safety hazards.
7. "offtopic" -> Content does not pertain to the business customer experience (political commentary, social rants, municipal parking/traffic issues, unrelated public affairs).
8. "spam" -> Review is fake, bot-generated, promotional advertisement, contains external marketing URLs/phone numbers, or is a BLANK 1-star rating with no text or meaningless gibberish ("asdfghjk").
9. "not_helpful" -> Vague, 1-2 word unconstructive complaints without any actionable factual experience ("bad", "terrible", "worst place", "no").
10. "legal" -> Severe legal defamation per se, extortion/blackmail, false criminal accusations (e.g. "thieves", "scam artists", "fraudsters", "stole my credit card"), or copyright/trademark infringement requiring legal action.

PRIORITY HIERARCHY FOR TIE-BREAKING:
If multiple violations are present, prioritize in this strict order:
Legal Defamation / Crime allegations > Profanity > Discrimination > Bullying > Personal Info > Conflict of Interest > Harmful > Off-Topic > Spam > Not Helpful.

REVIEW DATA TO EVALUATE:
Reviewer: ${reviewerName || 'Anonymous'}
Rating: ${rating || 'Unknown'}
Review Text: "${(reviewText || '').trim() || '(No text content, rating only)'}"

INSTRUCTIONS:
1. Select the SINGLE most appropriate category: "offtopic", "spam", "conflict", "profanity", "harmful", "bullying", "discrimination", "personal_info", "not_helpful", or "legal".
2. If text is completely empty or generic 1-star with zero text, select "spam".
3. Provide a concise, professional 1-2 sentence legal reasoning explaining why this review violates Google Maps policy.
4. If the category is "legal" or contains severe criminal accusations ("scam", "thieves", "fraud"), set "recommendedMode" to "legal", otherwise "standard".

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
        temperature: 0.0
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
      temperature: 0.0
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
      temperature: 0.0,
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
      temperature: 0.0
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
- "spam": Fake, bot-generated, advertising, repetitive, or blank 1-star ratings with zero text.
- "conflict": Conflict of interest (competitor, disgruntled employee, or poster never visited the location).
- "bullying": Singling out or harassing specific individuals/staff members by name or role.
- "profanity": Swear words, vulgarity, offensive or sexually explicit language.
- "offtopic": Not about a real customer experience (politics, social rants, municipal complaints).
- "discrimination": Hate speech, slurs against race, religion, nationality, or identity.
- "personal_info": Leaking private phone numbers, home addresses, or personal contact details.
- "harmful": Content depicting or encouraging violence, illegal acts, or dangerous harm.
- "not_helpful": Vague, meaningless, or completely non-actionable complaints ("bad", "terrible").

PRIORITY & DISAMBIGUATION:
1. Rank categories in order of strongest legal and policy violation first.
2. If the review text is empty or generic 1-star rating with no text, select: ["spam", "conflict", "offtopic"].
3. If reviewer accuses business of scam/theft/fraud: ["conflict", "spam", "offtopic"].
4. Provide a 1-sentence reasoning for the selection.

REVIEW DATA:
Reviewer: ${reviewerName || 'Anonymous'}
Rating: ${rating || 'Unknown'}
Review Text: "${(reviewText || '').trim() || '(No text content, rating only)'}"

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
  
  return `You are writing a formal review removal request on behalf of ${businessName} for Google's Legal Webform ("Explain in detail why you believe the content on the above URL is unlawful").

WRITE LIKE A REAL HUMAN (AUTHENTIC BUSINESS OWNER / MANAGER):
- Do NOT sound like an AI bot or use stiff, robotic legalese clichés (avoid robotic phrases like "The undersigned hereby declares", "Furthermore pursuant to", "In witness whereof").
- Write with the natural voice of a real, genuine human business owner or manager who is reporting a false or malicious review.
- Explain clearly and naturally what happened: that the business searched customer databases, billing records, and appointment logs, and confirmed this person was never a client or visitor.
- Naturally integrate legal and policy principles: mention that the false claims constitute commercial defamation, harm business livelihood, and violate Google's Fake Engagement & Deceptive Content policy, and where appropriate, cite FTC 16 C.F.R. § 465.2 or defamation per se.
- Keep the writing realistic, professional, direct, and convincing.

TARGET REVIEW DATA:
Reviewer Name: ${reviewerName || 'Anonymous'}
Rating: ${rating || '1 star'}
Business Name: ${businessName}
Review Content: "${isBlank ? '[BLANK 1-STAR RATING WITH ZERO TEXT]' : reviewText.trim()}"

LENGTH CONSTRAINTS:
- Length MUST BE between 100 and 140 words (strictly between 600 and 920 characters total).
- Under NO circumstances exceed 950 characters (Google has an absolute 1000 character limit on this webform).
- Write as a single continuous paragraph without bullet points or headers.

Respond ONLY with valid JSON in this exact structure:
{
  "isLegalViolation": true,
  "legalGrounds": "Commercial Defamation and Deceptive Fake Review (16 C.F.R. § 465.2)",
  "severity": "high",
  "infringingExcerpts": ["key quote or blank indicator"],
  "legalClaimText": "human, authentic, persuasive removal explanation (100-140 words, 600-920 characters max)",
  "formalNoticeSummary": "Removal request for fake and defamatory review"
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

  // High-success battle-tested fallback legal templates (Human tone with legal backing, 100-140 words, <900 chars)
  const defaultTextLegal = `We have reviewed the post submitted by "${revName}" regarding ${businessName}. This claim is completely false. We checked our customer database, billing records, and appointment logs, and this person has never been a client, patient, or visitor at our business. The allegations made here are entirely made up and seem intended to harm our reputation and mislead the public. Fabricating non-existent customer experiences violates Google's Fake Engagement policy as well as 16 C.F.R. § 465.2 (FTC rule against fake reviews) and constitutes commercial defamation. Because this person had no real customer interaction with us, we respectfully request that Google immediately remove this unlawful review.`;

  const defaultBlankLegal = `This 1-star rating from "${revName}" contains zero written details and is a completely fake submission targeting ${businessName}. We cross-referenced our customer records and confirmed that this individual has never visited or transacted with us. Submitting unverified 1-star ratings without having any actual commercial experience violates Google's Prohibited Content Policy on fake engagement, as well as 16 C.F.R. § 465.2. It is an intentional attempt to manipulate our public rating metrics and harm our business livelihood. Because there is no genuine customer experience behind this rating, we ask Google to remove it immediately.`;

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
  if (!finalClaim || finalClaim.length < 50) {
    finalClaim = defaultLegalNotice.legalClaimText;
  } else if (finalClaim.length > 950) {
    const truncated = finalClaim.slice(0, 880).replace(/\s+\S*$/, '');
    finalClaim = `${truncated}... Immediate removal requested under Google policy and 16 C.F.R. § 465.2.`;
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
  buildLegalPrompt,
  reviewViolationWithGemini: analyzeReviewWithAI
};
