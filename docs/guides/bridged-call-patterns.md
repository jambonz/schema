# Bridged Call Patterns

This guide covers common patterns for building applications that bridge two call legs (A-leg and B-leg) and need to interact with each party independently—such as real-time translation, call coaching, or call monitoring.

## Understanding A-leg and B-leg

When an inbound call arrives and your application uses the `dial` verb to connect the caller to another party:

- **A-leg**: The original inbound call (caller → jambonz)
- **B-leg**: The outbound call placed by the `dial` verb (jambonz → callee)

Each leg has its own `call_sid` identifier and can receive independent commands.

## Capturing the B-leg call_sid

Many patterns require knowing the B-leg's `call_sid` to inject commands to that leg. Capture it from `call:status` events:

```typescript
let dialCallSid: string;

session.on('call:status', (evt: Record<string, any>) => {
  // B-leg events have direction === 'outbound'
  if (evt.direction === 'outbound') {
    dialCallSid = evt.call_sid;
    console.log(`B-leg call_sid captured: ${dialCallSid}`);
  }
});
```

**When it fires:** The `call:status` event with `direction: 'outbound'` fires when the dial verb initiates the B-leg call. You'll receive status updates for both legs throughout the call lifecycle.

## Setting Up Transcription on Both Legs

To transcribe both parties separately (e.g., for translation), configure transcription on each leg:

```typescript
session
  // Transcribe A-leg (caller)
  .transcribe({
    transcriptionHook: '/transcription/caller',
    channel: 1,  // Near-end = caller's voice
    recognizer: {
      vendor: 'deepgram',
      language: 'en-US',
      deepgramOptions: { model: 'nova-2' }
    }
  })
  // Bridge to B-leg with separate transcription
  .dial({
    target: [{ type: 'phone', number: '+15551234567' }],
    transcribe: {
      transcriptionHook: '/transcription/callee',
      channel: 2,  // Far-end from A-leg = callee's voice
      recognizer: {
        vendor: 'deepgram',
        language: 'es-ES',
        deepgramOptions: { model: 'nova-2' }
      }
    }
  })
  .send();
```

### Channel Values Explained

| Location | Channel | What it captures |
|----------|---------|------------------|
| A-leg transcribe | `1` (near-end) | Caller's voice |
| A-leg transcribe | `2` (far-end) | What caller hears (including B-leg) |
| dial.transcribe | `2` (far-end) | Callee's voice (B-leg inbound audio) |
| dial.transcribe | (omitted) | Both parties mixed |

### Identifying the Speaker in Transcription Events

Use the `call_sid` in transcription events to determine who spoke:

```typescript
session.on('/transcription/caller', (evt: Record<string, any>) => {
  if (evt.speech?.is_final) {
    const transcript = evt.speech.alternatives[0].transcript;
    handleCallerSpeech(transcript);
  }
});

session.on('/transcription/callee', (evt: Record<string, any>) => {
  if (evt.speech?.is_final) {
    const transcript = evt.speech.alternatives[0].transcript;
    handleCalleeSpeech(transcript);
  }
});
```

Or with a single hook, use `call_sid` to differentiate:

```typescript
session.on('/transcription', (evt: Record<string, any>) => {
  if (!evt.speech?.is_final) return;

  const transcript = evt.speech.alternatives[0].transcript;
  const speaker = evt.call_sid === dialCallSid ? 'callee' : 'caller';

  console.log(`${speaker}: ${transcript}`);
});
```

## Creating Dub Tracks for Audio Injection

To inject audio to each party (e.g., translated speech), create tracks on each leg:

```typescript
session
  // Track on A-leg — caller hears it
  .dub({ action: 'addTrack', track: 'caller-audio' })
  .dial({
    target: [{ type: 'phone', number: '+15551234567' }],
    // Track on B-leg — callee hears it
    dub: [
      { action: 'addTrack', track: 'callee-audio' }
    ]
  })
  .send();
```

**Track routing rule:** Tracks are heard by the party on whose call leg they exist.

## Injecting Commands to Specific Legs

### Default: Commands go to A-leg

```typescript
session.injectCommand('dub', {
  action: 'sayOnTrack',
  track: 'caller-audio',
  say: 'This message is for the caller'
});
```

### Targeting B-leg: Pass call_sid as third argument

```typescript
session.injectCommand('dub', {
  action: 'sayOnTrack',
  track: 'callee-audio',
  say: 'This message is for the callee'
}, dialCallSid);  // Third argument routes to B-leg
```

**Important:** The `call_sid` is passed as a separate third argument, not inside the data object.

## Complete Example: Real-Time Translator

This example bridges an English caller with a Spanish-speaking callee, providing real-time translation in both directions.

```typescript
import { createEndpoint, Session } from '@jambonz/sdk/websocket';
import http from 'http';

const server = http.createServer();
const makeService = createEndpoint({ server, port: 3000 });
const svc = makeService({ path: '/' });

svc.on('session:new', (session: Session) => {
  let dialCallSid: string;

  // Capture B-leg call_sid
  session.on('call:status', (evt: Record<string, any>) => {
    if (evt.direction === 'outbound') {
      dialCallSid = evt.call_sid;
    }
  });

  // Handle caller's speech (English → Spanish for callee)
  session.on('/transcription/caller', async (evt: Record<string, any>) => {
    session.reply();
    if (!evt.speech?.is_final) return;

    const transcript = evt.speech.alternatives[0].transcript;
    const translated = await translateToSpanish(transcript);

    // Inject to B-leg track (callee hears it)
    session.injectCommand('dub', {
      action: 'sayOnTrack',
      track: 'callee-audio',
      say: {
        text: translated,
        synthesizer: { vendor: 'elevenlabs', language: 'es-ES' }
      }
    }, dialCallSid);
  });

  // Handle callee's speech (Spanish → English for caller)
  session.on('/transcription/callee', async (evt: Record<string, any>) => {
    session.reply();
    if (!evt.speech?.is_final) return;

    const transcript = evt.speech.alternatives[0].transcript;
    const translated = await translateToEnglish(transcript);

    // Inject to A-leg track (caller hears it)
    session.injectCommand('dub', {
      action: 'sayOnTrack',
      track: 'caller-audio',
      say: {
        text: translated,
        synthesizer: { vendor: 'elevenlabs', language: 'en-US' }
      }
    });
  });

  // Set up the call
  session
    .dub({ action: 'addTrack', track: 'caller-audio' })
    .transcribe({
      transcriptionHook: '/transcription/caller',
      channel: 1,
      recognizer: { vendor: 'deepgram', language: 'en-US' }
    })
    .dial({
      target: [{ type: 'phone', number: process.env.CALLEE_NUMBER! }],
      dub: [
        { action: 'addTrack', track: 'callee-audio' }
      ],
      transcribe: {
        transcriptionHook: '/transcription/callee',
        channel: 2,
        recognizer: { vendor: 'deepgram', language: 'es-ES' }
      }
    })
    .send();
});

async function translateToSpanish(text: string): Promise<string> {
  // Implement translation logic
  return text;
}

async function translateToEnglish(text: string): Promise<string> {
  // Implement translation logic
  return text;
}
```

## Summary: Key Patterns

| Pattern | Implementation |
|---------|----------------|
| Capture B-leg call_sid | Listen for `call:status` where `direction === 'outbound'` |
| Transcribe caller | `transcribe` with `channel: 1` on A-leg |
| Transcribe callee | `transcribe` with `channel: 2` nested in `dial` |
| Audio track for caller | `dub` with `addTrack` on A-leg |
| Audio track for callee | `dub` with `addTrack` in `dial.dub` array |
| Inject to A-leg | `session.injectCommand(verb, data)` |
| Inject to B-leg | `session.injectCommand(verb, data, dialCallSid)` |

## See Also

- `docs/verbs/transcribe.md` - Transcribe verb usage guide
- `docs/verbs/dub.md` - Dub verb usage guide
- `docs/guides/session-commands.md` - Session commands reference
- `callback:call-status` - Call status webhook schema
- `verb:dial` - Dial verb schema
