const test = require('node:test');
const assert = require('node:assert/strict');
const { formatCleanHumanName, deduplicateWords } = require('../modules/reporter/legal_reporter');

test('deduplicateWords: removes consecutive duplicate words', () => {
  assert.deepEqual(deduplicateWords(['John', 'John', 'Doe']), ['John', 'Doe']);
  assert.deepEqual(deduplicateWords(['John', 'Doe', 'Doe']), ['John', 'Doe']);
  assert.deepEqual(deduplicateWords(['Vishnu', 'singh', 'singh']), ['Vishnu', 'singh']);
  assert.deepEqual(deduplicateWords(['John', 'john', 'JOHN']), ['John']);
});

test('deduplicateWords: eliminates repeated multi-word phrases', () => {
  // Phrase repeated twice (length 4 -> 2)
  assert.deepEqual(
    deduplicateWords(['Vishnu', 'singh', 'Vishnu', 'singh']),
    ['Vishnu', 'singh']
  );

  // Phrase repeated twice with proper casing
  assert.deepEqual(
    deduplicateWords(['Nirob', 'Sohel', 'Nirob', 'Sohel']),
    ['Nirob', 'Sohel']
  );

  // Phrase repeated 3 times (length 6 -> 2)
  assert.deepEqual(
    deduplicateWords(['John', 'Doe', 'John', 'Doe', 'John', 'Doe']),
    ['John', 'Doe']
  );

  // 3-word phrase repeated twice (length 6 -> 3)
  assert.deepEqual(
    deduplicateWords(['John', 'Michael', 'Smith', 'John', 'Michael', 'Smith']),
    ['John', 'Michael', 'Smith']
  );
});

test('formatCleanHumanName: resolves duplicated user full names', () => {
  // User's exact reported case
  assert.equal(formatCleanHumanName('Vishnu singh Vishnu singh'), 'Vishnu Singh');
  assert.equal(formatCleanHumanName('Vishnu Singh Vishnu Singh'), 'Vishnu Singh');
  assert.equal(formatCleanHumanName('Vishnu singh \n Vishnu singh'), 'Vishnu Singh');
  assert.equal(formatCleanHumanName('Nirob Sohel Nirob Sohel'), 'Nirob Sohel');
  assert.equal(formatCleanHumanName('John Doe John Doe'), 'John Doe');
  assert.equal(formatCleanHumanName('John John Doe'), 'John Doe');
  assert.equal(formatCleanHumanName('John Doe Doe'), 'John Doe');
});

test('formatCleanHumanName: extracts and capitalizes clean name from emails', () => {
  assert.equal(formatCleanHumanName('vvishnusingh09@gmail.com'), 'Vishnu Singh');
  assert.equal(formatCleanHumanName('nirobsohel272@gmail.com'), 'Nirob Sohel');
  assert.equal(formatCleanHumanName('john.doe@company.org'), 'John Doe');
  assert.equal(formatCleanHumanName('jane_smith_44@yahoo.com'), 'Jane Smith');
});

test('formatCleanHumanName: handles metadata, punctuation and compound words', () => {
  // Parenthesized metadata
  assert.equal(formatCleanHumanName('Vishnu Singh (Owner)'), 'Vishnu Singh');
  assert.equal(formatCleanHumanName('John Doe (Google Account)'), 'John Doe');

  // Unspaced repeated halves
  assert.equal(formatCleanHumanName('VishnuSinghVishnuSingh'), 'Vishnu Singh');

  // Separators and punctuation
  assert.equal(formatCleanHumanName('singh, vishnu'), 'Singh Vishnu');
  assert.equal(formatCleanHumanName('nirob-sohel'), 'Nirob Sohel');
});

test('formatCleanHumanName: safe fallback for empty or invalid input', () => {
  assert.equal(formatCleanHumanName(''), 'Google Business Representative');
  assert.equal(formatCleanHumanName(null), 'Google Business Representative');
  assert.equal(formatCleanHumanName(undefined), 'Google Business Representative');
  assert.equal(formatCleanHumanName('   '), 'Google Business Representative');
  assert.equal(formatCleanHumanName('12345'), 'Google Business Representative');
});
