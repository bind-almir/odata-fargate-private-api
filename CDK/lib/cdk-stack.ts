import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as applicationautoscaling from 'aws-cdk-lib/aws-applicationautoscaling';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elasticloadbalancingv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface CdkStackProps extends cdk.StackProps {
  /**
   * The environment to deploy
   * @default 'Production'
   */
  readonly environment?: string;
  /**
   * The database admin account password
   */
  readonly dbPassword: string;
}

/**
 * Deploy a container to Fargate with private NLB, Auto Scaling, RDS in a VPC with private subnets, necessary security groups, a NAT Gateway, and Secrets Manager for database credentials. Includes a bastion host accessible via SSM.
 */
export class CdkStack extends cdk.Stack {
  /**
   * The VPC ID
   */
  public readonly vpcId;
  /**
   * The public subnet ID
   */
  public readonly publicSubnetId;
  /**
   * The first private subnet ID
   */
  public readonly privateSubnet1Id;
  /**
   * The second private subnet ID
   */
  public readonly privateSubnet2Id;
  /**
   * The endpoint of the RDS instance
   */
  public readonly rdsInstanceEndpoint;
  /**
   * The port of the RDS instance
   */
  public readonly rdsInstancePort;

  public constructor(scope: cdk.App, id: string, props: CdkStackProps) {
    super(scope, id, props);

    // Applying default props
    props = {
      ...props,
      environment: props.environment ?? 'Production',
    };

    // Resources
    const amazonEc2ContainerServiceAutoscaleRole = new iam.CfnRole(this, 'AmazonEC2ContainerServiceAutoscaleRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'application-autoscaling.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      path: '/',
      policies: [
        {
          policyName: 'ECSAutoScalingPolicy',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'cloudwatch:DescribeAlarms',
                  'cloudwatch:PutMetricAlarm',
                  'cloudwatch:DeleteAlarms',
                  'ecs:UpdateService',
                  'ecs:DescribeServices',
                ],
                Resource: '*',
              },
            ],
          },
        },
      ],
    });

    const apiGatewayRestApi = new apigateway.CfnRestApi(this, 'ApiGatewayRestApi', {
      name: 'odata-api',
      description: 'OData API Gateway',
      endpointConfiguration: {
        types: [
          'PRIVATE',
        ],
      },
    });

    const authorizerLambdaRole = new iam.CfnRole(this, 'AuthorizerLambdaRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'lambda.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      policies: [
        {
          policyName: 'LambdaExecutionPolicy',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'logs:CreateLogGroup',
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                ],
                Resource: 'arn:aws:logs:*:*:*',
              },
              {
                Effect: 'Allow',
                Action: [
                  'lambda:InvokeFunction',
                ],
                Resource: '*',
              },
              {
                Effect: 'Allow',
                Action: [
                  'iam:PassRole',
                ],
                Resource: `arn:aws:iam::${this.account}:role/*`,
              },
            ],
          },
        },
      ],
    });

    const bastionHostRole = new iam.CfnRole(this, 'BastionHostRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'ec2.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      path: '/',
      managedPolicyArns: [
        'arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore',
      ],
      policies: [
        {
          policyName: 'SSMAccessPolicy',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'ssm:*',
                  'ec2messages:*',
                  'ssm:DescribeInstanceInformation',
                ],
                Resource: '*',
              },
              {
                Effect: 'Allow',
                Action: [
                  'ssmmessages:CreateControlChannel',
                  'ssmmessages:CreateDataChannel',
                  'ssmmessages:OpenControlChannel',
                  'ssmmessages:OpenDataChannel',
                ],
                Resource: '*',
              },
              {
                Effect: 'Allow',
                Action: [
                  's3:GetEncryptionConfiguration',
                ],
                Resource: '*',
              },
              {
                Effect: 'Allow',
                Action: [
                  'kms:Decrypt',
                ],
                Resource: '*',
              },
            ],
          },
        },
        {
          policyName: 'SecretsManagerPolicy',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'secretsmanager:GetSecretValue',
                  'secretsmanager:DescribeSecret',
                ],
                Resource: '*',
              },
            ],
          },
        },
      ],
    });

    const ecs = new ecs.CfnCluster(this, 'ECS', {
    });

    const ecsExecutionRole = new iam.CfnRole(this, 'ECSExecutionRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'ecs-tasks.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      path: '/',
      policies: [
        {
          policyName: 'ECSExecutionPolicy',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'ecr:GetDownloadUrlForLayer',
                  'ecr:BatchGetImage',
                  'ecr:GetAuthorizationToken',
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                  'secretsmanager:GetSecretValue',
                  'secretsmanager:DescribeSecret',
                ],
                Resource: '*',
              },
            ],
          },
        },
      ],
    });

    const ecsServiceRole = new iam.CfnRole(this, 'ECSServiceRole', {
      assumeRolePolicyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              Service: 'ecs-tasks.amazonaws.com',
            },
            Action: 'sts:AssumeRole',
          },
        ],
      },
      path: '/',
      policies: [
        {
          policyName: 'ECSServicePolicy',
          policyDocument: {
            Version: '2012-10-17',
            Statement: [
              {
                Effect: 'Allow',
                Action: [
                  'ecs:CreateCluster',
                  'ecs:DeregisterContainerInstance',
                  'ecs:DiscoverPollEndpoint',
                  'ecs:Poll',
                  'ecs:RegisterContainerInstance',
                  'ecs:StartTelemetrySession',
                  'ecs:Submit*',
                  'ec2:AuthorizeSecurityGroupIngress',
                  'ec2:Describe*',
                  'ec2:RevokeSecurityGroupIngress',
                  'elasticloadbalancing:DeregisterInstancesFromLoadBalancer',
                  'elasticloadbalancing:Describe*',
                  'elasticloadbalancing:RegisterInstancesWithLoadBalancer',
                  'logs:CreateLogStream',
                  'logs:PutLogEvents',
                  'secretsmanager:GetSecretValue',
                  'secretsmanager:DescribeSecret',
                ],
                Resource: '*',
              },
            ],
          },
        },
      ],
    });

    const eip = new ec2.CfnEIP(this, 'EIP', {
      domain: 'vpc',
    });

    const internetGateway = new ec2.CfnInternetGateway(this, 'InternetGateway', {
      tags: [
        {
          key: 'Name',
          value: 'ODataInternetGateway',
        },
      ],
    });

    const sampleLogGroup = new logs.CfnLogGroup(this, 'SampleLogGroup', {
      logGroupName: '/ecs/odata-sample',
      retentionInDays: 7,
    });

    const vpc = new ec2.CfnVPC(this, 'VPC', {
      cidrBlock: '10.0.0.0/16',
      enableDnsSupport: true,
      enableDnsHostnames: true,
      tags: [
        {
          key: 'Name',
          value: 'ODataVPC',
        },
      ],
    });

    const apiGatewayResource = new apigateway.CfnResource(this, 'ApiGatewayResource', {
      parentId: apiGatewayRestApi.attrRootResourceId,
      pathPart: 'odata',
      restApiId: apiGatewayRestApi.ref,
    });

    const attachGateway = new ec2.CfnVPCGatewayAttachment(this, 'AttachGateway', {
      vpcId: vpc.ref,
      internetGatewayId: internetGateway.ref,
    });

    const authorizerLambda = new lambda.CfnFunction(this, 'AuthorizerLambda', {
      handler: 'index.handler',
      role: authorizerLambdaRole.attrArn,
      runtime: 'nodejs20.x',
      code: {
        zipFile: 'exports.handler = async function(event) {\n  return {\n    principalId: \'user\',\n    policyDocument: {\n      Version: \'2012-10-17\',\n      Statement: [\n        {\n          Action: \'execute-api:Invoke\',\n          Effect: \'Allow\',\n          Resource: event.methodArn\n        }\n      ]\n    }\n  };\n};\n',
      },
    });

    const bastionHostInstanceProfile = new iam.CfnInstanceProfile(this, 'BastionHostInstanceProfile', {
      roles: [
        bastionHostRole.ref,
      ],
    });

    const bastionSecurityGroup = new ec2.CfnSecurityGroup(this, 'BastionSecurityGroup', {
      groupDescription: 'Bastion Host Security Group',
      vpcId: vpc.ref,
      securityGroupIngress: [
        {
          ipProtocol: 'tcp',
          fromPort: 22,
          toPort: 22,
          cidrIp: '0.0.0.0/0',
        },
        {
          ipProtocol: 'tcp',
          fromPort: 443,
          toPort: 443,
          cidrIp: '0.0.0.0/0',
        },
        {
          ipProtocol: 'tcp',
          fromPort: 80,
          toPort: 80,
          cidrIp: '0.0.0.0/0',
        },
      ],
      securityGroupEgress: [
        {
          ipProtocol: -1,
          cidrIp: '0.0.0.0/0',
        },
      ],
    });

    const loadBalancerSecurityGroup = new ec2.CfnSecurityGroup(this, 'LoadBalancerSecurityGroup', {
      groupDescription: 'NLB Security Group',
      vpcId: vpc.ref,
      securityGroupIngress: [
        {
          ipProtocol: 'tcp',
          fromPort: 80,
          toPort: 80,
          cidrIp: '0.0.0.0/0',
        },
      ],
      securityGroupEgress: [
        {
          ipProtocol: 'tcp',
          fromPort: 5024,
          toPort: 5024,
          cidrIp: '0.0.0.0/0',
        },
      ],
    });

    const oDataTargetGroup = new elasticloadbalancingv2.CfnTargetGroup(this, 'ODataTargetGroup', {
      name: 'odata-target-group',
      targetType: 'ip',
      port: 5024,
      protocol: 'TCP',
      vpcId: vpc.ref,
      healthCheckProtocol: 'TCP',
      healthCheckPort: 5024,
      healthCheckIntervalSeconds: 120,
      healthCheckTimeoutSeconds: 30,
      healthyThresholdCount: 5,
      unhealthyThresholdCount: 2,
    });

    const privateRouteTable1 = new ec2.CfnRouteTable(this, 'PrivateRouteTable1', {
      vpcId: vpc.ref,
      tags: [
        {
          key: 'Name',
          value: 'PrivateRouteTable1',
        },
      ],
    });

    const privateRouteTable2 = new ec2.CfnRouteTable(this, 'PrivateRouteTable2', {
      vpcId: vpc.ref,
      tags: [
        {
          key: 'Name',
          value: 'PrivateRouteTable2',
        },
      ],
    });

    const privateSubnet1 = new ec2.CfnSubnet(this, 'PrivateSubnet1', {
      vpcId: vpc.ref,
      cidrBlock: '10.0.1.0/24',
      availabilityZone: cdk.Fn.select(0, cdk.Fn.getAzs('')),
      mapPublicIpOnLaunch: false,
      tags: [
        {
          key: 'Name',
          value: 'PrivateSubnet1',
        },
      ],
    });

    const privateSubnet1NetworkAcl = new ec2.CfnNetworkAcl(this, 'PrivateSubnet1NetworkAcl', {
      vpcId: vpc.ref,
      tags: [
        {
          key: 'Name',
          value: 'PrivateSubnet1NetworkAcl',
        },
      ],
    });

    const privateSubnet2 = new ec2.CfnSubnet(this, 'PrivateSubnet2', {
      vpcId: vpc.ref,
      cidrBlock: '10.0.2.0/24',
      availabilityZone: cdk.Fn.select(1, cdk.Fn.getAzs('')),
      mapPublicIpOnLaunch: false,
      tags: [
        {
          key: 'Name',
          value: 'PrivateSubnet2',
        },
      ],
    });

    const privateSubnet2NetworkAcl = new ec2.CfnNetworkAcl(this, 'PrivateSubnet2NetworkAcl', {
      vpcId: vpc.ref,
      tags: [
        {
          key: 'Name',
          value: 'PrivateSubnet2NetworkAcl',
        },
      ],
    });

    const publicRouteTable = new ec2.CfnRouteTable(this, 'PublicRouteTable', {
      vpcId: vpc.ref,
      tags: [
        {
          key: 'Name',
          value: 'PublicRouteTable',
        },
      ],
    });

    const publicSubnet = new ec2.CfnSubnet(this, 'PublicSubnet', {
      vpcId: vpc.ref,
      cidrBlock: '10.0.0.0/24',
      availabilityZone: cdk.Fn.select(0, cdk.Fn.getAzs('')),
      mapPublicIpOnLaunch: true,
      tags: [
        {
          key: 'Name',
          value: 'PublicSubnet',
        },
      ],
    });

    const secretsManagerPolicy = new iam.CfnPolicy(this, 'SecretsManagerPolicy', {
      policyName: 'SecretsManagerPolicy',
      roles: [
        ecsServiceRole.ref,
      ],
      policyDocument: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: [
              'secretsmanager:GetSecretValue',
            ],
            Resource: `arn:aws:secretsmanager:${this.region}:${this.account}:secret:Sample/Production/DB/Connection-*`,
          },
        ],
      },
    });

    const vpcSecretsManagerEndpointSg = new ec2.CfnSecurityGroup(this, 'VPCSecretsManagerEndpointSG', {
      groupDescription: 'VPC Endpoint Security Group',
      vpcId: vpc.ref,
      securityGroupIngress: [
        {
          ipProtocol: 'tcp',
          fromPort: 443,
          toPort: 443,
          cidrIp: '0.0.0.0/0',
        },
      ],
    });

    const apiGatewayAuthorizer = new apigateway.CfnAuthorizer(this, 'ApiGatewayAuthorizer', {
      name: 'Authorizer',
      type: 'TOKEN',
      authorizerUri: [
        'arn:aws:apigateway:',
        this.region,
        ':lambda:path/2015-03-31/functions/',
        authorizerLambda.attrArn,
        '/invocations',
      ].join(''),
      identitySource: 'method.request.header.Authorization',
      restApiId: apiGatewayRestApi.ref,
    });

    const apiGatewayVpcEndpoint = new ec2.CfnVPCEndpoint(this, 'ApiGatewayVPCEndpoint', {
      serviceName: `com.amazonaws.${this.region}.execute-api`,
      vpcId: vpc.ref,
      vpcEndpointType: 'Interface',
      privateDnsEnabled: true,
      subnetIds: [
        privateSubnet1.ref,
        privateSubnet2.ref,
      ],
      securityGroupIds: [
        vpcSecretsManagerEndpointSg.ref,
      ],
    });

    const bastionHost = new ec2.CfnInstance(this, 'BastionHost', {
      instanceType: 't2.micro',
      imageId: 'ami-0b72821e2f351e396',
      iamInstanceProfile: bastionHostInstanceProfile.ref,
      networkInterfaces: [
        {
          associatePublicIpAddress: false,
          deviceIndex: '0',
          groupSet: [
            bastionSecurityGroup.ref,
          ],
          subnetId: privateSubnet1.ref,
        },
      ],
      tags: [
        {
          key: 'Name',
          value: 'BastionHost',
        },
      ],
    });
    bastionHost.cfnOptions.metadata = {
      AWS::CloudFormation::Init: {
        config: {
          packages: {
            yum: {
              'amazon-ssm-agent': [
              ],
            },
          },
          services: {
            sysvinit: {
              'amazon-ssm-agent': {
                enabled: true,
                ensureRunning: true,
              },
            },
          },
        },
      },
    };

    const dbSubnetGroup = new rds.CfnDBSubnetGroup(this, 'DBSubnetGroup', {
      dbSubnetGroupDescription: 'Subnet group for RDS instance',
      subnetIds: [
        privateSubnet1.ref,
        privateSubnet2.ref,
      ],
    });

    const ecsClusterSecurityGroup = new ec2.CfnSecurityGroup(this, 'ECSClusterSecurityGroup', {
      groupDescription: 'ECS Cluster Security Group',
      vpcId: vpc.ref,
      securityGroupIngress: [
        {
          ipProtocol: 'tcp',
          fromPort: 5024,
          toPort: 5024,
          sourceSecurityGroupId: loadBalancerSecurityGroup.ref,
        },
      ],
      securityGroupEgress: [
        {
          ipProtocol: -1,
          cidrIp: '0.0.0.0/0',
        },
      ],
    });

    const lambdaPermission = new lambda.CfnPermission(this, 'LambdaPermission', {
      action: 'lambda:InvokeFunction',
      functionName: authorizerLambda.ref,
      principal: 'apigateway.amazonaws.com',
    });

    const nlb = new elasticloadbalancingv2.CfnLoadBalancer(this, 'NLB', {
      name: 'odata-nlb',
      subnets: [
        privateSubnet1.ref,
        privateSubnet2.ref,
      ],
      scheme: 'internal',
      type: 'network',
    });

    const natGateway = new ec2.CfnNatGateway(this, 'NatGateway', {
      subnetId: publicSubnet.ref,
      allocationId: eip.attrAllocationId,
    });

    const privateSubnet1NetworkAclEntryInbound = new ec2.CfnNetworkAclEntry(this, 'PrivateSubnet1NetworkAclEntryInbound', {
      networkAclId: privateSubnet1NetworkAcl.ref,
      ruleNumber: 100,
      protocol: -1,
      ruleAction: 'ALLOW',
      egress: false,
      cidrBlock: '0.0.0.0/0',
      portRange: {
        from: 5024,
        to: 5024,
      },
    });

    const privateSubnet1NetworkAclEntryOutbound = new ec2.CfnNetworkAclEntry(this, 'PrivateSubnet1NetworkAclEntryOutbound', {
      networkAclId: privateSubnet1NetworkAcl.ref,
      ruleNumber: 200,
      protocol: -1,
      ruleAction: 'ALLOW',
      egress: true,
      cidrBlock: '0.0.0.0/0',
      portRange: {
        from: 1024,
        to: 65535,
      },
    });

    const privateSubnet1RouteTableAssociation = new ec2.CfnSubnetRouteTableAssociation(this, 'PrivateSubnet1RouteTableAssociation', {
      subnetId: privateSubnet1.ref,
      routeTableId: privateRouteTable1.ref,
    });

    const privateSubnet2NetworkAclEntryInbound = new ec2.CfnNetworkAclEntry(this, 'PrivateSubnet2NetworkAclEntryInbound', {
      networkAclId: privateSubnet2NetworkAcl.ref,
      ruleNumber: 100,
      protocol: -1,
      ruleAction: 'ALLOW',
      egress: false,
      cidrBlock: '0.0.0.0/0',
      portRange: {
        from: 5024,
        to: 5024,
      },
    });

    const privateSubnet2NetworkAclEntryOutbound = new ec2.CfnNetworkAclEntry(this, 'PrivateSubnet2NetworkAclEntryOutbound', {
      networkAclId: privateSubnet2NetworkAcl.ref,
      ruleNumber: 200,
      protocol: -1,
      ruleAction: 'ALLOW',
      egress: true,
      cidrBlock: '0.0.0.0/0',
      portRange: {
        from: 1024,
        to: 65535,
      },
    });

    const privateSubnet2RouteTableAssociation = new ec2.CfnSubnetRouteTableAssociation(this, 'PrivateSubnet2RouteTableAssociation', {
      subnetId: privateSubnet2.ref,
      routeTableId: privateRouteTable2.ref,
    });

    const publicRoute = new ec2.CfnRoute(this, 'PublicRoute', {
      routeTableId: publicRouteTable.ref,
      destinationCidrBlock: '0.0.0.0/0',
      gatewayId: internetGateway.ref,
    });

    const publicSubnetRouteTableAssociation = new ec2.CfnSubnetRouteTableAssociation(this, 'PublicSubnetRouteTableAssociation', {
      subnetId: publicSubnet.ref,
      routeTableId: publicRouteTable.ref,
    });

    const sampleTaskDefinition = new ecs.CfnTaskDefinition(this, 'SampleTaskDefinition', {
      family: 'odata-sample',
      networkMode: 'awsvpc',
      containerDefinitions: [
        {
          name: 'odata-app-container',
          image: `${this.account}.dkr.ecr.${this.region}.amazonaws.com/odata-sample:latest`,
          essential: true,
          portMappings: [
            {
              containerPort: 5024,
            },
          ],
          environment: [
            {
              name: 'ASPNETCORE_ENVIRONMENT',
              value: props.environment!,
            },
            {
              name: 'AWS_REGION',
              value: this.region,
            },
            {
              name: 'SECRETS_MANAGER_SECRET_NAME',
              value: 'Sample/Production/DB/Connection',
            },
          ],
          logConfiguration: {
            logDriver: 'awslogs',
            options: {
              'awslogs-group': '/ecs/odata-sample',
              'awslogs-region': 'us-east-1',
              'awslogs-stream-prefix': 'odata',
            },
          },
        },
      ],
      requiresCompatibilities: [
        'FARGATE',
      ],
      cpu: '256',
      memory: '512',
      executionRoleArn: ecsExecutionRole.attrArn,
      taskRoleArn: ecsServiceRole.attrArn,
      runtimePlatform: {
        cpuArchitecture: 'ARM64',
        operatingSystemFamily: 'LINUX',
      },
    });
    sampleTaskDefinition.addDependency(secretsManagerPolicy);
    sampleTaskDefinition.addDependency(ecsExecutionRole);
    sampleTaskDefinition.addDependency(ecsServiceRole);

    const vpcSecretsManagerEndpoint = new ec2.CfnVPCEndpoint(this, 'VPCSecretsManagerEndpoint', {
      vpcId: vpc.ref,
      serviceName: `com.amazonaws.${this.region}.secretsmanager`,
      vpcEndpointType: 'Interface',
      subnetIds: [
        privateSubnet1.ref,
        privateSubnet2.ref,
      ],
      securityGroupIds: [
        vpcSecretsManagerEndpointSg.ref,
      ],
    });

    const oDataListenerTcp = new elasticloadbalancingv2.CfnListener(this, 'ODataListenerTCP', {
      defaultActions: [
        {
          type: 'forward',
          targetGroupArn: oDataTargetGroup.ref,
        },
      ],
      loadBalancerArn: nlb.ref,
      port: 80,
      protocol: 'TCP',
    });

    const privateRoute1ToNatGateway = new ec2.CfnRoute(this, 'PrivateRoute1ToNatGateway', {
      routeTableId: privateRouteTable1.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: natGateway.ref,
    });

    const privateRoute2ToNatGateway = new ec2.CfnRoute(this, 'PrivateRoute2ToNatGateway', {
      routeTableId: privateRouteTable2.ref,
      destinationCidrBlock: '0.0.0.0/0',
      natGatewayId: natGateway.ref,
    });

    const rdsSecurityGroup = new ec2.CfnSecurityGroup(this, 'RDSSecurityGroup', {
      groupDescription: 'RDS Security Group',
      vpcId: vpc.ref,
      securityGroupIngress: [
        {
          ipProtocol: 'tcp',
          fromPort: 3306,
          toPort: 3306,
          sourceSecurityGroupId: ecsClusterSecurityGroup.ref,
        },
      ],
      securityGroupEgress: [
        {
          ipProtocol: -1,
          cidrIp: '0.0.0.0/0',
        },
      ],
    });

    const vpcLink = new apigateway.CfnVpcLink(this, 'VPCLink', {
      name: 'ODataVpcLink',
      targetArns: [
        nlb.ref,
      ],
    });

    const apiGatewayMethod = new apigateway.CfnMethod(this, 'ApiGatewayMethod', {
      authorizationType: 'CUSTOM',
      authorizerId: apiGatewayAuthorizer.ref,
      httpMethod: 'ANY',
      resourceId: apiGatewayResource.ref,
      restApiId: apiGatewayRestApi.ref,
      integration: {
        connectionType: 'VPC_LINK',
        connectionId: vpcLink.ref,
        integrationHttpMethod: 'ANY',
        type: 'HTTP_PROXY',
        uri: `http://${nlb.attrDnsName}/odata`,
      },
    });

    const rdsMySql = new rds.CfnDBInstance(this, 'RDSMySQL', {
      allocatedStorage: '5',
      dbInstanceClass: 'db.t3.micro',
      dbInstanceIdentifier: 'db',
      engine: 'mysql',
      engineVersion: '8.0.33',
      masterUsername: 'admin',
      masterUserPassword: props.dbPassword!,
      dbName: 'test',
      vpcSecurityGroups: [
        rdsSecurityGroup.ref,
      ],
      dbSubnetGroupName: dbSubnetGroup.ref,
      publiclyAccessible: false,
      multiAz: false,
      deletionProtection: false,
    });
    rdsMySql.cfnOptions.deletionPolicy = cdk.CfnDeletionPolicy.DELETE;

    const secretsManagerSecret = new secretsmanager.CfnSecret(this, 'SecretsManagerSecret', {
      name: 'Sample/Production/DB/Connection',
      description: 'Database connection string',
      secretString: `{"Server":"${rdsMySql.attrEndpointAddress}","Database":"test","User":"admin","Password":"${props.dbPassword!}"}`,
    });

    const sampleService = new ecs.CfnService(this, 'SampleService', {
      cluster: ecs.ref,
      desiredCount: 1,
      launchType: 'FARGATE',
      taskDefinition: sampleTaskDefinition.ref,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: [
            privateSubnet1.ref,
            privateSubnet2.ref,
          ],
          securityGroups: [
            ecsClusterSecurityGroup.ref,
          ],
          assignPublicIp: 'DISABLED',
        },
      },
      loadBalancers: [
        {
          containerName: 'odata-app-container',
          containerPort: 5024,
          targetGroupArn: oDataTargetGroup.ref,
        },
      ],
    });
    sampleService.addDependency(oDataListenerTcp);
    sampleService.addDependency(ecsServiceRole);
    sampleService.addDependency(ecsExecutionRole);
    sampleService.addDependency(secretsManagerSecret);

    const ecsServiceScalingTarget = new applicationautoscaling.CfnScalableTarget(this, 'ECSServiceScalingTarget', {
      maxCapacity: 10,
      minCapacity: 1,
      resourceId: [
        'service/',
        ecs.ref,
        '/',
        sampleService.ref,
      ].join(''),
      roleArn: amazonEc2ContainerServiceAutoscaleRole.attrArn,
      scalableDimension: 'ecs:service:DesiredCount',
      serviceNamespace: 'ecs',
    });
    ecsServiceScalingTarget.addDependency(amazonEc2ContainerServiceAutoscaleRole);

    const autoScalingPolicy = new applicationautoscaling.CfnScalingPolicy(this, 'AutoScalingPolicy', {
      policyName: 'odata-scaling-policy',
      policyType: 'TargetTrackingScaling',
      scalingTargetId: ecsServiceScalingTarget.ref,
      targetTrackingScalingPolicyConfiguration: {
        predefinedMetricSpecification: {
          predefinedMetricType: 'ECSServiceAverageCPUUtilization',
        },
        targetValue: 50,
      },
    });
    autoScalingPolicy.addDependency(ecsServiceScalingTarget);

    // Outputs
    this.vpcId = vpc.ref;
    new cdk.CfnOutput(this, 'CfnOutputVPCId', {
      key: 'VPCId',
      description: 'The VPC ID',
      value: this.vpcId!.toString(),
    });
    this.publicSubnetId = publicSubnet.ref;
    new cdk.CfnOutput(this, 'CfnOutputPublicSubnetId', {
      key: 'PublicSubnetId',
      description: 'The public subnet ID',
      value: this.publicSubnetId!.toString(),
    });
    this.privateSubnet1Id = privateSubnet1.ref;
    new cdk.CfnOutput(this, 'CfnOutputPrivateSubnet1Id', {
      key: 'PrivateSubnet1Id',
      description: 'The first private subnet ID',
      value: this.privateSubnet1Id!.toString(),
    });
    this.privateSubnet2Id = privateSubnet2.ref;
    new cdk.CfnOutput(this, 'CfnOutputPrivateSubnet2Id', {
      key: 'PrivateSubnet2Id',
      description: 'The second private subnet ID',
      value: this.privateSubnet2Id!.toString(),
    });
    this.rdsInstanceEndpoint = rdsMySql.attrEndpointAddress;
    new cdk.CfnOutput(this, 'CfnOutputRDSInstanceEndpoint', {
      key: 'RDSInstanceEndpoint',
      description: 'The endpoint of the RDS instance',
      value: this.rdsInstanceEndpoint!.toString(),
    });
    this.rdsInstancePort = rdsMySql.attrEndpointPort;
    new cdk.CfnOutput(this, 'CfnOutputRDSInstancePort', {
      key: 'RDSInstancePort',
      description: 'The port of the RDS instance',
      value: this.rdsInstancePort!.toString(),
    });
  }
}
