# jambonz Developer Guide

This guide covers the jambonz verb model, transport modes, and protocol. For SDK-specific documentation, see the AGENTS.md in the respective SDK repository.

jambonz is an open-source CPaaS (Communications Platform as a Service) for building voice and messaging applications. It handles telephony infrastructure — SIP, carriers, phone numbers, media processing — so you can focus on application logic.

## Server Versions

jambonz has two editions: **v0.9.x (open source)** and **v10.x (commercial)**. Always target the commercial version (v10.x). All verb schemas and features are available.

## How jambonz Applications Work

A jambonz application controls phone calls by returning **arrays of verbs** — JSON instructions that execute sequentially. The runtime processes each verb in order: speak text, play audio, collect input, dial a number, connect to an AI model, etc.

### The Webhook Lifecycle

1. An incoming call arrives. jambonz invokes your application's URL with call details (caller, called number, SIP headers, etc.).
2. Your application returns a JSON array of verbs.
3. jambonz executes the verbs in order.
4. When a verb with an `actionHook` completes (e.g. `gather` collects speech input), jambonz invokes the actionHook URL with the result.
5. The actionHook response (a new verb array) replaces the remaining verb stack.
6. This continues until the call ends or a `hangup` verb is executed.

### Transport Modes

jambonz supports two transport modes for delivering verb arrays:

- **Webhook (HTTP)**: Your server receives HTTP POST requests with call data and returns JSON verb arrays in the response body. Stateless and simple. Good for IVR menus, call routing, and straightforward flows.
- **WebSocket**: Your server maintains a persistent websocket connection with jambonz. Verb arrays are sent as JSON messages in both directions. Required for real-time features like LLM conversations, audio streaming, and event-driven flows.

The verb schemas and JSON structure are identical in both modes. The difference is the transport.

### When to Use Which

- **Webhook**: Simple IVR, call routing, voicemail, basic gather-and-respond patterns.
- **WebSocket**: LLM-powered voice agents, real-time audio streaming, complex conversational flows, anything requiring bidirectional communication, or asynchronous logic, or streaming tts.

**IMPORTANT**: Any application that uses a speech-to-speech verb (`openai_s2s`, `google_s2s`, `deepgram_s2s`, `ultravox_s2s`, `elevenlabs_s2s`, `s2s`, or `pipeline`) MUST use WebSocket transport, not webhooks. These verbs require persistent bidirectional communication for real-time audio and events.

## Schema

The complete verb schema is at `jambonz-app.schema.json` in the package root. This is a JSON Schema (draft 2020-12) that defines the structure of a jambonz application.

Individual verb schemas are in `verbs/`. Shared component types (synthesizer, recognizer, target, etc.) are in `components/`. Callback payload schemas are in `callbacks/`.

### MCP Server

AI agents can fetch individual schemas on demand via the jambonz MCP server:

- **Remote**: `https://mcp-server.jambonz.app/mcp` (no install needed)
- **Local**: `npx @jambonz/mcp-schema-server` (stdio) or `npx @jambonz/mcp-schema-server --http` (HTTP)

Two tools are available:
1. **`jambonz_developer_toolkit`** — Returns this guide plus an index of all available schemas. Call this first.
2. **`get_jambonz_schema`** — Fetch the JSON Schema for any verb, component, or callback (e.g. `verb:say`, `component:synthesizer`, `callback:gather`, `guide:session-commands`).

## Core Verbs

### Audio & Speech
- **say** — Speak text using TTS. Supports SSML, streaming, multiple voices.
- **play** — Play an audio file from a URL.
- **gather** — Collect speech (STT) and/or DTMF input. The workhorse for interactive menus and voice input.

### AI & Real-time
- **openai_s2s** / **google_s2s** / **deepgram_s2s** / **ultravox_s2s** — Connect the caller to a vendor-specific LLM for real-time voice conversation. These are the **preferred** verbs when the vendor is known. Each handles the full STT→LLM→TTS pipeline with the vendor pre-set.
- **elevenlabs_s2s** — Connect the caller to an ElevenLabs Conversational AI agent. **Unlike other s2s vendors**, ElevenLabs requires a pre-configured `agent_id` (created in the ElevenLabs dashboard) rather than a model and messages. See [ElevenLabs S2S specifics](#elevenlabs-s2s-specifics) below.
- **s2s** — Generic LLM voice conversation verb. Use only when the vendor is determined at runtime (e.g. from an env var). Requires `vendor` to be specified.
- **pipeline** — Higher-level voice AI pipeline with integrated turn detection.
- **dialogflow** — Connect the caller to a Google Dialogflow agent (ES, CX, or CES).
- **stream** — Stream raw audio to a websocket endpoint for custom processing.
- **transcribe** — Real-time call transcription sent to a webhook.

### Call Control
- **dial** — Place an outbound call and bridge it to the current caller.
- **conference** — Multi-party conference room.
- **enqueue** / **dequeue** — Call queuing.
- **hangup** — End the call.
- **redirect** — Transfer control to a different webhook.
- **pause** — Wait for a specified duration.

### SIP
- **sip:decline** — Reject an incoming call with a SIP error.
- **sip:request** — Send a SIP request within the dialog.
- **sip:refer** — Transfer the call via SIP REFER.

### Utility
- **config** — Set session-level defaults (TTS vendor/voice, STT vendor, VAD, etc.).
- **tag** — Attach metadata to the call.
- **dtmf** — Send DTMF tones.
- **dub** — Mix auxiliary audio tracks into the call.
- **message** — Send SMS/MMS.
- **alert** — Send a SIP 180 with Alert-Info.
- **answer** — Explicitly answer the call.
- **leave** — Leave a conference or queue.

### Verb Synonyms and Shortcuts

**IMPORTANT — Code generation rules:**

1. **Always use `stream`, never `listen`** — they are synonyms; `stream` is the preferred name.
2. **Always use the vendor-specific shortcut when the LLM vendor is known** — use `openai_s2s`, `google_s2s`, `elevenlabs_s2s`, `deepgram_s2s`, or `ultravox_s2s`. Do NOT use `llm` or `s2s` with a `vendor` property when a shortcut exists.
3. **Use `s2s` (not `llm`) when the vendor is dynamic** — e.g. the vendor comes from an env var or runtime config. Both `s2s` and `llm` are synonyms, but prefer `s2s`.
4. **Never use `llm` in generated code** — it is a legacy name. Use either a vendor shortcut or `s2s`.

## Common Patterns (Raw JSON)

These are the raw JSON verb arrays that jambonz applications produce. They show the underlying structure for reference.

### Simple Greeting and Gather
```json
[
  { "verb": "say", "text": "Welcome. Press 1 for sales, 2 for support." },
  { "verb": "gather", "input": ["digits"], "numDigits": 1, "actionHook": "/menu" }
]
```

### LLM Voice Agent
```json
[
  {
    "verb": "config",
    "synthesizer": { "vendor": "elevenlabs", "voice": "EXAVITQu4vr4xnSDxMaL" },
    "recognizer": { "vendor": "deepgram", "language": "en-US" }
  },
  {
    "verb": "openai_s2s",
    "model": "gpt-4o",
    "llmOptions": {
      "messages": [{ "role": "system", "content": "You are a helpful assistant." }]
    },
    "actionHook": "/llm-done",
    "toolHook": "/tool-call"
  }
]
```

### ElevenLabs S2S Specifics

ElevenLabs works differently from other s2s vendors. Instead of passing a model and system prompt, you create a **Conversational AI agent** in the ElevenLabs dashboard and pass the `agent_id` to jambonz. The agent's voice, personality, tools, and LLM configuration are all managed on the ElevenLabs side.

**Key differences from other s2s verbs:**
- `auth` requires `agent_id` (required) and optionally `api_key` (enables signed WebSocket URLs)
- `model` is NOT used — the model is configured in the ElevenLabs agent
- `llmOptions` should be an empty object `{}` (do NOT pass `messages` or `temperature`)
- `llmOptions.conversation_initiation_client_data` can optionally send data to the agent at conversation start
- Always include `eventHook` and `events: ['all']` — omitting eventHook causes errors on the server

```json
[
  {
    "verb": "elevenlabs_s2s",
    "auth": {
      "agent_id": "your-agent-id",
      "api_key": "your-api-key"
    },
    "llmOptions": {},
    "actionHook": "/s2s-complete",
    "eventHook": "/event",
    "events": ["all"]
  }
]
```

### Dial with Fallback
```json
[
  { "verb": "say", "text": "Connecting you now." },
  {
    "verb": "dial",
    "target": [{ "type": "phone", "number": "+15085551212" }],
    "answerOnBridge": true,
    "timeout": 30,
    "actionHook": "/dial-result"
  },
  { "verb": "say", "text": "The agent is unavailable. Goodbye." },
  { "verb": "hangup" }
]
```

### Call Queue
```json
[
  { "verb": "say", "text": "All agents are busy. You are in the queue." },
  {
    "verb": "enqueue",
    "name": "support",
    "waitHook": "/hold-music",
    "actionHook": "/queue-exit"
  }
]
```

## ActionHook Payloads

When a verb completes, jambonz invokes the `actionHook` URL (webhook) or sends an event (WebSocket) with result data. Every actionHook payload includes these base fields:

| Field | Description |
|-------|-------------|
| `call_sid` | Unique identifier for this call |
| `account_sid` | Your account identifier |
| `application_sid` | The application handling this call |
| `direction` | `inbound` or `outbound` |
| `from` | Caller phone number or SIP URI |
| `to` | Called phone number or SIP URI |
| `call_id` | SIP Call-ID |
| `call_status` | Current call state (`trying`, `ringing`, `early-media`, `in-progress`, `completed`, `failed`, `busy`, `no-answer`) |
| `sip_status` | SIP response code (e.g. `200`, `486`) |

### Verb-Specific Payload Fields

**gather**: `speech` (object with `alternatives[].transcript`), `digits` (string), `reason` (`speechDetected`, `dtmfDetected`, `timeout`)

**dial**: `dial_call_sid`, `dial_call_status`, `dial_sip_status`, `dial_sbc_callid`, `duration`

**llm**: `completion_reason` (`normal`, `timeout`, `error`), `llm_usage` (token counts)

**enqueue**: `queue_result` (`dequeued`, `hangup`, `error`)

**transcribe**: `transcription` (object with transcript text)

## WebSocket Protocol

### Message Types (jambonz → app)

| Type | Description |
|------|-------------|
| `session:new` | New call session established. Contains call details. |
| `session:redirect` | Call was redirected to this app. |
| `verb:hook` | An actionHook fired (e.g. gather completed). Contains `hook` (the actionHook name) and `data` (the payload). Respond with an ack containing the next verb array. |
| `verb:status` | Informational verb status notification (no reply needed). |
| `call:status` | Call state changed (e.g. `completed`). |
| `llm:tool-call` | LLM requested a tool/function call. |
| `llm:event` | LLM lifecycle event (connected, tokens, etc.). |
| `tts:tokens-result` | Ack for a TTS token streaming message. |
| `tts:streaming-event` | TTS streaming lifecycle event (e.g. user interruption). |

### Message Types (app → jambonz)

| Type | Description |
|------|-------------|
| `ack` | Acknowledge a received message. Include verbs in the `data` array to replace the current verb stack. |
| `command` | Send a command (e.g. inject a verb, control recording). |
| `llm:tool-output` | Return the result of a tool call to the LLM. |
| `tts:tokens` | Stream TTS text tokens for incremental speech synthesis. |
| `tts:flush` | Signal end of a TTS token stream. |

## REST API

jambonz provides a REST API for platform management and active call control.

Key resources:
- **Calls** — Create outbound calls, query active calls, modify in-progress calls (redirect, whisper, mute, hangup)
- **Messages** — Send SMS/MMS messages

## Key Concepts

- **Verb**: A JSON object with a `verb` property that tells jambonz what to do. Verbs execute sequentially.
- **ActionHook**: A webhook URL that jambonz calls when a verb completes. Returns the next verb array. Payload includes call details and verb-specific results.
- **Synthesizer**: TTS configuration (vendor, voice, language).
- **Recognizer**: STT configuration (vendor, language, model).
- **Target**: A call destination (phone number, SIP URI, registered user, Teams user).
- **Session**: A single phone call. Session-level settings (set via `config`) persist across verbs.
- **Inject Command**: Asynchronous mid-call modification (WebSocket). Executes immediately without replacing the verb stack.
