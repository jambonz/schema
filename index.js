const {validate, validateVerb, validateApp, validateCommand} = require('./lib/validator');
const {normalizeJambones} = require('./lib/normalize');

module.exports = {
  validate,
  validateVerb,
  validateApp,
  validateCommand,
  normalizeJambones,
};
