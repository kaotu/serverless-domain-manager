/**
 * Wrapper class for AWS APIGateway provider
 */
import DomainConfig = require("../domain-config");
import DomainInfo = require("../domain-info");
import Globals from "../globals";
import {APIGateway, ApiGatewayV2} from "aws-sdk";
import {getAWSPagedResults, throttledCall} from "../utils";

// Merge api v1 & v2 response
interface APIMappingV1V2Response extends ApiGatewayV2.GetApiMappingResponse, APIGateway.BasePathMapping {};

class APIGatewayWrapper {
    public apiGateway: APIGateway;
    public apiGatewayV2: ApiGatewayV2;

    


    constructor(credentials: any) {
        this.apiGateway = new APIGateway(credentials);
        this.apiGatewayV2 = new ApiGatewayV2(credentials);
    }

    /**
     * Creates Custom Domain Name through API Gateway
     * @param domain: DomainConfig
     */
    public async createCustomDomain(domain: DomainConfig): Promise<DomainInfo> {
        const isEdgeType = domain.endpointType === Globals.endpointTypes.edge;
        if (isEdgeType || domain.securityPolicy === Globals.tlsVersions.tls_1_0 || domain.apiGatewayVersion === Globals.apiGatewayVersions.v1) {
            // For EDGE domain name or TLS 1.0, create with APIGateway (v1)
            return new DomainInfo(await this.createCustomDomainV1(domain));
        } else {
            // For Regional domain name create with ApiGatewayV2
            return new DomainInfo(await this.createCustomDomainV2(domain));
        }
    }

    /**
     * Creates Custom Domain Name through API Gateway V1
     * @param domain: DomainConfig
     */
    private async createCustomDomainV1(domain: DomainConfig): Promise<any> {
        const providerTags = {
            ...Globals.serverless.service.provider.stackTags,
            ...Globals.serverless.service.provider.tags
        };

        const params: any = {
            domainName: domain.givenDomainName,
            endpointConfiguration: {
                types: [domain.endpointType],
            },
            securityPolicy: domain.securityPolicy,
            tags: providerTags,
        };

        const isEdgeType = domain.endpointType === Globals.endpointTypes.edge;
        if (isEdgeType) {
            params.certificateArn = domain.certificateArn;
        } else {
            params.regionalCertificateArn = domain.certificateArn;

            if (domain.tlsTruststoreUri) {
                params.mutualTlsAuthentication = {
                    truststoreUri: domain.tlsTruststoreUri
                };

                if (domain.tlsTruststoreVersion) {
                    params.mutualTlsAuthentication.truststoreVersion = domain.tlsTruststoreVersion;
                }
            }
        }

        try {
            return await throttledCall(this.apiGateway, "createDomainName", params);
        } catch (err) {
            throw new Error(
                `API Gateway V1 failed to create custom domain '${domain.givenDomainName}':\n${err.message}`
            );
        }
    }

    /**
     * Creates Custom Domain Name through API Gateway V2
     * @param domain: DomainConfig
     */
    private async createCustomDomainV2(domain: DomainConfig): Promise<any> {
        const providerTags = {
            ...Globals.serverless.service.provider.stackTags,
            ...Globals.serverless.service.provider.tags
        };

        const params: any = {
            DomainName: domain.givenDomainName,
            DomainNameConfigurations: [{
                CertificateArn: domain.certificateArn,
                EndpointType: domain.endpointType,
                SecurityPolicy: domain.securityPolicy,
            }],
            Tags: providerTags
        };

        const isEdgeType = domain.endpointType === Globals.endpointTypes.edge;
        if (!isEdgeType && domain.tlsTruststoreUri) {
            params.MutualTlsAuthentication = {
                TruststoreUri: domain.tlsTruststoreUri
            };

            if (domain.tlsTruststoreVersion) {
                params.MutualTlsAuthentication.TruststoreVersion = domain.tlsTruststoreVersion;
            }
        }

        try {
            return await throttledCall(this.apiGatewayV2, "createDomainName", params);
        } catch (err) {
            throw new Error(
                `API Gateway V2 failed to create custom domain '${domain.givenDomainName}':\n${err.message}`
            );
        }
    }

    /**
     * Delete Custom Domain Name through API Gateway
     */
    public async deleteCustomDomain(domain: DomainConfig): Promise<void> {
        // Make API call
        try {
            if (domain.apiGatewayVersion === Globals.apiGatewayVersions.v1){
                await throttledCall(this.apiGateway, "deleteDomainName", {
                    domainName: domain.givenDomainName,
                });
            } else {
                await throttledCall(this.apiGatewayV2, "deleteDomainName", {
                    DomainName: domain.givenDomainName,
                });
            }
        } catch (err) {
            throw new Error(`Failed to delete custom domain '${domain.givenDomainName}':\n${err.message}`);
        }
    }

    /**
     * Get Custom Domain Info through API Gateway
     */
    public async getCustomDomainInfo(domain: DomainConfig): Promise<DomainInfo> {
        const isEdgeType = domain.endpointType === Globals.endpointTypes.edge;
        if (isEdgeType || domain.securityPolicy === Globals.tlsVersions.tls_1_0 || domain.apiGatewayVersion === Globals.apiGatewayVersions.v1) {
            // For EDGE domain name or TLS 1.0, get info with APIGateway (v1)
            return await this.getCustomDomainInfoV1(domain)
        } else {
            /// For Regional domain name get info with ApiGatewayV2
            return await this.getCustomDomainInfoV2(domain)
        }
    }

    /**
     * Get Custom Domain Info through API Gateway (v1)
     */
    private async getCustomDomainInfoV1(domain: DomainConfig): Promise<DomainInfo> {
        // Make API call
        try {
            const domainInfo = await throttledCall(this.apiGateway, "getDomainName", {
                domainName: domain.givenDomainName,
            });
            return new DomainInfo(domainInfo);
        } catch (err) {
            if (err.code !== "NotFoundException") {
                throw new Error(`Unable to fetch information about '${domain.givenDomainName}':\n${err.message}`);
            }
            Globals.logInfo(`'${domain.givenDomainName}' does not exist.`);
        }
    }

    /**
     * Get Custom Domain Info through API Gateway (v2)
     */
    private async getCustomDomainInfoV2(domain: DomainConfig): Promise<DomainInfo> {
        // Make API call
        try {
            const domainInfo = await throttledCall(this.apiGatewayV2, "getDomainName", {
                DomainName: domain.givenDomainName,
            });
            return new DomainInfo(domainInfo);
        } catch (err) {
            if (err.code !== "NotFoundException") {
                throw new Error(`Unable to fetch information about '${domain.givenDomainName}':\n${err.message}`);
            }
            Globals.logInfo(`'${domain.givenDomainName}' does not exist.`);
        }
    }

    /**
     * Creates basepath mapping
     */
    public async createBasePathMapping(domain: DomainConfig): Promise<void> {
        // Use APIGateway (v1) for EDGE or TLS 1.0 domains
        if (domain.endpointType === Globals.endpointTypes.edge || domain.securityPolicy === "TLS_1_0") {
            await this.createBasePathMappingV1(domain);
        } else {
            await this.createBasePathMappingV2(domain);
        }
    }

    private async createBasePathMappingV1(domain: DomainConfig): Promise<void> {
        try {
            await throttledCall(this.apiGateway, "createBasePathMapping", {
                basePath: domain.basePath,
                domainName: domain.givenDomainName,
                restApiId: domain.apiId,
                stage: domain.stage,
            });
            Globals.logInfo(`Created API mapping '${domain.basePath}' for '${domain.givenDomainName}'`);
        } catch (err) {
            throw new Error(
                `Make sure the '${domain.givenDomainName}' exists.
                     Unable to create base path mapping for '${domain.givenDomainName}':\n${err.message}`
            );
        }
    }

    private async createBasePathMappingV2(domain: DomainConfig): Promise<void> {
        let stage = domain.stage;
        if (domain.apiType === Globals.apiTypes.http) {
            stage = domain.getConfigStage() || Globals.defaultStage;

            if (stage !== Globals.defaultStage) {
                Globals.logWarning(
                    `Using the stage '${stage}' for the HTTP gateway type.
                     Make sure the '${Globals.defaultStage}' is set.\n
                     https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-stages.html`
                );
            }
        }
        try {
            await throttledCall(this.apiGatewayV2, "createApiMapping", {
                ApiId: domain.apiId,
                ApiMappingKey: domain.basePath,
                DomainName: domain.givenDomainName,
                Stage: stage,
            });
            Globals.logInfo(`Created API mapping '${domain.basePath}' for '${domain.givenDomainName}'`);
        } catch (err) {
            throw new Error(`Unable to create base path mapping for '${domain.givenDomainName}':\n${err.message}`);
        }
    }

    public async getApiMappings(domain: DomainConfig): Promise<APIMappingV1V2Response[]> {
        try {
            if( domain.apiGatewayVersion === Globals.apiGatewayVersions.v1 ){
                return await getAWSPagedResults(
                    this.apiGateway,
                    "getBasePathMappings",
                    "items",
                    "position",
                    "position",
                    {domainName: domain.givenDomainName},
                );
            } else {
                return await getAWSPagedResults(
                    this.apiGatewayV2,
                    "getApiMappings",
                    "Items",
                    "NextToken",
                    "NextToken",
                    {DomainName: domain.givenDomainName},
                );
            }
        } catch (err) {
            throw new Error(
                `Make sure the '${domain.givenDomainName}' exists. Unable to get API Mappings(${domain.apiGatewayVersion}):\n${err.message}`
            );
        }
    }

    /**
     * Updates basepath mapping
     */
    public async updateBasePathMapping(domain: DomainConfig): Promise<void> {
        // Use APIGateway (v1) for EDGE or TLS 1.0 domains
        // check here if the EXISTING domain is using TLS 1.0 regardless of what is configured
        // We don't support updating custom domains so switching from TLS 1.0 to 1.2 will require recreating
        // the domain
        if (domain.endpointType === Globals.endpointTypes.edge || domain.domainInfo.securityPolicy === "TLS_1_0") {
            await this.updateBasePathMappingV1(domain);
        } else {
            await this.updateBasePathMappingV2(domain);
        }
    }

    private async updateBasePathMappingV1(domain: DomainConfig): Promise<void> {
        try {
            await throttledCall(this.apiGateway, "updateBasePathMapping", {
                basePath: domain.apiMapping.ApiMappingKey || Globals.defaultBasePath,
                domainName: domain.givenDomainName,
                patchOperations: [{
                    op: "replace",
                    path: "/basePath",
                    value: domain.basePath,
                }]
            });
            Globals.logInfo(`Updated API mapping from '${domain.apiMapping.ApiMappingKey}'
                    to '${domain.basePath}' for '${domain.givenDomainName}'`);
        } catch (err) {
            throw new Error(`Unable to update base path mapping for '${domain.givenDomainName}':\n${err.message}`);
        }
    }

    private async updateBasePathMappingV2(domain: DomainConfig): Promise<void> {
        let stage = domain.stage;
        if (domain.apiType === Globals.apiTypes.http) {
            stage = domain.getConfigStage() || Globals.defaultStage;

            Globals.logWarning(
                `Using the stage '${stage}' for the HTTP gateway type.
                 Make sure the '${Globals.defaultStage}' is set.\n
                 https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-stages.html`
            );
        }
        try {
            await throttledCall(this.apiGatewayV2, "updateApiMapping", {
                ApiId: domain.apiId,
                ApiMappingId: domain.apiMapping.ApiMappingId,
                ApiMappingKey: domain.basePath,
                DomainName: domain.givenDomainName,
                Stage: stage,
            });
            Globals.logInfo(`Updated API mapping to '${domain.basePath}' for '${domain.givenDomainName}'`);
        } catch (err) {
            throw new Error(`Unable to update base path mapping for '${domain.givenDomainName}':\n${err.message}`);
        }
    }

    /**
     * Deletes basepath mapping
     */
    public async deleteBasePathMapping(domain: DomainConfig): Promise<void> {
        // API Gateway V1 
        if ( domain.apiGatewayVersion === Globals.apiGatewayVersions.v1 ){
            const params = {
                basePath: domain.apiMapping.ApiMappingKey || Globals.defaultBasePath,
                domainName: domain.givenDomainName,
            };

            // Make API call
            try {
                await throttledCall(this.apiGateway, "deleteBasePathMapping", params);
                Globals.logInfo(`Removed API Mapping with id: '${domain.apiMapping.ApiMappingId}'`)
            } catch (err) {
                throw new Error(`Unable to remove base path mapping for '${domain.givenDomainName}':\n${err.message}`);
            } 
        } else { // API Gateway V2 
            const params = {
                ApiMappingId: domain.apiMapping.ApiMappingId,
                DomainName: domain.givenDomainName,
            };

            // Make API call
            try {
                await throttledCall(this.apiGatewayV2, "deleteApiMapping", params);
                Globals.logInfo(`Removed API Mapping with id: '${domain.apiMapping.ApiMappingId}'`)
            } catch (err) {
                throw new Error(`Unable to remove base path mapping for '${domain.givenDomainName}':\n${err.message}`);
            }
        }
    }
}

export = APIGatewayWrapper;
