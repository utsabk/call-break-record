import * as path from "path";
import * as dotenv from "dotenv";
import * as cdk from "aws-cdk-lib";
import { CallBreakStack } from "./CallBreakStack";
import { CertificateStack } from "./CertificateStack";

// Loaded from infra/.env so deploys work without inline environment variables.
dotenv.config({ path: path.join(__dirname, "../.env") });

const app = new cdk.App();

const environment = process.env.ENVIRONMENT || "dev";
const domainName = process.env.DOMAIN_NAME || app.node.tryGetContext("domainName");
const hostedZoneId = process.env.HOSTED_ZONE_ID || app.node.tryGetContext("hostedZoneId");
// Defaults to the parent domain of callbreak.example.com, i.e. example.com.
const zoneName = process.env.HOSTED_ZONE_NAME || domainName?.split(".").slice(1).join(".");

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const useCustomDomain = Boolean(domainName && hostedZoneId && zoneName);

const certificateStack = useCustomDomain
  ? new CertificateStack(app, "CallBreakCertificateStack", {
      env: { account: env.account, region: "us-east-1" },
      crossRegionReferences: true,
      domainName,
      hostedZoneId,
      zoneName,
      description: "CloudFront certificate for Call Break (must live in us-east-1)",
    })
  : undefined;

new CallBreakStack(app, "CallBreakStack", {
  env,
  crossRegionReferences: true,
  environment: environment as "dev" | "prod",
  domainName,
  hostedZoneId,
  zoneName,
  certificate: certificateStack?.certificate,
  description: "Call Break Scorekeeper Infrastructure",
});

app.synth();
