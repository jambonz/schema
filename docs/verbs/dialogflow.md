## Overview

The dialogflow verb connects the caller to a Google Dialogflow agent (ES, CX, or CES). See the verb schema for all properties.

## Credentials without a key in the verb

`credentials` may name a Dialogflow CES credential on the account instead of carrying a service account key:

```json
{"verb": "dialogflow", "model": "ces", "project": "my-project", "region": "us", "agent": "<CES app id>",
 "lang": "en-US", "credentials": {"vendor": "dialogflow_ces", "label": "my-ces"}}
```

An object with only `vendor: "dialogflow_ces"` and optionally `label` is a reference. A Dialogflow CES credential is added under LLM Services, Hosted agents; it is its own credential, and a Google speech credential is never used for CES. feature-server looks up the credential with that label (no label, or null, means the unlabelled one), account first and then service provider, and uses its service key. If none is found the verb ends at once: the actionHook gets `dialogflowResult: "error"` with `error.code: "credential_not_found"`, and feature-server logs the account sid, vendor and label. An inline service account works as before.

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

The caller is talking to a CES agent. The application takes the card payment on another system and tells the agent when it is approved:

```typescript
// WebSocket application (@jambonz/sdk)
session.updateDialogflow({ event: 'payment_approved' });

// or from any system that knows the call sid, over REST
await client.calls.updateDialogflow(callSid, { event: 'payment_approved' });
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
