const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPrompt,
  buildMultiCategoryPrompt,
  buildLegalPrompt,
  generateLegalNoticeWithAI
} = require('../modules/ai/ai_reviewer');

test('AI Reviewer: buildPrompt contains official Google Maps violation categories and priority hierarchy', () => {
  const prompt = buildPrompt('The manager John was extremely rude and cursed at me', 'Anonymous', '1 star');
  
  // Verify all 10 official categories are present
  assert.ok(prompt.includes('"profanity"'));
  assert.ok(prompt.includes('"bullying"'));
  assert.ok(prompt.includes('"discrimination"'));
  assert.ok(prompt.includes('"personal_info"'));
  assert.ok(prompt.includes('"conflict"'));
  assert.ok(prompt.includes('"harmful"'));
  assert.ok(prompt.includes('"offtopic"'));
  assert.ok(prompt.includes('"spam"'));
  assert.ok(prompt.includes('"not_helpful"'));
  assert.ok(prompt.includes('"legal"'));

  // Verify priority hierarchy & tie-breaking rules
  assert.ok(prompt.includes('PRIORITY HIERARCHY FOR TIE-BREAKING'));
  assert.ok(prompt.includes('Reviewer: Anonymous'));
  assert.ok(prompt.includes('Rating: 1 star'));
  assert.ok(prompt.includes('The manager John was extremely rude and cursed at me'));
});

test('AI Reviewer: buildMultiCategoryPrompt specifies top 1 to 3 selection contract', () => {
  const multiPrompt = buildMultiCategoryPrompt('', 'TestUser', '1 star');
  
  assert.ok(multiPrompt.includes('TOP 1 to 3 MOST APPLICABLE'));
  assert.ok(multiPrompt.includes('["spam", "conflict", "offtopic"]'));
  assert.ok(multiPrompt.includes('(No text content, rating only)'));
});

test('AI Reviewer: buildLegalPrompt enforces FTC Part 465 and character constraints', () => {
  const legalPrompt = buildLegalPrompt('False claims of food poisoning that never occurred', 'John Doe', '1 star', 'Acme Bistro');
  
  assert.ok(legalPrompt.includes('16 C.F.R. § 465.2'));
  assert.ok(legalPrompt.includes('Acme Bistro'));
  assert.ok(legalPrompt.includes('600 and 920 characters'));
  assert.ok(legalPrompt.includes('WRITE LIKE A REAL HUMAN'));
});

test('AI Reviewer: generateLegalNoticeWithAI deterministic fallback complies with character limits (<950)', async () => {
  const notice = await generateLegalNoticeWithAI({
    reviewText: 'Fake review claimed we stole their credit card',
    reviewerName: 'Scammer123',
    rating: '1 star',
    businessName: 'Apex Dental Care',
    apiKey: undefined
  });

  assert.ok(notice.isLegalViolation);
  assert.ok(notice.legalClaimText.length >= 600, `Length ${notice.legalClaimText.length} must be >= 600`);
  assert.ok(notice.legalClaimText.length <= 950, `Length ${notice.legalClaimText.length} must be <= 950`);
  assert.ok(notice.legalClaimText.includes('Apex Dental Care'));
  assert.ok(notice.legalClaimText.includes('16 C.F.R. § 465.2'));

  // Test Blank Review Fallback
  const blankNotice = await generateLegalNoticeWithAI({
    reviewText: '',
    reviewerName: 'Anonymous',
    rating: '1 star',
    businessName: 'Apex Dental Care',
    apiKey: undefined
  });

  assert.ok(blankNotice.isLegalViolation);
  assert.ok(blankNotice.legalClaimText.length >= 500 && blankNotice.legalClaimText.length <= 950);
  assert.ok(blankNotice.legalClaimText.includes('16 C.F.R. § 465.2'));
});

