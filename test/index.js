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

/* ---- recognizer googleOptions ---- */
console.log('\nrecognizer googleOptions');

test('accepts googleOptions with parentPath', () => {
  validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {
      vendor: 'google',
      googleOptions: {parentPath: 'projects/my-proj/locations/global'}
    }
  }, console);
});

test('accepts googleOptions with parentPath alongside recognizerId', () => {
  validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {
      vendor: 'google',
      googleOptions: {
        serviceVersion: 'v2',
        recognizerId: 'my-recognizer',
        parentPath: 'projects/my-proj/locations/us-central1'
      }
    }
  }, console);
});

test('rejects non-string parentPath', () => {
  assertThrows(() => validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'google', googleOptions: {parentPath: 123}}
  }, console));
});

test('rejects unknown property in googleOptions', () => {
  assertThrows(() => validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'google', googleOptions: {bogusField: 'x'}}
  }, console));
});

/* ---- recognizer openaiOptions ---- */
console.log('\nrecognizer openaiOptions');

test('accepts openaiOptions with local VAD knobs', () => {
  validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {
      vendor: 'openai',
      openaiOptions: {
        model: 'gpt-realtime-whisper',
        vadMode: 2,
        vadSilenceMs: 500,
        vadVoiceMs: 250
      }
    }
  }, console);
});

test('accepts vadMode=0 (minimum)', () => {
  validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'openai', openaiOptions: {vadMode: 0}}
  }, console);
});

test('accepts vadMode=3 (maximum)', () => {
  validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'openai', openaiOptions: {vadMode: 3}}
  }, console);
});

test('rejects vadMode out of range (4)', () => {
  assertThrows(() => validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'openai', openaiOptions: {vadMode: 4}}
  }, console));
});

test('rejects vadMode below range (-1)', () => {
  assertThrows(() => validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'openai', openaiOptions: {vadMode: -1}}
  }, console));
});

test('rejects non-integer vadSilenceMs', () => {
  assertThrows(() => validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'openai', openaiOptions: {vadSilenceMs: 'soon'}}
  }, console));
});

test('rejects vadVoiceMs=0 (below minimum)', () => {
  assertThrows(() => validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'openai', openaiOptions: {vadVoiceMs: 0}}
  }, console));
});

test('rejects unknown property in openaiOptions', () => {
  assertThrows(() => validateVerb('gather', {
    input: ['speech'],
    actionHook: '/test',
    recognizer: {vendor: 'openai', openaiOptions: {bogusField: 'x'}}
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

test('accepts each valid reasoningEffort value', () => {
  for (const reasoningEffort of ['minimal', 'low', 'medium', 'high']) {
    validateVerb('agent', {
      llm: {
        vendor: 'google',
        model: 'gemini-3.5-flash',
        llmOptions: {reasoningEffort},
      },
    }, console);
  }
});

test('accepts reasoningEffort alongside other llmOptions', () => {
  validateVerb('agent', {
    llm: {
      vendor: 'openai',
      model: 'gpt-5',
      llmOptions: {
        systemPrompt: 'You are helpful.',
        maxTokens: 512,
        temperature: 0.5,
        reasoningEffort: 'minimal',
      },
    },
  }, console);
});

test('rejects invalid reasoningEffort value', () => {
  assertThrows(() => {
    validateVerb('agent', {
      llm: {
        vendor: 'google',
        model: 'gemini-3.5-flash',
        llmOptions: {reasoningEffort: 'extreme'},
      },
    }, console);
  }, /enum|allowed|reasoningEffort/i);
});

test('rejects reasoningEffort of wrong type', () => {
  assertThrows(() => {
    validateVerb('agent', {
      llm: {
        vendor: 'google',
        model: 'gemini-3.5-flash',
        llmOptions: {reasoningEffort: 2},
      },
    }, console);
  }, /type|string|reasoningEffort/i);
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

test('accepts baseten vendor id', () => {
  // Baseten is an OpenAI-compatible alias (Model APIs). Model ids are
  // HuggingFace-style org/name strings forwarded verbatim.
  validateVerb('agent', {
    llm: {vendor: 'baseten', model: 'zai-org/GLM-4.7'},
  }, console);
  validateVerb('agent', {
    llm: {vendor: 'baseten', model: 'deepseek-ai/DeepSeek-V3.1'},
  }, console);
});

test('accepts moonshot vendor id', () => {
  // Moonshot (Kimi) is OpenAI-compatible; reached via a baseURL override.
  validateVerb('agent', {
    llm: {vendor: 'moonshot', model: 'kimi-k2-0711-preview'},
  }, console);
});

test('accepts zai vendor id', () => {
  // Z.ai (GLM) is OpenAI-compatible; reached via a baseURL override.
  validateVerb('agent', {
    llm: {vendor: 'zai', model: 'glm-4.6'},
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

test('accepts autoLockLanguage boolean true', () => {
  validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    autoLockLanguage: true
  }, console);
});

test('accepts autoLockLanguage boolean false', () => {
  validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    autoLockLanguage: false
  }, console);
});

test('accepts autoLockLanguage string "always"', () => {
  validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    autoLockLanguage: 'always'
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

test('rejects invalid autoLockLanguage string', () => {
  assertThrows(() => validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    autoLockLanguage: 'yes'
  }, console));
});

test('rejects invalid autoLockLanguage type', () => {
  assertThrows(() => validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    autoLockLanguage: 123
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

/* ---- agent verb: toolFiller ---- */
console.log('\nagent verb — toolFiller');

test('accepts toolFiller with type=audio and url', () => {
  validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    toolFiller: {
      type: 'audio',
      startDelaySecs: 1.5,
      url: 'https://example.com/thinking-sounds.mp3'
    }
  }, console);
});

test('accepts toolFiller with type=backchannel and style', () => {
  validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    toolFiller: {
      type: 'backchannel',
      startDelaySecs: 2,
      style: 'casual and friendly',
      escalationSecs: 8
    }
  }, console);
});

test('accepts toolFiller with type=backchannel minimal config', () => {
  validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    toolFiller: {
      type: 'backchannel'
    }
  }, console);
});

test('accepts toolFiller: false to disable', () => {
  validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    toolFiller: false
  }, console);
});

test('rejects toolFiller type=audio without url', () => {
  assertThrows(() => validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    toolFiller: {
      type: 'audio',
      startDelaySecs: 2
    }
  }, console), /url|required/i);
});

test('rejects toolFiller with invalid type', () => {
  assertThrows(() => validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    toolFiller: {
      type: 'invalid'
    }
  }, console), /enum|type/i);
});

test('rejects toolFiller: true (only false or config object allowed)', () => {
  assertThrows(() => validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    toolFiller: true
  }, console));
});

test('accepts per-tool filler override in llmOptions.tools', () => {
  validateVerb('agent', {
    llm: {
      vendor: 'openai',
      model: 'gpt-4o',
      llmOptions: {
        tools: [
          {
            name: 'fast_lookup',
            description: 'Quick database lookup',
            parameters: {type: 'object'},
            filler: false
          },
          {
            name: 'external_api',
            description: 'Slow external service',
            parameters: {type: 'object'},
            filler: {
              type: 'backchannel',
              startDelaySecs: 3,
              style: 'apologetic',
              escalationSecs: 15
            }
          }
        ]
      }
    },
    toolFiller: {
      type: 'backchannel',
      startDelaySecs: 2,
      style: 'professional'
    }
  }, console);
});

/* ---- agent verb: bargeIn strategy ---- */
console.log('\nagent verb — bargeIn strategy');

test('accepts bargeIn with interruptPrediction strategy', () => {
  validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    bargeIn: {enable: true, strategy: 'interruptPrediction', vendor: 'krisp', threshold: 0.6}
  }, console);
});

test('accepts bargeIn with default (vad) strategy', () => {
  validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    bargeIn: {enable: true, strategy: 'vad', minSpeechDuration: 0.3}
  }, console);
});

test('rejects bargeIn with unknown strategy', () => {
  assertThrows(() => validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    bargeIn: {strategy: 'asr'}
  }, console));
});

test('rejects bargeIn threshold above 1', () => {
  assertThrows(() => validateVerb('agent', {
    llm: {vendor: 'openai', model: 'gpt-4o'},
    bargeIn: {strategy: 'interruptPrediction', threshold: 1.5}
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

/* ================================================================
 * TRANSFER + HANDOFF — integrated from the former transfer.test.js
 *
 * The 2 stale "unknown-top-level-key-fails" tests have been REMOVED.
 * transferOptions root no longer has additionalProperties:false — it is
 * composable via allOf. The inner confirm/disposition sub-objects still
 * carry additionalProperties:false; those tests are kept intact.
 *
 * NEW: verb-level coverage via the public validateVerb API, plus
 * handoff coverage via agent + openai_s2s verbs.
 *
 * AJV bootstrap below mirrors lib/validator.js getAjv() so that
 * component and callback schemas (not reachable via validateVerb) can
 * be tested in isolation.
 * ================================================================ */

{
  const Ajv = require('ajv');
  const {readFileSync, readdirSync} = require('fs');
  const {resolve, join} = require('path');

  const schemaDir = resolve(__dirname, '..');

  function loadSchema(relativePath) {
    return JSON.parse(readFileSync(join(schemaDir, relativePath), 'utf-8'));
  }
/* ---- room (synonym for conference) ---- */
console.log('\nroom verb (conference synonym)');

test('room validates with a name (same shape as conference)', () => {
  validateVerb('room', {name: 'r1'}, console);
});

test('room requires name (inherited from conference)', () => {
  assertThrows(() => validateVerb('room', {}, console));
});

test('room accepts the full conference shape', () => {
  validateVerb('room', {
    name: 'r1', beep: true, startConferenceOnEnter: true, endConferenceOnExit: false,
    statusHook: '/room-events', statusEvents: ['say-start', 'say-done', 'play-start', 'play-done']
  }, console);
});

test('an app mixing room and conference verbs validates (exactly one oneOf match each)', () => {
  const result = validateApp([
    {verb: 'answer'},
    {verb: 'room', name: 'r1'},
    {verb: 'conference', name: 'c1'}
  ], console);
  assert.strictEqual(result.valid, true, JSON.stringify(result.errors));
});

  function discoverSchemas(subdir) {
    try {
      return readdirSync(join(schemaDir, subdir))
        .filter((f) => f.endsWith('.schema.json'))
        .map((f) => f.replace('.schema.json', ''));
    } catch {
      return [];
    }
  }

  const ajv = new Ajv({
    allErrors: false,
    strict: false,
    validateSchema: false,
    logger: false,
  });

  for (const name of discoverSchemas('components')) {
    ajv.addSchema(loadSchema(`components/${name}.schema.json`));
  }
  for (const name of discoverSchemas('callbacks')) {
    ajv.addSchema(loadSchema(`callbacks/${name}.schema.json`));
  }
  for (const name of discoverSchemas('verbs')) {
    ajv.addSchema(loadSchema(`verbs/${name}.schema.json`));
  }
  for (const name of discoverSchemas('commands')) {
    ajv.addSchema(loadSchema(`commands/${name}.schema.json`));
  }

  /**
   * Assert that a compiled AJV validate function rejects data.
   * Checks: (a) validate returns false, (b) at least one error exists,
   * (c) if errorPattern is given, at least one error message matches it.
   */
  function assertInvalid(validate, data, errorPattern) {
    const valid = validate(data);
    assert.strictEqual(valid, false,
      `expected validation to fail but it passed for: ${JSON.stringify(data)}`);
    const errors = validate.errors;
    assert.ok(errors && errors.length > 0,
      'expected at least one AJV error but validate.errors was empty/null');
    if (errorPattern) {
      const matched = errors.some((e) => errorPattern.test(e.message || ''));
      assert.ok(matched,
        `expected an error matching ${errorPattern} but got: ${errors.map((e) => e.message).join('; ')}`);
    }
  }

  /**
   * Assert that a compiled AJV validate function accepts data.
   * Checks: validate returns EXACTLY true (not just truthy).
   */
  function assertValid(validate, data) {
    const valid = validate(data);
    assert.strictEqual(valid, true,
      `expected validation to pass but it failed for: ${JSON.stringify(data)}\n` +
      `  errors: ${JSON.stringify(validate.errors)}`);
  }

  /* ---- AJV bootstrap ---- */
  console.log('\nTransfer/Handoff — AJV bootstrap: schema discovery and $id resolution');

  test('no throw during addSchema for all discovered *.schema.json files', () => {
    const fn = ajv.getSchema('https://jambonz.org/schema/components/transferOptions');
    assert.strictEqual(typeof fn, 'function',
      'expected getSchema to return a compiled validate function, got: ' + typeof fn);
  });

  test('components/transferOptions $id resolves to a compiled validator', () => {
    const fn = ajv.getSchema('https://jambonz.org/schema/components/transferOptions');
    assert.strictEqual(typeof fn, 'function',
      'getSchema("https://jambonz.org/schema/components/transferOptions") must return a function');
  });

  test('callbacks/transfer $id resolves to a compiled validator', () => {
    const fn = ajv.getSchema('https://jambonz.org/schema/callbacks/transfer');
    assert.strictEqual(typeof fn, 'function',
      'getSchema("https://jambonz.org/schema/callbacks/transfer") must return a function');
  });

  /* ---- components/transferOptions: valid objects ---- */
  console.log('\ncomponents/transferOptions — valid objects');

  const validateTransferOptions = ajv.compile({'$ref': 'https://jambonz.org/schema/components/transferOptions'});

  const VALID_TARGET = [{type: 'phone', number: '+15085551212'}];

  test('transferOptions: minimal blind transfer passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind',
      target: [{type: 'phone', number: '+15085551212'}],
    });
  });

  test('transferOptions: blind with blindMethod=refer passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind',
      blindMethod: 'refer',
      target: [{type: 'phone', number: '+15085551212'}],
    });
  });

  test('transferOptions: blind with blindMethod=dial passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind',
      blindMethod: 'dial',
      target: [{type: 'phone', number: '+15085551212'}],
    });
  });

  test('transferOptions: warm transfer with callerPresent + confirm + disposition passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'warm',
      callerPresent: true,
      target: [{type: 'phone', number: '+15085551212'}],
      confirm: {prompt: 'Press 1 to accept', digit: '1'},
      disposition: {onNoAnswer: 'return'},
    });
  });

  test('transferOptions: warm callerPresent=false passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'warm',
      callerPresent: false,
      target: [{type: 'phone', number: '+15085551212'}],
    });
  });

  test('transferOptions: sip target passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind',
      target: [{type: 'sip', sipUri: 'sip:agent@pbx.example.com'}],
    });
  });

  test('transferOptions: multiple targets pass', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind',
      target: [
        {type: 'phone', number: '+15085551212'},
        {type: 'sip', sipUri: 'sip:backup@pbx.example.com'},
      ],
    });
  });

  test('transferOptions: callerId string passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind',
      target: [{type: 'phone', number: '+15085551212'}],
      callerId: '+14155559999',
    });
  });

  test('transferOptions: timeout number passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind',
      target: [{type: 'phone', number: '+15085551212'}],
      timeout: 60,
    });
  });

  test('transferOptions: timeout=0 (boundary) passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind',
      target: [{type: 'phone', number: '+15085551212'}],
      timeout: 0,
    });
  });

  test('transferOptions: all disposition=return passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind',
      target: [{type: 'phone', number: '+15085551212'}],
      disposition: {onNoAnswer: 'return', onBusy: 'return', onDecline: 'return', onFailure: 'return'},
    });
  });

  test('transferOptions: all disposition=voicemail WITH voicemailUrl passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind',
      target: [{type: 'phone', number: '+15085551212'}],
      disposition: {
        onNoAnswer: 'voicemail', onBusy: 'voicemail', onDecline: 'voicemail', onFailure: 'voicemail',
        voicemailUrl: 'https://vm.example.com/leave-message',
      },
    });
  });

  /* Documents the composable design: root additionalProperties removed so that
   * allOf composition by transfer verb and handoff component works cleanly.
   * An unknown top-level key on transferOptions in isolation now PASSES. */
  test('transferOptions: unknown top-level key now PASSES (root additionalProperties removed for composability)', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind',
      target: [{type: 'phone', number: '+1'}],
      foo: 1,
    });
  });

  test('transferOptions: unknown top-level key "transferType" now PASSES (root additionalProperties removed)', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind',
      target: [{type: 'phone', number: '+1'}],
      transferType: 'cold',
    });
  });

  /* ---- components/transferOptions: required fields ---- */
  console.log('\ncomponents/transferOptions — required fields');

  test('transferOptions: missing mode fails', () => {
    assertInvalid(validateTransferOptions,
      {target: [{type: 'phone', number: '+15085551212'}]},
      /required/i);
  });

  test('transferOptions: missing target fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind'},
      /required/i);
  });

  test('transferOptions: both mode and target missing fails', () => {
    assertInvalid(validateTransferOptions, {}, /required/i);
  });

  /* ---- components/transferOptions: enum violations ---- */
  console.log('\ncomponents/transferOptions — enum violations');

  test('transferOptions: mode=transfer (invalid enum) fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'transfer', target: [{type: 'phone', number: '+1'}]},
      /allowed values|enum/i);
  });

  test('transferOptions: mode=null fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: null, target: [{type: 'phone', number: '+1'}]},
      /string|type|enum/i);
  });

  test('transferOptions: blindMethod=fax (invalid enum) fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: [{type: 'phone', number: '+1'}], blindMethod: 'fax'},
      /allowed values|enum/i);
  });

  test('transferOptions: disposition.onNoAnswer=forward fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: [{type: 'phone', number: '+1'}], disposition: {onNoAnswer: 'forward'}},
      /allowed values|enum/i);
  });

  test('transferOptions: disposition.onBusy=bounce fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: [{type: 'phone', number: '+1'}], disposition: {onBusy: 'bounce'}},
      /allowed values|enum/i);
  });

  test('transferOptions: disposition.onDecline=retry fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: [{type: 'phone', number: '+1'}], disposition: {onDecline: 'retry'}},
      /allowed values|enum/i);
  });

  test('transferOptions: disposition.onFailure=ignore fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: [{type: 'phone', number: '+1'}], disposition: {onFailure: 'ignore'}},
      /allowed values|enum/i);
  });

  /* ---- components/transferOptions: type violations ---- */
  console.log('\ncomponents/transferOptions — type violations');

  test('transferOptions: timeout as string fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: [{type: 'phone', number: '+1'}], timeout: '30'},
      /number|type/i);
  });

  test('transferOptions: timeout as boolean fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: [{type: 'phone', number: '+1'}], timeout: true},
      /number|type/i);
  });

  test('transferOptions: callerPresent as string fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'warm', target: [{type: 'phone', number: '+1'}], callerPresent: 'yes'},
      /boolean|type/i);
  });

  test('transferOptions: callerId as number fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: [{type: 'phone', number: '+1'}], callerId: 15085551212},
      /string|type/i);
  });

  /* ---- components/transferOptions: inner additionalProperties:false still enforced ---- */
  console.log('\ncomponents/transferOptions — inner additionalProperties:false (confirm + disposition)');

  test('transferOptions: disposition unknown key fails (inner additionalProperties:false)', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: [{type: 'phone', number: '+1'}], disposition: {onNoAnswer: 'return', badKey: 'x'}},
      /additional properties/i);
  });

  /* ---- components/transferOptions: target array ---- */
  console.log('\ncomponents/transferOptions — target array constraints');

  test('transferOptions: empty target array fails (minItems:1)', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: []},
      /fewer than 1|minItems/i);
  });

  test('transferOptions: target as string fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: 'phone:+15085551212'},
      /array|type/i);
  });

  test('transferOptions: target as null fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: null},
      /array|type/i);
  });

  /* ---- components/transferOptions: confirm sub-object ---- */
  console.log('\ncomponents/transferOptions — confirm sub-object');

  test('transferOptions: confirm missing digit fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'warm', target: [{type: 'phone', number: '+1'}], confirm: {prompt: 'Press 1'}},
      /required/i);
  });

  test('transferOptions: confirm missing prompt fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'warm', target: [{type: 'phone', number: '+1'}], confirm: {digit: '1'}},
      /required/i);
  });

  test('transferOptions: confirm unknown key fails (inner additionalProperties:false)', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'warm', target: [{type: 'phone', number: '+1'}], confirm: {prompt: 'p', digit: '1', extra: 'x'}},
      /additional properties/i);
  });

  test('transferOptions: confirm with prompt+digit passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'warm',
      target: [{type: 'phone', number: '+15085551212'}],
      confirm: {prompt: 'Press 1 to accept this call', digit: '1'},
    });
  });

  /* ---- components/transferOptions: conditional voicemailUrl ---- */
  console.log('\ncomponents/transferOptions — conditional voicemailUrl');

  test('transferOptions: onNoAnswer=voicemail WITHOUT voicemailUrl fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: VALID_TARGET, disposition: {onNoAnswer: 'voicemail'}},
      /required/i);
  });

  test('transferOptions: onNoAnswer=voicemail WITH voicemailUrl passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind', target: VALID_TARGET,
      disposition: {onNoAnswer: 'voicemail', voicemailUrl: 'https://x/vm'},
    });
  });

  test('transferOptions: onBusy=voicemail WITHOUT voicemailUrl fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: VALID_TARGET, disposition: {onBusy: 'voicemail'}},
      /required/i);
  });

  test('transferOptions: onBusy=voicemail WITH voicemailUrl passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind', target: VALID_TARGET,
      disposition: {onBusy: 'voicemail', voicemailUrl: 'https://x/vm'},
    });
  });

  test('transferOptions: onDecline=voicemail WITHOUT voicemailUrl fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: VALID_TARGET, disposition: {onDecline: 'voicemail'}},
      /required/i);
  });

  test('transferOptions: onDecline=voicemail WITH voicemailUrl passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind', target: VALID_TARGET,
      disposition: {onDecline: 'voicemail', voicemailUrl: 'https://x/vm'},
    });
  });

  test('transferOptions: onFailure=voicemail WITHOUT voicemailUrl fails', () => {
    assertInvalid(validateTransferOptions,
      {mode: 'blind', target: VALID_TARGET, disposition: {onFailure: 'voicemail'}},
      /required/i);
  });

  test('transferOptions: onFailure=voicemail WITH voicemailUrl passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind', target: VALID_TARGET,
      disposition: {onFailure: 'voicemail', voicemailUrl: 'https://x/vm'},
    });
  });

  test('transferOptions: all four=return WITHOUT voicemailUrl passes', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind', target: VALID_TARGET,
      disposition: {onNoAnswer: 'return', onBusy: 'return', onDecline: 'return', onFailure: 'return'},
    });
  });

  test('transferOptions: voicemailUrl present but no outcome=voicemail passes (url is additive)', () => {
    assertValid(validateTransferOptions, {
      mode: 'blind', target: VALID_TARGET,
      disposition: {onNoAnswer: 'hangup', voicemailUrl: 'https://x/vm'},
    });
  });

  /* ================================================================
   * verb transfer — via public validateVerb
   * ================================================================ */
  console.log('\nverb transfer — via public validateVerb');

  test('transfer verb: minimal blind passes', () => {
    validateVerb('transfer', {
      mode: 'blind',
      target: [{type: 'phone', number: '+15085551212'}],
    }, console);
  });

  test('transfer verb: warm with callerPresent + brief passes', () => {
    validateVerb('transfer', {
      mode: 'warm',
      callerPresent: true,
      target: [{type: 'phone', number: '+15085551212'}],
      brief: {text: 'Caller is Jane, order 4471'},
    }, console);
  });

  test('transfer verb: explicit verb property in data still passes', () => {
    validateVerb('transfer', {
      verb: 'transfer',
      mode: 'blind',
      target: [{type: 'phone', number: '+15085551212'}],
    }, console);
  });

  test('transfer verb: missing target THROWS', () => {
    assertThrows(
      () => validateVerb('transfer', {mode: 'blind'}, console),
      /target|required/i
    );
  });

  test('transfer verb: missing mode THROWS', () => {
    assertThrows(
      () => validateVerb('transfer', {target: [{type: 'phone', number: '+15085551212'}]}, console),
      /mode|required/i
    );
  });

  test('transfer verb: bad mode enum THROWS', () => {
    assertThrows(
      () => validateVerb('transfer', {mode: 'invalid', target: [{type: 'phone', number: '+15085551212'}]}, console),
      /enum|allowed/i
    );
  });

  test('transfer verb: brief missing text THROWS (required)', () => {
    assertThrows(
      () => validateVerb('transfer', {mode: 'warm', target: VALID_TARGET, brief: {}}, console),
      /text|required/i
    );
  });

  test('transfer verb: brief extra key THROWS (brief.additionalProperties:false)', () => {
    assertThrows(
      () => validateVerb('transfer', {
        mode: 'warm', target: VALID_TARGET, brief: {text: 'x', extra: 1},
      }, console),
      /additional properties|additionalProperties/i
    );
  });

  test('transfer verb: disposition.onBusy=voicemail without voicemailUrl THROWS', () => {
    assertThrows(
      () => validateVerb('transfer', {
        mode: 'blind', target: VALID_TARGET,
        disposition: {onBusy: 'voicemail'},
      }, console),
      /voicemailUrl|required/i
    );
  });

  test('transfer verb: disposition.onBusy=voicemail WITH voicemailUrl passes', () => {
    validateVerb('transfer', {
      mode: 'blind', target: VALID_TARGET,
      disposition: {onBusy: 'voicemail', voicemailUrl: 'https://vm.example.com/leave'},
    }, console);
  });

  test('transfer verb: empty target array THROWS', () => {
    assertThrows(
      () => validateVerb('transfer', {mode: 'blind', target: []}, console),
      /minItems|fewer than 1/i
    );
  });

  test('transfer verb: id string field passes', () => {
    validateVerb('transfer', {
      id: 'xfr-001',
      mode: 'blind',
      target: [{type: 'phone', number: '+15085551212'}],
    }, console);
  });

  /* ================================================================
   * agent verb handoff — via public validateVerb
   * ================================================================ */
  console.log('\nagent verb — handoff property');

  test('agent: handoff warm transfer passes', () => {
    validateVerb('agent', {
      llm: {vendor: 'openai', model: 'gpt-4o'},
      handoff: {mode: 'warm', target: [{type: 'phone', number: '+15085551212'}]},
    }, console);
  });

  test('agent: handoff blind transfer passes', () => {
    validateVerb('agent', {
      llm: {vendor: 'openai', model: 'gpt-4o'},
      handoff: {mode: 'blind', target: [{type: 'phone', number: '+15085551212'}]},
    }, console);
  });

  test('agent: handoff brief=auto passes', () => {
    validateVerb('agent', {
      llm: {vendor: 'openai', model: 'gpt-4o'},
      handoff: {mode: 'blind', target: VALID_TARGET, brief: 'auto'},
    }, console);
  });

  test('agent: handoff brief=none passes', () => {
    validateVerb('agent', {
      llm: {vendor: 'openai', model: 'gpt-4o'},
      handoff: {mode: 'blind', target: VALID_TARGET, brief: 'none'},
    }, console);
  });

  test('agent: handoff brief={template:...} passes', () => {
    validateVerb('agent', {
      llm: {vendor: 'openai', model: 'gpt-4o'},
      handoff: {mode: 'blind', target: VALID_TARGET, brief: {template: 'Summarize the issue'}},
    }, console);
  });

  test('agent: handoff brief=sometimes THROWS (not in enum)', () => {
    assertThrows(
      () => validateVerb('agent', {
        llm: {vendor: 'openai', model: 'gpt-4o'},
        handoff: {mode: 'blind', target: VALID_TARGET, brief: 'sometimes'},
      }, console),
      /enum|allowed|brief/i
    );
  });

  test('agent: handoff brief={template:1} THROWS (template must be string)', () => {
    assertThrows(
      () => validateVerb('agent', {
        llm: {vendor: 'openai', model: 'gpt-4o'},
        handoff: {mode: 'blind', target: VALID_TARGET, brief: {template: 1}},
      }, console),
      /string|type/i
    );
  });

  test('agent: handoff brief={notTemplate:"x"} THROWS (additionalProperties:false on brief object)', () => {
    assertThrows(
      () => validateVerb('agent', {
        llm: {vendor: 'openai', model: 'gpt-4o'},
        handoff: {mode: 'blind', target: VALID_TARGET, brief: {notTemplate: 'x'}},
      }, console),
      /additional properties|additionalProperties|template|required/i
    );
  });

  test('agent: handoff with toolName + toolDescription strings passes', () => {
    validateVerb('agent', {
      llm: {vendor: 'openai', model: 'gpt-4o'},
      handoff: {
        mode: 'warm',
        target: VALID_TARGET,
        toolName: 'escalate_to_human',
        toolDescription: 'Transfers the call to a human agent',
      },
    }, console);
  });

  test('agent: handoff missing target THROWS', () => {
    assertThrows(
      () => validateVerb('agent', {
        llm: {vendor: 'openai', model: 'gpt-4o'},
        handoff: {mode: 'warm'},
      }, console),
      /target|required/i
    );
  });

  test('agent: handoff missing mode THROWS', () => {
    assertThrows(
      () => validateVerb('agent', {
        llm: {vendor: 'openai', model: 'gpt-4o'},
        handoff: {target: VALID_TARGET},
      }, console),
      /mode|required/i
    );
  });

  /* ----------------------------------------------------------------
   * agent verb hangup — built-in hangup tool config
   * -------------------------------------------------------------- */
  console.log('\nagent verb — hangup property');

  test('agent: empty hangup object passes', () => {
    validateVerb('agent', {
      llm: {vendor: 'openai', model: 'gpt-4o'},
      hangup: {},
    }, console);
  });

  test('agent: hangup with reason default passes', () => {
    validateVerb('agent', {
      llm: {vendor: 'openai', model: 'gpt-4o'},
      hangup: {reason: 'agent ended the call'},
    }, console);
  });

  test('agent: hangup with unknown property THROWS (additionalProperties:false)', () => {
    assertThrows(
      () => validateVerb('agent', {
        llm: {vendor: 'openai', model: 'gpt-4o'},
        hangup: {toolName: 'end_call'},
      }, console),
      /additional|properties|toolName/i
    );
  });

  test('agent: hangup with non-string reason THROWS', () => {
    assertThrows(
      () => validateVerb('agent', {
        llm: {vendor: 'openai', model: 'gpt-4o'},
        hangup: {reason: 1},
      }, console),
      /string|reason/i
    );
  });

  test('agent: hangup as boolean THROWS (must be object)', () => {
    assertThrows(
      () => validateVerb('agent', {
        llm: {vendor: 'openai', model: 'gpt-4o'},
        hangup: true,
      }, console),
      /object|type/i
    );
  });

  /* ================================================================
   * openai_s2s + llm verbs — handoff propagated via llm-base $ref
   *
   * validateVerb looks up the schema by the exact verb name passed —
   * it does NOT normalize aliases. The openai_s2s schema extends
   * llm-base which declares `handoff` via $ref handoff. The llm verb
   * schema also extends llm-base.
   *
   * Note: openai_s2s requires `llmOptions` to be present.
   * ================================================================ */
  console.log('\nopenai_s2s + llm verbs — handoff propagated via llm-base');

  test('openai_s2s: handoff warm transfer passes (llm-base propagation)', () => {
    validateVerb('openai_s2s', {
      model: 'gpt-4o-realtime',
      llmOptions: {messages: [{role: 'system', content: 'You are helpful.'}]},
      handoff: {mode: 'warm', target: [{type: 'phone', number: '+15085551212'}]},
    }, console);
  });

  test('openai_s2s: handoff blind transfer passes', () => {
    validateVerb('openai_s2s', {
      model: 'gpt-4o-realtime',
      llmOptions: {},
      handoff: {mode: 'blind', target: VALID_TARGET},
    }, console);
  });

  test('openai_s2s: handoff brief=auto passes', () => {
    validateVerb('openai_s2s', {
      model: 'gpt-4o-realtime',
      llmOptions: {},
      handoff: {mode: 'blind', target: VALID_TARGET, brief: 'auto'},
    }, console);
  });

  test('llm verb: handoff warm transfer passes (llm-base propagation)', () => {
    validateVerb('llm', {
      vendor: 'openai',
      llmOptions: {},
      handoff: {mode: 'warm', target: VALID_TARGET},
    }, console);
  });

  test('llm verb: handoff blind transfer passes', () => {
    validateVerb('llm', {
      vendor: 'openai',
      llmOptions: {},
      handoff: {mode: 'blind', target: VALID_TARGET},
    }, console);
  });

  test('llm verb: handoff brief={template:...} passes', () => {
    validateVerb('llm', {
      vendor: 'openai',
      llmOptions: {},
      handoff: {mode: 'blind', target: VALID_TARGET, brief: {template: 'Summarize the caller issue.'}},
    }, console);
  });

  test('llm verb: empty hangup object passes (llm-base propagation)', () => {
    validateVerb('llm', {
      vendor: 'openai',
      llmOptions: {},
      hangup: {},
    }, console);
  });

  test('llm verb: hangup with reason default passes', () => {
    validateVerb('llm', {
      vendor: 'openai',
      llmOptions: {},
      hangup: {reason: 'agent ended the call'},
    }, console);
  });

  test('llm verb: hangup with unknown property THROWS', () => {
    assertThrows(() => validateVerb('llm', {
      vendor: 'openai',
      llmOptions: {},
      hangup: {bogus: true},
    }, console), /additional|properties|bogus/i);
  });

  /* ================================================================
   * llm-base — per-response watchdog options (feature-server #120)
   * ================================================================ */
  console.log('\nllm verb — response watchdog options');

  test('llm verb: responseTimeoutMs + cancel flags pass', () => {
    validateVerb('llm', {
      vendor: 'openai',
      llmOptions: {},
      responseTimeoutMs: 5000,
      cancelOnResponseTimeout: true,
      cancelOnBargeIn: true,
    }, console);
  });

  test('llm verb: responseTimeoutMs as a string fails', () => {
    assertThrows(() => validateVerb('llm', {
      vendor: 'openai',
      llmOptions: {},
      responseTimeoutMs: '5000',
    }, console));
  });

  test('llm verb: responseTimeoutMs < 1 fails', () => {
    assertThrows(() => validateVerb('llm', {
      vendor: 'openai',
      llmOptions: {},
      responseTimeoutMs: 0,
    }, console));
  });

  test('llm verb: cancelOnBargeIn as a non-boolean fails', () => {
    assertThrows(() => validateVerb('llm', {
      vendor: 'openai',
      llmOptions: {},
      cancelOnBargeIn: 'yes',
    }, console));
  });

  /* ================================================================
   * callbacks/transfer — valid and invalid payloads
   * ================================================================ */
  console.log('\ncallbacks/transfer — valid payloads');

  const validateTransferCallback = ajv.compile({'$ref': 'https://jambonz.org/schema/callbacks/transfer'});

  test('transfer callback: bridged + completed payload passes', () => {
    assertValid(validateTransferCallback, {
      call_sid: 'cs-abc123',
      transfer_result: 'bridged',
      transfer_reason: 'completed',
      dial_call_sid: 'cs-dest456',
      sip_status: 200,
    });
  });

  test('transfer callback: returned + no-answer payload passes', () => {
    assertValid(validateTransferCallback, {
      call_sid: 'cs-abc123',
      transfer_result: 'returned',
      transfer_reason: 'no-answer',
      sip_status: 408,
    });
  });

  test('transfer callback: voicemail + no-answer payload passes', () => {
    assertValid(validateTransferCallback, {
      call_sid: 'cs-abc123',
      transfer_result: 'voicemail',
      transfer_reason: 'no-answer',
    });
  });

  test('transfer callback: failed + error payload passes', () => {
    assertValid(validateTransferCallback, {
      call_sid: 'cs-abc123',
      transfer_result: 'failed',
      transfer_reason: 'error',
      sip_status: 500,
    });
  });

  test('transfer callback: payload with base fields (from+to+call_id) passes', () => {
    assertValid(validateTransferCallback, {
      call_sid: 'cs-abc123',
      from: '+14155551234',
      to: '+15085551212',
      call_id: 'sip-call-id-xyz',
      transfer_result: 'bridged',
      transfer_reason: 'completed',
      sip_status: 200,
    });
  });

  test('transfer callback: payload with only call_sid passes (no required fields)', () => {
    assertValid(validateTransferCallback, {
      call_sid: 'cs-abc123',
    });
  });

  test('transfer callback: extra unknown field passes (additionalProperties:true)', () => {
    assertValid(validateTransferCallback, {
      call_sid: 'cs-abc123',
      transfer_result: 'bridged',
      custom_field: 'provider-specific',
    });
  });

  test('transfer callback: caller-abandoned reason passes', () => {
    assertValid(validateTransferCallback, {
      call_sid: 'cs-abc123',
      transfer_result: 'returned',
      transfer_reason: 'caller-abandoned',
    });
  });

  test('transfer callback: declined reason passes', () => {
    assertValid(validateTransferCallback, {
      call_sid: 'cs-abc123',
      transfer_result: 'returned',
      transfer_reason: 'declined',
    });
  });

  console.log('\ncallbacks/transfer — invalid payloads');

  test('transfer callback: transfer_result=nope fails', () => {
    assertInvalid(validateTransferCallback,
      {call_sid: 'x', transfer_result: 'nope'},
      /allowed values|enum/i);
  });

  test('transfer callback: transfer_result=success fails', () => {
    assertInvalid(validateTransferCallback,
      {call_sid: 'x', transfer_result: 'success'},
      /allowed values|enum/i);
  });

  test('transfer callback: transfer_reason=abandoned fails', () => {
    assertInvalid(validateTransferCallback,
      {call_sid: 'x', transfer_result: 'bridged', transfer_reason: 'abandoned'},
      /allowed values|enum/i);
  });

  test('transfer callback: transfer_reason=timeout fails', () => {
    assertInvalid(validateTransferCallback,
      {call_sid: 'x', transfer_reason: 'timeout'},
      /allowed values|enum/i);
  });

  test('transfer callback: sip_status as string fails', () => {
    assertInvalid(validateTransferCallback,
      {call_sid: 'x', transfer_result: 'bridged', sip_status: '200'},
      /integer|type/i);
  });

  test('transfer callback: sip_status as float fails', () => {
    assertInvalid(validateTransferCallback,
      {call_sid: 'x', transfer_result: 'bridged', sip_status: 200.5},
      /integer|type/i);
  });

  test('transfer callback: dial_call_sid as number fails', () => {
    assertInvalid(validateTransferCallback,
      {call_sid: 'x', dial_call_sid: 99},
      /string|type/i);
  });

  test('transfer callback: transfer_result as null fails', () => {
    assertInvalid(validateTransferCallback,
      {call_sid: 'x', transfer_result: null},
      /string|type|enum/i);
  });
}

/* ---- summary ---- */
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
