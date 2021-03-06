"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ajv_1 = require("../framework/ajv");
const util_1 = require("./util");
const ono_1 = require("ono");
const body_parse_1 = require("./parsers/body.parse");
const schema_parse_1 = require("./parsers/schema.parse");
const req_parameter_mutator_1 = require("./parsers/req.parameter.mutator");
class RequestValidator {
    constructor(apiDoc, options = {}) {
        this.middlewareCache = {};
        this.requestOpts = {};
        this.middlewareCache = {};
        this.apiDoc = apiDoc;
        this.requestOpts.allowUnknownQueryParameters =
            options.allowUnknownQueryParameters;
        this.ajv = ajv_1.createRequestAjv(apiDoc, options);
    }
    validate(req, res, next) {
        var _a;
        if (!req.openapi) {
            // this path was not found in open api and
            // this path is not defined under an openapi base path
            // skip it
            return next();
        }
        const openapi = req.openapi;
        const path = openapi.expressRoute;
        if (!path) {
            throw util_1.validationError(404, req.path, 'not found');
        }
        const reqSchema = openapi.schema;
        if (!reqSchema) {
            throw util_1.validationError(405, req.path, `${req.method} method not allowed`);
        }
        // cache middleware by combining method, path, and contentType
        const contentType = util_1.ContentType.from(req);
        const contentTypeKey = (_a = contentType.equivalents()[0]) !== null && _a !== void 0 ? _a : 'not_provided';
        // use openapi.expressRoute as path portion of key
        const key = `${req.method}-${path}-${contentTypeKey}`;
        if (!this.middlewareCache[key]) {
            const middleware = this.buildMiddleware(path, reqSchema, contentType);
            this.middlewareCache[key] = middleware;
        }
        return this.middlewareCache[key](req, res, next);
    }
    buildMiddleware(path, reqSchema, contentType) {
        const apiDoc = this.apiDoc;
        const schemaParser = new schema_parse_1.ParametersSchemaParser(apiDoc);
        const bodySchemaParser = new body_parse_1.BodySchemaParser(this.ajv, apiDoc);
        const parameters = schemaParser.parse(path, reqSchema.parameters);
        const securityQueryParam = Security.queryParam(apiDoc, reqSchema);
        const body = bodySchemaParser.parse(path, reqSchema, contentType);
        const isBodyBinary = (body === null || body === void 0 ? void 0 : body['format']) === 'binary';
        const properties = Object.assign(Object.assign({}, parameters), { body: isBodyBinary ? {} : body });
        // TODO throw 400 if missing a required binary body
        const required = body.required && !isBodyBinary ? ['body'] : [];
        // $schema: "http://json-schema.org/draft-04/schema#",
        const schema = {
            required: ['query', 'headers', 'params'].concat(required),
            properties,
        };
        const validator = this.ajv.compile(schema);
        return (req, res, next) => {
            var _a, _b;
            const openapi = req.openapi;
            const hasPathParams = Object.keys(openapi.pathParams).length > 0;
            if (hasPathParams) {
                req.params = (_a = openapi.pathParams) !== null && _a !== void 0 ? _a : req.params;
            }
            const mutator = new req_parameter_mutator_1.RequestParameterMutator(apiDoc, path, properties);
            mutator.modifyRequest(req);
            if (!this.requestOpts.allowUnknownQueryParameters) {
                this.processQueryParam(req.query, schema.properties.query, securityQueryParam);
            }
            const cookies = req.cookies
                ? Object.assign(Object.assign({}, req.cookies), req.signedCookies) : undefined;
            const valid = validator(Object.assign(Object.assign({}, req), { cookies }));
            if (valid) {
                next();
            }
            else {
                const errors = util_1.augmentAjvErrors([...((_b = validator.errors) !== null && _b !== void 0 ? _b : [])]);
                const err = util_1.ajvErrorsToValidatorError(400, errors);
                const message = this.ajv.errorsText(errors, { dataVar: 'request' });
                throw ono_1.default(err, message);
            }
        };
    }
    processQueryParam(query, schema, whiteList = []) {
        if (!schema.properties)
            return;
        const knownQueryParams = new Set(Object.keys(schema.properties));
        whiteList.forEach(item => knownQueryParams.add(item));
        const queryParams = Object.keys(query);
        const allowedEmpty = schema.allowEmptyValue;
        for (const q of queryParams) {
            if (!this.requestOpts.allowUnknownQueryParameters &&
                !knownQueryParams.has(q)) {
                throw util_1.validationError(400, `.query.${q}`, `Unknown query parameter '${q}'`);
            }
            else if (!(allowedEmpty === null || allowedEmpty === void 0 ? void 0 : allowedEmpty.has(q)) && (query[q] === '' || null)) {
                throw util_1.validationError(400, `.query.${q}`, `Empty value found for query parameter '${q}'`);
            }
        }
    }
}
exports.RequestValidator = RequestValidator;
class Security {
    static queryParam(apiDocs, schema) {
        var _a;
        const hasPathSecurity = schema.hasOwnProperty('security') && schema.security.length > 0;
        const hasRootSecurity = apiDocs.hasOwnProperty('security') && apiDocs.security.length > 0;
        let usedSecuritySchema = [];
        if (hasPathSecurity) {
            usedSecuritySchema = schema.security;
        }
        else if (hasRootSecurity) {
            // if no security schema for the path, use top-level security schema
            usedSecuritySchema = apiDocs.security;
        }
        const securityQueryParameter = this.getSecurityQueryParams(usedSecuritySchema, (_a = apiDocs.components) === null || _a === void 0 ? void 0 : _a.securitySchemes);
        return securityQueryParameter;
    }
    static getSecurityQueryParams(usedSecuritySchema, securitySchema) {
        return usedSecuritySchema && securitySchema
            ? usedSecuritySchema
                .filter(obj => Object.entries(obj).length !== 0)
                .map(sec => {
                const securityKey = Object.keys(sec)[0];
                return securitySchema[securityKey];
            })
                .filter(sec => (sec === null || sec === void 0 ? void 0 : sec.type) === 'apiKey' && (sec === null || sec === void 0 ? void 0 : sec.in) == 'query')
                .map((sec) => sec.name)
            : [];
    }
}
//# sourceMappingURL=openapi.request.validator.js.map