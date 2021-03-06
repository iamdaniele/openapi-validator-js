import { Application, Router } from 'express';
import { OpenApiValidatorOpts } from './framework/types';
export declare class OpenApiValidator {
    private readonly options;
    constructor(options: OpenApiValidatorOpts);
    installSync(app: Application | Router): void;
    install(app: Application | Router): Promise<void>;
    install(app: Application | Router, callback: (error: Error) => void): void;
    private installMiddleware;
    private installPathParams;
    private installMetadataMiddleware;
    private installMultipartMiddleware;
    private installSecurityMiddleware;
    private installRequestValidationMiddleware;
    private installResponseValidationMiddleware;
    private installOperationHandlers;
    private validateOptions;
    private normalizeOptions;
}
