# Transcribe Verb Usage Guide

The `transcribe` verb enables real-time speech-to-text on a call. Transcription runs as a background process—subsequent verbs execute immediately while transcription continues. Results are streamed to your `transcriptionHook` webhook as they are produced.

## Basic Usage

```typescript
session
  .transcribe({
    transcriptionHook: '/transcription',
    recognizer: {
      vendor: 'deepgram',
      language: 'en-US',
      deepgramOptions: {
        model: 'nova-2',
        smartFormatting: true
      }
    }
  })
  .dial({ target: [{ type: 'phone', number: '+15551234567' }] })
  .send();
```

## Channel Isolation for Bridged Calls

When transcribing a bridged call (A-leg connected to B-leg via `dial`), you can isolate which party's audio to transcribe using the `channel` property:

| Channel | Description |
|---------|-------------|
| (omitted) | Both parties' audio, mixed |
| `1` | Near-end audio (local party—caller on A-leg, callee on B-leg) |
| `2` | Far-end audio (remote party) |

### Transcribing Both Legs Separately

To get separate transcriptions for each party in a bridged call:

```typescript
session
  .transcribe({
    transcriptionHook: '/transcription/caller',
    channel: 1,  // Caller's audio (A-leg near-end)
    recognizer: { vendor: 'deepgram', language: 'en-US' }
  })
  .dial({
    target: [{ type: 'phone', number: '+15551234567' }],
    transcribe: {
      transcriptionHook: '/transcription/callee',
      channel: 2,  // Callee's audio (B-leg far-end from A-leg perspective)
      recognizer: { vendor: 'deepgram', language: 'es-ES' }
    }
  })
  .send();
```

**Important:** When `transcribe` is nested in the `dial` verb, channel 2 isolates the B-leg's inbound audio (what the callee is saying).

## Transcription Hook Payload

Your webhook receives transcription results with these key fields:

```typescript
session.on('/transcription', (evt: Record<string, any>) => {
  const {
    call_sid,           // Which call leg generated this transcript
    speech,             // Speech recognition results
    is_final,           // true for final results, false for interim
    transcription_sid,  // Unique ID for this transcription session
  } = evt;

  if (speech?.is_final) {
    const { transcript, confidence } = speech.alternatives[0];
    console.log(`[${call_sid}] ${transcript} (${confidence})`);
  }
});
```

## Identifying Which Party Spoke

The `call_sid` in transcription events identifies which call leg generated the transcript. If you're tracking the B-leg's call_sid (captured from `call:status` events), you can identify the speaker:

```typescript
let dialCallSid: string;

session.on('call:status', (evt: Record<string, any>) => {
  if (evt.direction === 'outbound') {
    dialCallSid = evt.call_sid;
  }
});

session.on('/transcription', (evt: Record<string, any>) => {
  const speaker = evt.call_sid === dialCallSid ? 'callee' : 'caller';
  console.log(`${speaker}: ${evt.speech?.alternatives[0]?.transcript}`);
});
```

## Nested Transcribe in Config vs Dial

You can enable transcription in two places:

### In the main verb stack (or config)

Transcribes the A-leg. Without `channel`, captures caller audio. With `channel: 2`, captures far-end (what caller hears).

```typescript
session
  .config({
    transcribe: {
      enable: true,
      transcriptionHook: '/transcription',
      recognizer: { vendor: 'deepgram' }
    }
  })
  .send();
```

### Nested in dial

Transcribes during the bridged call. Without `channel`, captures both parties mixed. With `channel: 2`, isolates B-leg audio.

```typescript
session
  .dial({
    target: [{ type: 'phone', number: '+15551234567' }],
    transcribe: {
      transcriptionHook: '/transcription',
      channel: 2,  // Just the callee's voice
      recognizer: { vendor: 'deepgram', language: 'es-ES' }
    }
  })
  .send();
```

## Interim vs Final Results

Most STT vendors provide both interim (partial) and final transcription results:

- **Interim results** (`is_final: false`): Real-time partial transcripts that update as speech continues. Useful for live displays.
- **Final results** (`is_final: true`): Complete utterance transcripts after the speaker pauses. Use these for processing/translation.

```typescript
session.on('/transcription', (evt: Record<string, any>) => {
  if (evt.speech?.is_final) {
    // Process complete utterance
    processTranscript(evt.speech.alternatives[0].transcript);
  }
  // Optionally handle interim results for live display
});
```

## Enabling/Disabling Transcription

Use `enable: false` to stop background transcription:

```typescript
session
  .config({
    transcribe: { enable: false }
  })
  .send();
```

## See Also

- `callback:transcribe` - Full transcription webhook payload schema
- `component:recognizer` - STT configuration options per vendor
- `docs/guides/bridged-call-patterns.md` - Complete guide to bridged call scenarios
