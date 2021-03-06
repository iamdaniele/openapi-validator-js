"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ono_1 = require("ono");
class ContentType {
    constructor(contentType) {
        this.contentType = null;
        this.mediaType = null;
        this.charSet = null;
        this.withoutBoundary = null;
        this.contentType = contentType;
        if (contentType) {
            this.withoutBoundary = contentType.replace(/;\s{0,}boundary.*/, '');
            this.mediaType = this.withoutBoundary.split(';')[0].trim();
            this.charSet = this.withoutBoundary.split(';')[1];
            if (this.charSet) {
                this.charSet = this.charSet.trim();
            }
        }
    }
    static from(req) {
        return new ContentType(req.headers['content-type']);
    }
    equivalents() {
        if (!this.withoutBoundary)
            return [];
        if (this.charSet) {
            return [this.mediaType, `${this.mediaType}; ${this.charSet}`];
        }
        return [this.withoutBoundary, `${this.mediaType}; charset=utf-8`];
    }
}
exports.ContentType = ContentType;
const _validationError = (status, path, message) => ({
    status,
    errors: [
        {
            path,
            message,
        },
    ],
});
function validationError(status, path, message) {
    const err = _validationError(status, path, message);
    return ono_1.default(err, message);
}
exports.validationError = validationError;
/**
 * (side-effecting) modifies the errors object
 * TODO - do this some other way
 * @param errors
 */
function augmentAjvErrors(errors = []) {
    errors.forEach(e => {
        if (e.keyword === 'enum') {
            const params = e.params;
            const allowedEnumValues = params === null || params === void 0 ? void 0 : params.allowedValues;
            e.message = !!allowedEnumValues
                ? `${e.message}: ${allowedEnumValues.join(', ')}`
                : e.message;
        }
    });
    return errors;
}
exports.augmentAjvErrors = augmentAjvErrors;
function ajvErrorsToValidatorError(status, errors) {
    return {
        status,
        errors: errors.map(e => {
            var _a, _b;
            const params = e.params;
            const required = (params === null || params === void 0 ? void 0 : params.missingProperty) && e.dataPath + '.' + params.missingProperty;
            const additionalProperty = (params === null || params === void 0 ? void 0 : params.additionalProperty) &&
                e.dataPath + '.' + params.additionalProperty;
            const path = (_b = (_a = required !== null && required !== void 0 ? required : additionalProperty) !== null && _a !== void 0 ? _a : e.dataPath) !== null && _b !== void 0 ? _b : e.schemaPath;
            return {
                path,
                message: e.message,
                errorCode: `${e.keyword}.openapi.validation`,
            };
        }),
    };
}
exports.ajvErrorsToValidatorError = ajvErrorsToValidatorError;
exports.deprecationWarning = process.env.NODE_ENV !== 'production' ? console.warn : () => { };
//# sourceMappingURL=util.js.map