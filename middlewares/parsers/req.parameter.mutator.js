"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const url = require("url");
const util_1 = require("../util");
const util_2 = require("./util");
const mediaTypeParser = require("media-typer");
const contentTypeParser = require("content-type");
const RESERVED_CHARS = /[\:\/\?#\[\]@!\$&\'()\*\+,;=]/;
const ARRAY_DELIMITER = {
    form: ',',
    spaceDelimited: ' ',
    pipeDelimited: '|',
};
const REQUEST_FIELDS = {
    query: 'query',
    header: 'headers',
    path: 'params',
    cookie: 'cookies',
};
/**
 * A class top parse and mutate the incoming request parameters according to the openapi spec.
 * the request is mutated to accomodate various styles and types e.g. form, explode, deepObject, etc
 */
class RequestParameterMutator {
    constructor(apiDocs, path, parsedSchema) {
        this._apiDocs = apiDocs;
        this.path = path;
        this.parsedSchema = parsedSchema;
    }
    /**
     * Modifies an incoing request object by applying the openapi schema
     * req values may be parsed/mutated as a JSON object, JSON Exploded Object, JSON Array, or JSON Exploded Array
     * @param req
     */
    modifyRequest(req) {
        const { parameters } = req.openapi.schema;
        const rawQuery = this.parseQueryStringUndecoded(url.parse(req.originalUrl).query);
        parameters.forEach(p => {
            const parameter = util_2.dereferenceParameter(this._apiDocs, p);
            const { name, schema } = util_2.normalizeParameter(parameter);
            const { type } = schema;
            const { style, explode } = parameter;
            const i = req.originalUrl.indexOf('?');
            const queryString = req.originalUrl.substr(i + 1);
            // if (parameter.in === 'query' && !parameter.allowReserved) {
            //   this.validateReservedCharacters(name, rawQuery);
            // }
            if (parameter.content) {
                this.handleContent(req, name, parameter);
            }
            else if (parameter.in === 'query' && this.isObjectOrXOf(schema)) {
                this.parseJsonAndMutateRequest(req, parameter.in, name);
                if (style === 'form' && explode) {
                    this.handleFormExplode(req, name, schema, parameter);
                }
                else if (style === 'deepObject') {
                    this.handleDeepObject(req, queryString, name);
                }
            }
            else if (type === 'array' && !explode) {
                const delimiter = ARRAY_DELIMITER[parameter.style];
                this.validateArrayDelimiter(delimiter, parameter);
                this.parseJsonArrayAndMutateRequest(req, parameter.in, name, delimiter);
            }
            else if (type === 'array' && explode) {
                this.explodeJsonArrayAndMutateRequest(req, parameter.in, name);
            }
            else if (style === 'form' && explode) {
                this.handleFormExplode(req, name, schema, parameter);
            }
        });
    }
    handleDeepObject(req, qs, name) {
        // nothing to do
        // TODO handle url encoded?
    }
    handleContent(req, name, parameter) {
        /**
         * Per the OpenAPI3 spec:
         * A map containing the representations for the parameter. The key is the media type
         * and the value describes it. The map MUST only contain one entry.
         * https://github.com/OAI/OpenAPI-Specification/blob/master/versions/3.0.2.md#parameterContent
         */
        const contentType = Object.keys(parameter.content)[0];
        const parsedContentType = contentTypeParser.parse(contentType);
        const parsedMediaType = mediaTypeParser.parse(parsedContentType.type);
        const { subtype, suffix } = parsedMediaType;
        const isMediaTypeJson = [subtype, suffix].includes('json');
        if (isMediaTypeJson) {
            const reqField = REQUEST_FIELDS[parameter.in];
            this.parseJsonAndMutateRequest(req, reqField, name);
        }
    }
    handleFormExplode(req, name, schema, parameter) {
        // fetch the keys used for this kind of explode
        const type = schema.type;
        const hasXOf = schema.allOf || schema.oneOf || schema.anyOf;
        const properties = hasXOf
            ? xOfProperties(schema)
            : type === 'object'
                ? Object.keys(schema.properties)
                : [];
        this.explodedJsonObjectAndMutateRequest(req, parameter.in, name, properties, schema);
        function xOfProperties(schema) {
            return ['allOf', 'oneOf', 'anyOf'].reduce((acc, key) => {
                if (!schema.hasOwnProperty(key)) {
                    return acc;
                }
                else {
                    const foundProperties = schema[key].reduce((acc2, obj) => {
                        return obj.type === 'object'
                            ? acc2.concat(...Object.keys(obj.properties))
                            : acc2;
                    }, []);
                    return foundProperties.length > 0
                        ? acc.concat(...foundProperties)
                        : acc;
                }
            }, []);
        }
    }
    parseJsonAndMutateRequest(req, $in, name) {
        var _a;
        /**
         * support json in request params, query, headers and cookies
         * like this filter={"type":"t-shirt","color":"blue"}
         *
         * https://swagger.io/docs/specification/describing-parameters/#schema-vs-content
         */
        const field = REQUEST_FIELDS[$in];
        if ((_a = req[field]) === null || _a === void 0 ? void 0 : _a[name]) {
            try {
                const value = req[field][name];
                const json = JSON.parse(value);
                req[field][name] = json;
            }
            catch (e) {
                // NOOP If parsing failed but _should_ contain JSON, validator will catch it.
                // May contain falsely flagged parameter (e.g. input was object OR string)
            }
        }
    }
    parseJsonArrayAndMutateRequest(req, $in, name, delimiter) {
        var _a;
        /**
         * array deserialization
         * filter=foo,bar,baz
         * filter=foo|bar|baz
         * filter=foo%20bar%20baz
         */
        const field = REQUEST_FIELDS[$in];
        if ((_a = req[field]) === null || _a === void 0 ? void 0 : _a[name]) {
            const value = req[field][name].split(delimiter);
            req[field][name] = value;
        }
    }
    explodedJsonObjectAndMutateRequest(req, $in, name, properties, schema) {
        // forcing convert to object if scheme describes param as object + explode
        // for easy validation, keep the schema but update whereabouts of its sub components
        const field = REQUEST_FIELDS[$in];
        if (req[field]) {
            // check if there is at least one of the nested properties before create the parent
            const atLeastOne = properties.some(p => req[field].hasOwnProperty(p));
            if (atLeastOne) {
                req[field][name] = {};
                properties.forEach(property => {
                    var _a, _b;
                    if (req[field][property]) {
                        const schema = this.parsedSchema[field];
                        const type = (_b = (_a = schema.properties[name].properties) === null || _a === void 0 ? void 0 : _a[property]) === null || _b === void 0 ? void 0 : _b.type;
                        const value = req[field][property];
                        const coercedValue = type === 'array' && !Array.isArray(value) ? [value] : value;
                        req[field][name][property] = coercedValue;
                        delete req[field][property];
                    }
                });
            }
        }
    }
    explodeJsonArrayAndMutateRequest(req, $in, name) {
        var _a;
        /**
         * forcing convert to array if scheme describes param as array + explode
         */
        const field = REQUEST_FIELDS[$in];
        if (((_a = req[field]) === null || _a === void 0 ? void 0 : _a[name]) && !(req[field][name] instanceof Array)) {
            const value = [req[field][name]];
            req[field][name] = value;
        }
    }
    isObjectOrXOf(schema) {
        const schemaHasObject = schema => {
            if (!schema)
                return false;
            const { type, allOf, oneOf, anyOf } = schema;
            return (type === 'object' ||
                [].concat(allOf, oneOf, anyOf).some(schemaHasObject));
        };
        return schemaHasObject(schema);
    }
    validateArrayDelimiter(delimiter, parameter) {
        if (!delimiter) {
            const message = `Parameter 'style' has incorrect value '${parameter.style}' for [${parameter.name}]`;
            throw util_1.validationError(400, `.query.${parameter.name}`, message);
        }
    }
    validateReservedCharacters(name, pairs) {
        const vs = pairs[name];
        if (!vs)
            return;
        for (const v of vs) {
            if (v === null || v === void 0 ? void 0 : v.match(RESERVED_CHARS)) {
                const message = `Parameter '${name}' must be url encoded. Its value may not contain reserved characters.`;
                throw util_1.validationError(400, `.query.${name}`, message);
            }
        }
    }
    parseQueryStringUndecoded(qs) {
        if (!qs)
            return {};
        const q = qs.replace('?', '');
        return q.split('&').reduce((m, p) => {
            var _a;
            const [k, v] = p.split('=');
            m[k] = (_a = m[k]) !== null && _a !== void 0 ? _a : [];
            m[k].push(v);
            return m;
        }, {});
    }
}
exports.RequestParameterMutator = RequestParameterMutator;
//# sourceMappingURL=req.parameter.mutator.js.map