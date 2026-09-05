import * as path from "path";
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

export interface CallBreakStackProps extends cdk.StackProps {
  domainName?: string;
  hostedZoneId?: string;
  zoneName?: string;
  certificate?: acm.ICertificate;
  environment?: "dev" | "prod";
}

export class CallBreakStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;
  public readonly gamesTable: dynamodb.Table;
  public readonly frontendBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: CallBreakStackProps) {
    super(scope, id, props);

    const environment = props?.environment || "dev";

    // DynamoDB Table for Games
    this.gamesTable = new dynamodb.Table(this, "GamesTable", {
      partitionKey: {
        name: "PK",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "SK",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      // Games are disposable; DynamoDB purges every item a day after the game was created.
      timeToLiveAttribute: "expiresAt",
      removalPolicy:
        environment === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: environment === "prod",
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Add GSI for status queries
    this.gamesTable.addGlobalSecondaryIndex({
      indexName: "StatusIndex",
      partitionKey: {
        name: "status",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "createdAt",
        type: dynamodb.AttributeType.STRING,
      },
    });
    this.gamesTable.addGlobalSecondaryIndex({
      indexName: "GameCodeIndex",
      partitionKey: { name: "gameCode", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
    });

    this.gamesTable.addGlobalSecondaryIndex({
      indexName: "AllGamesIndex",
      partitionKey: {
        name: "entityType",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "createdAt",
        type: dynamodb.AttributeType.STRING,
      },
    });

    // S3 Bucket for Frontend
    this.frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      versioned: true,
      removalPolicy:
        environment === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: environment !== "prod",
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    // CloudFront Distribution
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      "OAI",
      {
        comment: "OAI for Call Break Frontend",
      }
    );

    this.frontendBucket.grantRead(originAccessIdentity);

    /**
     * The export writes every route as `<route>/index.html`, but S3 behind an origin access
     * identity serves no directory index. Without this rewrite a direct load of `/game/results/`
     * 404s and the error mapping below silently returns the home page instead.
     */
    const directoryIndexRewrite = new cloudfront.Function(this, "DirectoryIndexRewrite", {
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (!uri.includes('.')) {
    request.uri = uri + '/index.html';
  }
  return request;
}
`),
    });

    this.distribution = new cloudfront.Distribution(
      this,
      "FrontendDistributionV2",
      {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessIdentity(this.frontendBucket, {
            originAccessIdentity,
          }),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          functionAssociations: [
            {
              function: directoryIndexRewrite,
              eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            },
          ],
        },
        defaultRootObject: "index.html",
        ...(props?.domainName && props?.certificate
          ? { domainNames: [props.domainName], certificate: props.certificate }
          : {}),
        errorResponses: [
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
          },
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
          },
        ],
      }
    );

    // API Gateway
    this.api = new apigateway.RestApi(this, "CallBreakAPI", {
      restApiName: "Call Break API",
      description: "API for Call Break Scorekeeper",
      defaultCorsPreflightOptions: {
        allowHeaders: ["Content-Type", "Authorization", "X-Host-Token", "X-Session-Id"],
        allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowOrigins: [
          "http://localhost:3000",
          "http://localhost:3001",
          `https://${this.distribution.distributionDomainName}`,
          ...(props?.domainName ? [`https://${props.domainName}`] : []),
        ],
      },
    });

    // Lambda Execution Role
    const lambdaRole = new iam.Role(this, "LambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    this.gamesTable.grantReadWriteData(lambdaRole);

    const createGame = this.createGameFunction("CreateGameFunction", "createGame", lambdaRole);
    const getGame = this.createGameFunction("GetGameFunction", "getGame", lambdaRole);
    const updateRound = this.createGameFunction("UpdateRoundFunction", "updateRound", lambdaRole);
    const markPunished = this.createGameFunction("MarkPunishedFunction", "markPunished", lambdaRole);
    const removePunishment = this.createGameFunction("RemovePunishmentFunction", "removePunishment", lambdaRole);
    const completeGame = this.createGameFunction("CompleteGameFunction", "completeGame", lambdaRole);
    const listGames = this.createGameFunction("ListGamesFunction", "listGames", lambdaRole);
    const deleteGame = this.createGameFunction("DeleteGameFunction", "deleteGame", lambdaRole);
    const getGameByCode = this.createGameFunction("GetGameByCodeFunction", "getGameByCode", lambdaRole);
    const joinGame = this.createGameFunction("JoinGameFunction", "joinGame", lambdaRole);
    const submitRound = this.createGameFunction("SubmitRoundFunction", "submitRound", lambdaRole);
    const revealRound = this.createGameFunction("RevealRoundFunction", "revealRound", lambdaRole);

    const games = this.api.root.addResource("games");
    games.addMethod("POST", new apigateway.LambdaIntegration(createGame));
    games.addMethod("GET", new apigateway.LambdaIntegration(listGames));
    games.addResource("join").addMethod("POST", new apigateway.LambdaIntegration(joinGame));

    const gameCode = games.addResource("code").addResource("{gameCode}");
    gameCode.addMethod("GET", new apigateway.LambdaIntegration(getGameByCode));

    const game = games.addResource("{gameId}");
    game.addMethod("GET", new apigateway.LambdaIntegration(getGame));
    game.addMethod("DELETE", new apigateway.LambdaIntegration(deleteGame));
    const rounds = game.addResource("rounds");
    const round = rounds.addResource("{roundNumber}");
    round.addMethod("PUT", new apigateway.LambdaIntegration(updateRound));
    round.addResource("submit").addMethod("POST", new apigateway.LambdaIntegration(submitRound));
    round.addResource("reveal").addMethod("POST", new apigateway.LambdaIntegration(revealRound));
    const players = round.addResource("players");
    const player = players.addResource("{playerId}");
    const punishment = player.addResource("punishment");
    punishment.addMethod("POST", new apigateway.LambdaIntegration(markPunished));
    punishment.addMethod("DELETE", new apigateway.LambdaIntegration(removePunishment));
    game.addResource("complete").addMethod("POST", new apigateway.LambdaIntegration(completeGame));

    // Without these, API Gateway's own errors arrive with no CORS headers and the browser reports them as CORS failures.
    const gatewayCorsHeaders = {
      "Access-Control-Allow-Origin": "'*'",
      "Access-Control-Allow-Headers": "'Content-Type,Authorization,X-Host-Token,X-Session-Id'",
      "Access-Control-Allow-Methods": "'GET,POST,PUT,DELETE,OPTIONS'",
    };
    this.api.addGatewayResponse("Default4xx", {
      type: apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: gatewayCorsHeaders,
    });
    this.api.addGatewayResponse("Default5xx", {
      type: apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: gatewayCorsHeaders,
    });

    if (props?.domainName && props?.hostedZoneId && props?.zoneName) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.zoneName,
      });
      const aliasTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution));

      new route53.ARecord(this, "SiteAliasRecord", {
        zone: hostedZone,
        recordName: props.domainName,
        target: aliasTarget,
      });
      new route53.AaaaRecord(this, "SiteAliasRecordIpv6", {
        zone: hostedZone,
        recordName: props.domainName,
        target: aliasTarget,
      });

      new cdk.CfnOutput(this, "SiteURL", { value: `https://${props.domainName}` });
    }

    // Add outputs
    new cdk.CfnOutput(this, "FrontendURL", {
      value: `https://${this.distribution.distributionDomainName}`,
    });

    new cdk.CfnOutput(this, "APIURL", {
      value: this.api.url,
    });

    new cdk.CfnOutput(this, "GamesTableName", {
      value: this.gamesTable.tableName,
    });
  }

  private createGameFunction(
    id: string,
    handler: string,
    role: iam.IRole
  ): lambdaNodejs.NodejsFunction {
    return new lambdaNodejs.NodejsFunction(this, id, {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, `../../backend/src/handlers/${handler}.ts`),
      handler: "handler",
      depsLockFilePath: path.join(__dirname, "../../package-lock.json"),
      role,
      timeout: cdk.Duration.seconds(10),
      memorySize: 256,
      environment: {
        DYNAMODB_TABLE: this.gamesTable.tableName,
      },
    });
  }
}
