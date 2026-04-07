const debug = require('debug')('jambonz:schema:normalize');

/**
 * Verb transforms: maps alias verb names to their canonical form,
 * optionally injecting properties (e.g. vendor) into the verb data.
 */
const verbTransforms = new Map([
  ['stream', {verb: 'listen'}],
  ['s2s', {verb: 'llm'}],
  ['openai_s2s', {verb: 'llm', properties: {vendor: 'openai'}}],
  ['microsoft_s2s', {verb: 'llm', properties: {vendor: 'microsoft'}}],
  ['google_s2s', {verb: 'llm', properties: {vendor: 'google'}}],
  ['elevenlabs_s2s', {verb: 'llm', properties: {vendor: 'elevenlabs'}}],
  ['deepgram_s2s', {verb: 'llm', properties: {vendor: 'deepgram'}}],
  ['voiceagent_s2s', {verb: 'llm', properties: {vendor: 'voiceagent'}}],
  ['ultravox_s2s', {verb: 'llm', properties: {vendor: 'ultravox'}}],
]);

function applyVerbTransform(name, data) {
  const transform = verbTransforms.get(name);
  if (!transform) return {name, data};
  const newData = transform.properties ? {...transform.properties, ...data} : data;
  return {name: transform.verb, data: newData};
}

/**
 * Normalize a jambonz application payload into canonical form.
 *
 * Accepts both verb formats:
 *   - {verb: 'say', text: 'hello'}
 *   - {'say': {text: 'hello'}}
 *
 * Applies verb transforms (stream→listen, openai_s2s→llm, etc.)
 *
 * @param {object} logger - Logger instance with .info method
 * @param {Array} obj - Array of verb objects
 * @returns {Array} Normalized array of {verbName: data} objects
 */
function normalizeJambones(logger, obj) {
  if (!Array.isArray(obj)) {
    throw new Error('malformed jambonz payload: must be array');
  }
  const document = [];
  for (const tdata of obj) {
    if (typeof tdata !== 'object') throw new Error('malformed jambonz payload: must be array of objects');
    if ('verb' in tdata) {
      const o = {};
      Object.keys(tdata)
        .filter((k) => k !== 'verb')
        .forEach((k) => o[k] = tdata[k]);
      const {name, data} = applyVerbTransform(tdata.verb, o);
      const o2 = {};
      o2[name] = data;
      document.push(o2);
    }
    else if (Object.keys(tdata).length === 1) {
      const key = Object.keys(tdata)[0];
      const {name, data} = applyVerbTransform(key, tdata[key]);
      const o2 = {};
      o2[name] = data;
      document.push(o2);
    }
    else {
      logger.info(tdata, 'malformed jambonz payload: missing verb property');
      throw new Error('malformed jambonz payload: missing verb property');
    }
  }
  debug({document}, `normalizeJambones: returning document with ${document.length} tasks`);
  return document;
}

module.exports = {normalizeJambones, verbTransforms};
