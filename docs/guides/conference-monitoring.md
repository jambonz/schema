# Conference Monitoring, Coaching & Transcription

This guide covers building supervision features on top of jambonz conferences:
silently monitoring a live room, whisper-coaching the agents in it, barging in
as a full participant, and tapping the room's audio for transcription or AI
analysis — all without interrupting or re-dialing any call.

A complete, working reference application (React console + Node backend) built
on these patterns is at **https://github.com/jambonz/room-monitor** — start
with its `docs/ADAPTING.md`. The `conference-supervision` SDK example
(`get_sdk_example`) is a distilled version of the same patterns.

## The building blocks

| Capability | Mechanism |
|---|---|
| Classify participants (who is an "agent") | `memberTag` on each conference member — set at join or changed mid-call |
| Silent monitor | join the conference muted (`joinMuted: true`) |
| Coach / whisper | the supervisor's audio is delivered **only** to members carrying a given tag (`speakOnlyTo` at join, or the `coach` participant action mid-call) |
| Barge-in | `uncoach` + unmute — the supervisor is heard by everyone |
| Room audio out (transcription / AI / recording) | a **conference listen fork**: jambonz streams the room's mixed audio (L16 PCM) to a WebSocket you host |
| Discover live conferences | `GET /Accounts/{sid}/Conferences` (add `?expand=participants` for members + tags on systems that support it) |

Mode changes are mid-call commands on an existing leg — a supervisor moves
between monitor → coach → barge instantly, with no re-INVITE and no
interruption to the room.

## Tagging members

Tags drive everything: coaching targets, UI classification, and per-tag audio
flows. Set a tag when a member joins:

```typescript
session.conference({
  name: 'support-room-42',
  memberTag: 'agent',
}).send();
```

Tags are **fully dynamic** — add or remove them on a participant who is already
in the conference (no re-join). From the application controlling that leg:

```typescript
// promote a live participant (e.g. warm transfer completes, human takes over from AI)
session.injectCommand('conf:participant-action', { action: 'tag', tag: 'agent' });

// demote — clears the member's tag
session.injectCommand('conf:participant-action', { action: 'untag' });

// third argument targets another leg this session controls (e.g. a dialed B-leg)
session.injectCommand('conf:participant-action', { action: 'tag', tag: 'agent' }, bLegCallSid);
```

Or from anywhere via the REST client:

```typescript
import { JambonzClient } from '@jambonz/sdk/client';

const client = new JambonzClient({ baseUrl, accountSid, apiKey });
await client.calls.update(callSid, {
  conferenceParticipantAction: { action: 'tag', tag: 'agent' },
});
```

The full mid-call action set is `tag | untag | coach | uncoach | mute | unmute
| hold | unhold`. Tag changes take effect live: an active coach automatically
starts/stops reaching the member as its tag changes.

## The supervisor leg

The supervisor is just another conference member whose join options and
participant actions produce the three modes. Join for silent monitoring:

```typescript
session
  .answer()
  .conference({
    name: roomName,
    joinMuted: true,               // hears everything, heard by no one
    memberTag: 'supervisor',       // lets other tooling filter this leg out
    startConferenceOnEnter: false, // never create/destroy the room being watched
    endConferenceOnExit: false,
    actionHook: '/conf-done',
  })
  .send();
```

To join directly in coach mode instead, add `speakOnlyTo: 'agent'` and omit
`joinMuted`. Then switch modes mid-call (from any service, via REST):

```typescript
// coach: audio delivered only to members tagged 'agent'
await client.calls.update(supervisorCallSid, {
  conferenceParticipantAction: { action: 'coach', tag: 'agent' },
});
await client.calls.update(supervisorCallSid, { conf_mute_status: 'unmute' });

// barge-in: heard by everyone
await client.calls.update(supervisorCallSid, {
  conferenceParticipantAction: { action: 'uncoach' },
});

// back to silent monitoring
await client.calls.update(supervisorCallSid, { conf_mute_status: 'mute' });
```

Coach semantics to rely on:

- Coached audio reaches **only** members carrying the target tag — including
  members (and audio forks) that join *after* coaching started.
- Audio forks are never tagged, so a transcription or recording tap **cannot
  hear private coaching**; it hears the coach again after `uncoach`.
- If the last tagged member leaves, fall back to monitoring in your
  application logic (the reference app polls participants and downgrades
  coach → monitor automatically).

## Tapping the room's audio (transcription, AI, recording)

A **conference listen fork** streams the room's mixed audio to a WebSocket you
operate. jambonz only transports audio — what you do with it (STT, sentiment,
archiving) is entirely your side of the socket.

```bash
# start — jambonz dials out to your wsUrl and streams L16 PCM
curl -X POST "$BASE_URL/v1/Accounts/$ACCOUNT_SID/Conferences/support-room-42/listen" \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"url": "wss://your-host/fork", "sampleRate": 16000,
       "metadata": {"room": "support-room-42", "sampleRate": 16000}}'

# stop
curl -X DELETE "$BASE_URL/v1/Accounts/$ACCOUNT_SID/Conferences/support-room-42/listen" \
  -H "Authorization: Bearer $API_KEY"
```

Consume it in the same `@jambonz/sdk` app that runs your call logic:

```typescript
const makeService = createEndpoint({ server, port: 3000 });
const audio = makeService.audio({ path: '/fork' });

audio.on('connection', (stream) => {
  // your `metadata` arrives verbatim as the fork's first text frame and is
  // exposed as stream.metadata — make it self-describing (include sampleRate)
  console.log('fork connected', stream.metadata);
  stream.on('audio', (pcm: Buffer) => {
    // feed your STT / AI / recorder here
  });
});
```

Lifecycle guarantees: the fork is a media-server-owned bot member — it is
**excluded from participant counts, never keeps a room alive, and is torn down
automatically when the conference ends**. Starting a fork requires no
participant leg (you can transcribe a room nobody is monitoring), and repeated
starts for the same conference are idempotent.

> Conference-level listen (`/Conferences/{name}/listen`) and the
> `?expand=participants` listing require a jambonz release with MediaJam-based
> conferencing that includes these endpoints.

## Discovering live rooms

```typescript
// names only (all releases)
const rooms = await client.conferences.list();

// with participants + tags (releases with the enriched listing)
const res = await fetch(
  `${baseUrl}/v1/Accounts/${accountSid}/Conferences?expand=participants`,
  { headers: { Authorization: `Bearer ${apiKey}` } });
// → [{ id, name, durationSec, participants: [{ call_sid, label, memberTag, isAgent }] }]
```

Filter out your own supervisor legs (`memberTag === 'supervisor'`) before
displaying counts, and derive "can I coach?" from agent presence.

## Putting it together

A typical supervision backend is three small pieces: a poller on the
conferences listing (rooms → your UI), a jambonz application that joins
supervisor legs and applies participant actions, and an audio-fork consumer
feeding your STT. The reference app implements exactly this — and ships a
closed-loop end-to-end test (`tools/e2e/`) that verifies the audio-visibility
contracts, including coach privacy, using scripted fake-microphone browsers.
If you adapt the patterns, adapt the test too: it will keep verifying who can
hear whom as your code evolves.
