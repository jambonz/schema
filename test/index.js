const assert = require('assert');
const {validate, validateVerb, validateApp, validateCommand, normalizeJambones} = require('..');

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

/* ---- agent verb: tightened llm / llmOptions ---- */
console.log('\nagent verb — tightened llm schema');

test('accepts a well-formed agent llm block', () => {
  validateVerb('agent', {
    llm: {
      vendor: 'openai',
      model: 'gpt-4o',
      llmOptions: {
        systemPrompt: 'You are helpful.',
        maxTokens: 1024,
        temperature: 0.7,
        tools: [{name: 'lookup', description: 'x', parameters: {type: 'object'}}],
      },
    },
  }, console);
});

test('accepts split vertex vendor ids', () => {
  validateVerb('agent', {
    llm: {vendor: 'vertex-gemini', model: 'gemini-2.5-flash'},
  }, console);
  validateVerb('agent', {
    llm: {vendor: 'vertex-openai', model: 'meta/llama-4-scout-17b-16e-instruct-maas'},
  }, console);
});

test('accepts azure-openai vendor id', () => {
  // For Azure, `model` is the deployment name (arbitrary user string), not the
  // underlying model id — Azure ignores the wire `model` field because the
  // deployment in the URL determines which model runs.
  validateVerb('agent', {
    llm: {vendor: 'azure-openai', model: 'prod-gpt-4o-mini'},
  }, console);
});

test('accepts groq vendor id', () => {
  validateVerb('agent', {
    llm: {vendor: 'groq', model: 'llama-3.3-70b-versatile'},
  }, console);
});

test('accepts huggingface vendor id', () => {
  // HF Providers takes canonical model ids and optional :provider / :fastest
  // suffixes that pass through to the broker.
  validateVerb('agent', {
    llm: {vendor: 'huggingface', model: 'meta-llama/Llama-3.3-70B-Instruct'},
  }, console);
});

test('rejects unknown vendor', () => {
  assertThrows(() => {
    validateVerb('agent', {llm: {vendor: 'nonesuch', model: 'x'}}, console);
  }, /enum|allowed/i);
});

test('rejects unknown llmOptions field (the original `instructions` typo case)', () => {
  assertThrows(() => {
    validateVerb('agent', {
      llm: {
        vendor: 'anthropic',
        model: 'claude-sonnet-4-5-20250929',
        llmOptions: {instructions: 'bogus'},
      },
    }, console);
  }, /additional properties|additionalProperties|instructions/i);
});

test('rejects unknown top-level llm field', () => {
  assertThrows(() => {
    validateVerb('agent', {
      llm: {
        vendor: 'openai',
        model: 'gpt-4o',
        // typo: `labl` instead of `label`
        labl: 'primary',
      },
    }, console);
  }, /additional properties|additionalProperties|labl/i);
});

test('rejects missing vendor / model', () => {
  assertThrows(() => {
    validateVerb('agent', {llm: {model: 'gpt-4o'}}, console);
  }, /vendor/);
  assertThrows(() => {
    validateVerb('agent', {llm: {vendor: 'openai'}}, console);
  }, /model/);
});

/* ---- Deepgram Flux Multilingual: languageHints ---- */
console.log('\nDeepgram Flux Multilingual: languageHints');

test('accepts languageHints array in deepgramOptions', () => {
  validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {
      vendor: 'deepgram',
      deepgramOptions: {
        model: 'flux-general-multi',
        languageHints: ['en', 'es', 'fr']
      }
    }
  }, console);
});

test('accepts empty languageHints array', () => {
  validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {
      vendor: 'deepgram',
      deepgramOptions: {
        model: 'flux-general-multi',
        languageHints: []
      }
    }
  }, console);
});

test('rejects non-array languageHints', () => {
  assertThrows(() => validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {
      vendor: 'deepgram',
      deepgramOptions: {
        languageHints: 'en'
      }
    }
  }, console));
});

test('rejects non-string items in languageHints', () => {
  assertThrows(() => validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {
      vendor: 'deepgram',
      deepgramOptions: {
        languageHints: [123]
      }
    }
  }, console));
});

/* ---- agent verb: autoLockLanguage and languageConfig ---- */
console.log('\nagent verb — autoLockLanguage and languageConfig');

test('accepts autoLockLanguage boolean', () => {
  validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    autoLockLanguage: true
  }, console);
});

test('accepts languageConfig with TTS overrides', () => {
  validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    autoLockLanguage: true,
    languageConfig: {
      es: {tts: {vendor: 'cartesia', voice: 'spanish-voice'}},
      fr: {tts: {vendor: 'elevenlabs', voice: 'french-voice'}}
    }
  }, console);
});

test('accepts empty languageConfig', () => {
  validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    autoLockLanguage: true,
    languageConfig: {}
  }, console);
});

test('rejects non-boolean autoLockLanguage', () => {
  assertThrows(() => validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    autoLockLanguage: 'yes'
  }, console));
});

test('rejects languageConfig with unknown properties', () => {
  assertThrows(() => validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    languageConfig: {
      es: {tts: {voice: 'x'}, unknownProp: true}
    }
  }, console));
});

/* ---- commands: llm:tool-output ---- */
console.log('\ncommand: llm:tool-output');

test('accepts a well-formed tool-output command', () => {
  validateCommand('llm:tool-output', {
    type: 'command',
    command: 'llm:tool-output',
    tool_call_id: 'toolu_abc123',
    data: {result: 'The weather in Boston is 9.3°C.'},
  }, console);
});

test('accepts alternate data shapes (not just {result})', () => {
  validateCommand('llm:tool-output', {
    type: 'command',
    command: 'llm:tool-output',
    tool_call_id: 'x',
    data: {temperature: 9.3, unit: 'C'},
  }, console);
});

test('rejects missing tool_call_id', () => {
  assertThrows(() => {
    validateCommand('llm:tool-output', {
      type: 'command',
      command: 'llm:tool-output',
      data: {result: 'x'},
    }, console);
  }, /tool_call_id/);
});

test('rejects wrong type / command constants', () => {
  assertThrows(() => {
    validateCommand('llm:tool-output', {
      type: 'something-else',
      command: 'llm:tool-output',
      tool_call_id: 'x',
      data: {},
    }, console);
  }, /type|const|command/i);
});

test('rejects unknown top-level properties', () => {
  assertThrows(() => {
    validateCommand('llm:tool-output', {
      type: 'command',
      command: 'llm:tool-output',
      tool_call_id: 'x',
      data: {},
      extra: 'whatever',
    }, console);
  }, /additional/i);
});

test('rejects unknown command name', () => {
  assertThrows(() => {
    validateCommand('no-such-command', {}, console);
  }, /invalid command/);
});

/* ---- summary ---- */
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
