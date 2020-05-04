"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ono_1 = require("ono");
const modded_express_mung_1 = require("../framework/modded.express.mung");
const ajv_1 = require("../framework/ajv");
const util_1 = require("./util");
const mediaTypeParser = require("media-typer");
const contentTypeParser = require("content-type");
class ResponseValidator {
    constructor(openApiSpec, options = {}) {
        this.validatorsCache = {};
        this.spec = openApiSpec;
        this.ajv = ajv_1.createResponseAjv(openApiSpec, options);
        modded_express_mung_1.default.onError = (err, req, res, next) => {
            return next(err);
        };
    }
    validate() {
        return modded_express_mung_1.default.json((body, req, res) => {
            var _a, _b, _c;
            if (req.openapi) {
                const openapi = req.openapi;
                const responses = (_a = openapi.schema) === null || _a === void 0 ? void 0 : _a.responses;
                const contentTypeMeta = util_1.ContentType.from(req);
                const contentType = (_c = (((_b = contentTypeMeta.contentType) === null || _b === void 0 ? void 0 : _b.indexOf('multipart')) > -1
                    ? contentTypeMeta.equivalents()[0]
                    : contentTypeMeta.contentType)) !== null && _c !== void 0 ? _c : 'not_provided';
                const validators = this._getOrBuildValidator(req, responses, contentType);
                const statusCode = res.statusCode;
                const path = req.originalUrl;
                return this._validate({
                    validators,
                    body,
                    statusCode,
                    path,
                    contentType,
                });
            }
            return body;
        });
    }
    // TODO public for test only - fix me
    // Build validators for each url/method/contenttype tuple
    _getOrBuildValidator(req, responses, contentType) {
        if (!req) {
            // use !req is only possible in unit tests
            return this.buildValidators(responses);
        }
        const key = `${req.method}-${req.originalUrl}-${contentType}`;
        let validators = this.validatorsCache[key];
        if (!validators) {
            validators = this.buildValidators(responses);
            this.validatorsCache[key] = validators;
        }
        return validators;
    }
    // TODO public for test only - fix me
    _validate({ validators, body, statusCode, path, contentType, }) {
        // find the validator for the 'status code' e.g 200, 2XX or 'default'
        let validator;
        const status = statusCode;
        if (status) {
            const statusXX = status.toString()[0] + 'XX';
            let svalidator;
            if (status in validators) {
                svalidator = validators[status];
            }
            else if (statusXX in validators) {
                svalidator = validators[statusXX];
            }
            else if (validators.default) {
                svalidator = validators.default;
            }
            else {
                throw util_1.validationError(500, path, `no schema defined for status code '${status}' in the openapi spec`);
            }
            validator = svalidator[contentType];
            if (!validator) { // wildcard support
                for (const validatorContentType of Object.keys(svalidator).sort().reverse()) {
                    if (validatorContentType === '*/*') {
                        validator = svalidator[validatorContentType];
                        break;
                    }
                    if (RegExp(/^[a-z]+\/\*$/).test(validatorContentType)) { // wildcard of type application/*
                        const [type] = validatorContentType.split('/', 1);
                        if (new RegExp(`^${type}\/.+$`).test(contentType)) {
                            validator = svalidator[validatorContentType];
                            break;
                        }
                    }
                }
            }
            if (!validator)
                validator = svalidator[Object.keys(svalidator)[0]]; // take first for backwards compatibility
        }
        if (!validator) {
            console.warn('no validator found');
            // assume valid
            return;
        }
        if (!body) {
            throw util_1.validationError(500, '.response', 'response body required.');
        }
        // CHECK If Content-Type is validatable
        try {
            if (!this.canValidateContentType(contentType)) {
                console.warn('Cannot validate content type', contentType);
                // assume valid
                return;
            }
        }
        catch (e) {
            // Do nothing. Move on and validate response
        }
        const valid = validator({
            response: body,
        });
        if (!valid) {
            const errors = util_1.augmentAjvErrors(validator.errors);
            const message = this.ajv.errorsText(errors, {
                dataVar: '',
            });
            throw ono_1.default(util_1.ajvErrorsToValidatorError(500, errors), message);
        }
    }
    /**
     * Build a map of response name to response validator, for the set of responses
     * defined on the current endpoint
     * @param responses
     * @returns a map of validators
     */
    buildValidators(responses) {
        var _a;
        const validationTypes = (response) => {
            if (!response.content) {
                return ['no_content'];
            }
            if (typeof response.content !== 'object') {
                return [];
            }
            const types = [];
            for (let contentType of Object.keys(response.content)) {
                try {
                    if (this.canValidateContentType(contentType)) {
                        if (response.content[contentType] &&
                            response.content[contentType].schema) {
                            types.push(contentType);
                        }
                    }
                }
                catch (e) {
                    // Handle wildcards
                    if (response.content[contentType].schema &&
                        (contentType === '*/*' || new RegExp(/^[a-z]+\/\*$/).test(contentType))) {
                        types.push(contentType);
                    }
                }
            }
            return types;
        };
        const responseSchemas = {};
        for (const [name, response] of Object.entries(responses)) {
            const types = validationTypes(response);
            for (const mediaTypeToValidate of types) {
                if (!mediaTypeToValidate) {
                    // TODO support content other than JSON
                    // don't validate
                    // assume is valid
                    continue;
                }
                else if (mediaTypeToValidate === 'no_content') {
                    responseSchemas[name] = {};
                    continue;
                }
                const schema = response.content[mediaTypeToValidate].schema;
                responseSchemas[name] = Object.assign(Object.assign({}, responseSchemas[name]), { [mediaTypeToValidate]: {
                        // $schema: 'http://json-schema.org/schema#',
                        // $schema: "http://json-schema.org/draft-04/schema#",
                        type: 'object',
                        properties: {
                            response: schema,
                        },
                        components: (_a = this.spec.components) !== null && _a !== void 0 ? _a : {},
                    } });
            }
        }
        const validators = {};
        for (const [code, contentTypeSchemas] of Object.entries(responseSchemas)) {
            for (const contentType of Object.keys(contentTypeSchemas)) {
                const schema = contentTypeSchemas[contentType];
                validators[code] = Object.assign(Object.assign({}, validators[code]), { [contentType]: this.ajv.compile(schema) });
            }
        }
        return validators;
    }
    /**
     * Checks if specific Content-Type is validatable
     * @param contentType
     * @returns boolean
     * @throws error on invalid content type format
     */
    canValidateContentType(contentType) {
        const contentTypeParsed = contentTypeParser.parse(contentType);
        const mediaTypeParsed = mediaTypeParser.parse(contentTypeParsed.type);
        return (mediaTypeParsed.subtype === 'json' ||
            mediaTypeParsed.suffix === 'json');
    }
}
exports.ResponseValidator = ResponseValidator;
//# sourceMappingURL=openapi.response.validator.js.map