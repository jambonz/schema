const assert = require('assert');
const {validate, validateVerb, validateApp, normalizeJambones} = require('..');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL: ${name}`);
    console.log(`        ${err.message}`);
  }
}

function assertThrows(fn, pattern) {
  try {
    fn();
    throw new Error('expected an error but none was thrown');
  } catch (err) {
    if (pattern && !pattern.test(err.message)) {
      throw new Error(`expected error matching ${pattern}, got: ${err.message}`);
    }
  }
}

/* ---- normalizeJambones ---- */
console.log('\nnormalizeJambones');

test('accepts {verb: "say", ...} format', () => {
  const result = normalizeJambones(console, [{verb: 'say', text: 'hi'}]);
  assert.deepStrictEqual(result, [{say: {text: 'hi'}}]);
});

test('accepts {say: {...}} format', () => {
  const result = normalizeJambones(console, [{say: {text: 'hi'}}]);
  assert.deepStrictEqual(result, [{say: {text: 'hi'}}]);
});

test('applies verb transforms (stream -> listen)', () => {
  const result = normalizeJambones(console, [{verb: 'stream', url: 'wss://x'}]);
  assert.strictEqual(Object.keys(result[0])[0], 'listen');
});

test('applies verb transforms (openai_s2s -> llm with vendor)', () => {
  const result = normalizeJambones(console, [{verb: 'openai_s2s', model: 'gpt-4o'}]);
  assert.strictEqual(Object.keys(result[0])[0], 'llm');
  assert.strictEqual(result[0].llm.vendor, 'openai');
});

test('rejects non-array input', () => {
  assertThrows(() => normalizeJambones(console, 'not an array'), /must be array/);
});

test('rejects object missing verb property', () => {
  assertThrows(() => normalizeJambones(console, [{foo: 1, bar: 2}]), /missing verb/);
});

/* ---- validateVerb ---- */
console.log('\nvalidateVerb');

test('accepts valid say verb', () => {
  validateVerb('say', {text: 'hello'}, console);
});

test('accepts valid gather with digit input', () => {
  validateVerb('gather', {input: ['digits'], numDigits: 1, actionHook: '/test'}, console);
});

test('accepts valid gather with speech input', () => {
  validateVerb('gather', {input: ['speech'], actionHook: '/test', timeout: 10}, console);
});

test('rejects unknown verb', () => {
  assertThrows(() => validateVerb('bogus', {}, console), /invalid instruction/);
});

test('rejects gather with invalid input values', () => {
  assertThrows(() => validateVerb('gather', {input: ['invalid']}, console));
});

/* ---- recognizer hints ---- */
console.log('\nrecognizer hints');

test('accepts string hints', () => {
  validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'google', language: 'en-US', hints: ['hello', 'world']}
  }, console);
});

test('accepts object hints with phrase and boost', () => {
  validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'google', language: 'fr-FR', hints: [
      {phrase: '11h', boost: 30},
      {phrase: 'midi', boost: 20}
    ]}
  }, console);
});

test('accepts object hints with phrase only', () => {
  validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'google', hints: [{phrase: 'hello'}]}
  }, console);
});

test('accepts mixed string and object hints', () => {
  validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'google', hints: ['hello', {phrase: 'world', boost: 10}]}
  }, console);
});

test('rejects numeric hints', () => {
  assertThrows(() => validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'google', hints: [123]}
  }, console));
});

test('rejects object hints missing phrase', () => {
  assertThrows(() => validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'google', hints: [{boost: 30}]}
  }, console));
});

/* ---- error messages ---- */
console.log('\nerror messages');

test('error message includes full instance path', () => {
  try {
    validateVerb('gather', {
      input: ['speech'],
      actionHook: '/test',
      recognizer: {vendor: 'google', hints: [123]}
    }, console);
    throw new Error('expected validation error');
  } catch (err) {
    assert.ok(err.message.includes('/recognizer/hints/0'),
      `expected path '/recognizer/hints/0' in: ${err.message}`);
  }
});

/* ---- validate (full app) ---- */
console.log('\nvalidate (full app)');

test('validates a complete app payload', () => {
  validate(console, [
    {verb: 'answer'},
    {verb: 'say', text: 'hello'},
    {verb: 'hangup'}
  ]);
});

test('validates app with gather containing object hints', () => {
  validate(console, [
    {verb: 'answer'},
    {verb: 'gather', input: ['speech'], actionHook: '/test',
      recognizer: {vendor: 'google', hints: [{phrase: 'yes', boost: 20}]}},
    {verb: 'hangup'}
  ]);
});

/* ---- summary ---- */
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
