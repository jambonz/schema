# @jambonz/schema

JSON Schema definitions and validation for jambonz verb applications.

## What's Included

- **33 verb schemas** (`verbs/`) -- every jambonz verb (say, gather, dial, openai_s2s, agent, etc.)
- **42 component schemas** (`components/`) -- shared types (synthesizer, recognizer, target, actionHook, etc.)
- **32 callback schemas** (`callbacks/`) -- actionHook payload definitions for each verb
- **AGENTS.md** -- language-agnostic developer guide covering the verb model, transport modes, and protocol
- **docs/** -- additional reference documentation
- **jambonz-app.schema.json** -- the full application schema (JSON Schema draft 2020-12)

## Installation

```bash
npm install @jambonz/schema
```

## Usage

```javascript
const { validate, validateVerb, normalizeJambones } = require('@jambonz/schema');

// Validate a single verb object
const verb = { verb: 'say', text: 'Hello world' };
const result = validateVerb(verb);
if (!result.valid) {
  console.error(result.errors);
}

// Validate a full jambonz application (array of verbs)
const app = [
  { verb: 'say', text: 'Welcome.' },
  { verb: 'gather', input: ['speech'], actionHook: '/input', timeout: 10 }
];
const appResult = validate(app);

// Normalize legacy verb names and formats
const normalized = normalizeJambones(app);
```

## Schema Format

All schemas use **JSON Schema draft 2020-12**. The root application schema (`jambonz-app.schema.json`) references individual verb and component schemas via `$ref`.

## API

| Function | Description |
|----------|-------------|
| `validate(app)` | Validate a verb array or single verb against the schema |
| `validateVerb(verb)` | Validate a single verb object |
| `validateApp(app)` | Validate a complete jambonz application array |
| `normalizeJambones(app)` | Normalize legacy verb names and synonyms (e.g. `listen` -> `stream`, `llm` -> `s2s`) |

## Links

- [jambonz.org](https://jambonz.org) -- platform documentation
- [@jambonz/mcp-schema-server](https://github.com/jambonz/mcp-server) -- MCP server for AI agent integration
- [GitHub](https://github.com/jambonz/schema)

## License

MIT
