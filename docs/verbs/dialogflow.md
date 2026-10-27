## Overview

The dialogflow verb connects the caller to a Google Dialogflow agent (ES, CX, or CES). See the verb schema for all properties.

## Sending input into a CES conversation mid-call

With `model: "ces"`, an application can send input into the running conversation without restarting the verb. Updates can be sent via:
- **WebSocket**: a `dialogflow:update` command: `{"type":"command","command":"dialogflow:update","data":{...}}`
- **REST API**: the `dialogflow_update` key of the call-update body, with the same object

The object holds at most one of `event` (a CES event name), `text` (sent as if the caller said it) or `dtmf` (keypad digits), plus an optional `variables` object. At least one field is required.

- `variables` and `dtmf` are sent at once.
- An `event` or `text` starts an agent turn. CES silently drops one that arrives while the agent is still replying, so jambonz holds it and sends it when the agent's current turn ends: one per turn, in order.
- Only CES is supported. A command sent when no CES dialogflow verb is running is refused and logged by feature-server.

This replaces redirecting to a new `dialogflow` verb with a `welcomeEvent` to tell the agent something mid-call, which restarts the verb.

### Example: take a card payment, then tell the agent

The caller is talking to a CES agent. The application pauses recording, takes the card payment on another system, and tells the agent when it is approved:

```typescript
session.injectRecord('pauseCallRecording');   // pause recording while the card is taken
// ... take the card payment on another system ...
session.injectRecord('resumeCallRecording');
session.injectCommand('dialogflow:update', { event: 'payment_approved' });
```

The raw command is:

```json
{"type": "command", "command": "dialogflow:update", "data": {"event": "payment_approved"}}
```

The CES agent only acts on an event its instructions mention. Add a line like this to the agent's instructions in the CES app:

```
When you receive the event payment_approved, thank the caller, confirm that their payment went through, and ask if there is anything else you can help with.
```

Without it, the event arrives but the agent has no idea what to do with it.

### Variables

`variables` sets CES session variables. A variable must be declared in the CES app and referenced in the agent's instructions as `{name}`, otherwise the agent does not use it.

```json
{"type": "command", "command": "dialogflow:update", "data": {"variables": {"account_tier": "gold"}}}
```

### input-sent and input-dropped events

Two eventHook events report what happened to a held `event` or `text` input. They are delivered only if listed in the verb's `events` array (or `events: ["all"]`).

| Event | Meaning | Data |
|-------|---------|------|
| `input-sent` | A held input went out | `{kind, event, waited_ms}` |
| `input-dropped` | An input was not delivered, e.g. the session ended first | `{kind, event, reason}` |

```json
{
  "verb": "dialogflow",
  "model": "ces",
  "eventHook": "/df-event",
  "events": ["input-sent", "input-dropped"]
}
```
