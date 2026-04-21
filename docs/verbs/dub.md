# Dub Verb Usage Guide

The `dub` verb manages auxiliary audio tracks that are mixed into the call audio. Tracks can play background music, coaching whispers, or inject synthesized speech—useful for real-time translation, agent assistance, or audio overlays.

## Track Routing: Who Hears What

**Critical concept:** Dub tracks are heard by the party on whose call leg they are created.

| Where track is created | Who hears it |
|------------------------|--------------|
| Main verb stack (A-leg) | Caller |
| Nested in dial verb's `dub` array | Callee |

When using `injectCommand` to play/say on a track, the command routes to the call leg where the track was created—unless you specify a different `call_sid` as the third argument.

## Basic Usage

### Creating Tracks

Create a track before playing audio on it:

```typescript
// Track on A-leg (caller hears it)
session
  .dub({ action: 'addTrack', track: 'caller-audio' })
  .dial({
    target: [{ type: 'phone', number: '+15551234567' }],
    dub: [
      // Track on B-leg (callee hears it)
      { action: 'addTrack', track: 'callee-audio' }
    ]
  })
  .send();
```

### Playing Audio on Tracks

```typescript
// Play audio file
session
  .dub({
    action: 'playOnTrack',
    track: 'bgm',
    play: 'https://example.com/music.mp3',
    loop: true,
    gain: -15  // Reduce volume by 15dB
  })
  .send();

// Synthesize and play speech
session
  .dub({
    action: 'sayOnTrack',
    track: 'coach',
    say: 'Ask about their timeline'
  })
  .send();
```

### Controlling Tracks

```typescript
// Silence a track (mute without removing)
session.dub({ action: 'silenceTrack', track: 'bgm' }).send();

// Remove a track entirely
session.dub({ action: 'removeTrack', track: 'bgm' }).send();
```

## Mid-Call Audio Injection with injectCommand

The most powerful use of dub tracks is injecting audio mid-call via `injectCommand`. This is how you implement real-time features like translation or coaching.

### Injecting to the Current Call Leg (A-leg)

```typescript
session.injectCommand('dub', {
  action: 'sayOnTrack',
  track: 'caller-audio',
  say: 'Translated text for the caller'
});
```

### Injecting to a Specific Call Leg (B-leg)

When the target track exists on a different call leg, pass the target `call_sid` as the third argument:

```typescript
// First, capture the B-leg call_sid from call:status events
let dialCallSid: string;

session.on('call:status', (evt: Record<string, any>) => {
  if (evt.direction === 'outbound') {
    dialCallSid = evt.call_sid;
  }
});

// Then inject to the B-leg
session.injectCommand('dub', {
  action: 'sayOnTrack',
  track: 'callee-audio',
  say: 'Translated text for the callee'
}, dialCallSid);
```

**Important:** The third argument is the `call_sid` of the call leg where the track exists, not part of the data object.

## Common Use Cases

### Real-Time Translation

Set up tracks for each party, then inject translated speech based on transcriptions:

```typescript
session
  .dub({ action: 'addTrack', track: 'caller-translation' })
  .dial({
    target: [{ type: 'phone', number: '+15551234567' }],
    dub: [
      { action: 'addTrack', track: 'callee-translation' }
    ],
    transcribe: {
      transcriptionHook: '/transcription',
      recognizer: { vendor: 'deepgram' }
    }
  })
  .send();

// When callee speaks, translate and play to caller:
session.injectCommand('dub', {
  action: 'sayOnTrack',
  track: 'caller-translation',
  say: { text: translatedText, synthesizer: { language: 'en-US' } }
});

// When caller speaks, translate and play to callee:
session.injectCommand('dub', {
  action: 'sayOnTrack',
  track: 'callee-translation',
  say: { text: translatedText, synthesizer: { language: 'es-ES' } }
}, dialCallSid);
```

### Agent Coaching / Whisper

Play prompts only the agent hears (A-leg is the agent):

```typescript
session
  .dub({ action: 'addTrack', track: 'coach' })
  .dial({
    target: [{ type: 'phone', number: '+15551234567' }]
  })
  .send();

// Supervisor sends a coaching message:
session.injectCommand('dub', {
  action: 'sayOnTrack',
  track: 'coach',
  say: 'Offer them a 20% discount'
});
```

### Background Music / Hold Music

```typescript
session
  .dub({ action: 'addTrack', track: 'bgm' })
  .dub({
    action: 'playOnTrack',
    track: 'bgm',
    play: 'https://example.com/hold-music.mp3',
    loop: true,
    gain: -20
  })
  .send();
```

## Say Configuration Object

The `say` property can be a string or a configuration object for more control:

```typescript
session.injectCommand('dub', {
  action: 'sayOnTrack',
  track: 'translation',
  say: {
    text: 'Hello, how can I help you?',
    synthesizer: {
      vendor: 'elevenlabs',
      voice: 'EXAVITQu4vr4xnSDxMaL',
      language: 'en-US'
    }
  }
});
```

## Gain Control

Use the `gain` property to adjust track volume in dB:

- Negative values reduce volume (e.g., `-15` for quiet background music)
- Positive values increase volume (use carefully to avoid clipping)
- `0` is the default (no change)

```typescript
session.dub({
  action: 'playOnTrack',
  track: 'bgm',
  play: 'https://example.com/music.mp3',
  gain: -15
}).send();
```

## See Also

- `verb:dub` - Full schema with all properties
- `docs/guides/session-commands.md` - injectCommand documentation
- `docs/guides/bridged-call-patterns.md` - Complete guide to bridged call scenarios
