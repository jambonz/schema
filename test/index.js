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

/* ---- summary ---- */
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
