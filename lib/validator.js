const Ajv = require('ajv');
const {readFileSync} = require('fs');
const {resolve, join} = require('path');
const debug = require('debug')('jambonz:schema:validator');
const {normalizeJambones} = require('./normalize');

const schemaDir = resolve(__dirname, '..');

function loadSchema(relativePath) {
  const fullPath = join(schemaDir, relativePath);
  return JSON.parse(readFileSync(fullPath, 'utf-8'));
}

function discoverSchemas(subdir) {
  const {readdirSync} = require('fs');
  const dir = join(schemaDir, subdir);
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.schema.json'))
      .map((f) => f.replace('.schema.json', ''));
  } catch {
    return [];
  }
}

let _ajv = null;
let _validateApp = null;

function getAjv() {
  if (_ajv) return _ajv;

  _ajv = new Ajv({
    allErrors: false,
    strict: false,
    validateSchema: false,
    logger: false,
  });

  /* register component schemas first (referenced by verb schemas) */
  for (const name of discoverSchemas('components')) {
    const schema = loadSchema(`components/${name}.schema.json`);
    _ajv.addSchema(schema);
  }

  /* register callback schemas */
  for (const name of discoverSchemas('callbacks')) {
    const schema = loadSchema(`callbacks/${name}.schema.json`);
    _ajv.addSchema(schema);
  }

  /* register verb schemas */
  for (const name of discoverSchemas('verbs')) {
    const schema = loadSchema(`verbs/${name}.schema.json`);
    _ajv.addSchema(schema);
  }

  /* compile the root app schema */
  const appSchema = loadSchema('jambonz-app.schema.json');
  _validateApp = _ajv.compile(appSchema);

  debug('schemas compiled successfully');
  return _ajv;
}

/**
 * Validate a single verb against its JSON Schema.
 *
 * API-compatible with @jambonz/verb-specifications validateVerb.
 *
 * @param {string} name - Verb name (e.g. 'say', 'gather', 'llm')
 * @param {object} data - Verb data (without the 'verb' property)
 * @param {object} logger - Logger instance
 * @throws {Error} If the verb is unknown or validation fails
 */
function validateVerb(name, data, logger) {
  const ajv = getAjv();

  /* look up the verb schema by $id */
  const schemaId = `https://jambonz.org/schema/verbs/${name}`;
  const validate = ajv.getSchema(schemaId);
  if (!validate) {
    throw new Error(`invalid instruction: ${name}`);
  }

  /* the JSON Schema expects the full verb object including {verb: 'name'} */
  const verbObj = {verb: name, ...data};
  const valid = validate(verbObj);
  if (!valid) {
    const errors = validate.errors || [];
    const messages = errors.map((e) => `${e.instancePath || '/'}: ${e.message}`).join('; ');
    debug(`validation failed for ${name}: ${messages}`);
    throw new Error(`${name}: ${messages}`);
  }
}

/**
 * Validate a complete jambonz application (array of verbs).
 *
 * API-compatible with @jambonz/verb-specifications validate.
 *
 * @param {object} logger - Logger instance
 * @param {Array} obj - Array of verb objects
 * @throws {Error} If the payload is malformed or any verb is invalid
 */
function validate(logger, obj) {
  /* normalize first (handles both verb formats + transforms) */
  const normalized = normalizeJambones(logger, obj);

  /* validate each verb individually for better error messages */
  for (const tdata of normalized) {
    const keys = Object.keys(tdata);
    const name = keys[0];
    const data = tdata[name];
    validateVerb(name, data, logger);
  }
}

/**
 * Validate a verb array using the root app schema (validates the full array at once).
 *
 * @param {Array} app - Array of verb objects in {verb: 'name', ...} format
 * @returns {{valid: boolean, errors: Array}} Validation result
 */
function validateApp(app) {
  getAjv();
  const valid = _validateApp(app);
  if (valid) return {valid: true, errors: []};
  return {
    valid: false,
    errors: (_validateApp.errors || []).map((e) => ({
      path: e.instancePath || '/',
      message: e.message || 'Unknown validation error',
    })),
  };
}

module.exports = {validate, validateVerb, validateApp};
