'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');

class PapertrailLogging {
  constructor(serverless) {
    this.serverless = serverless;
    this.service = serverless.service;

    this.provider = this.serverless.getProvider('aws');

    this.hooks = {
      'before:package:createDeploymentArtifacts': this.beforePackageCreateDeploymentArtifacts.bind(this),
      'before:package:compileEvents': this.beforePackageCompileEvents.bind(this),
      'after:deploy:deploy': this.afterDeployDeploy.bind(this),
    };

    if (!_.has(this.service, 'custom.papertrail.port')) {
      throw new this.serverless.classes.Error('Configure Papertrail port in custom.papertrail.port of the serverless.yml');
    }
  }

  static getFunctionName() {
    return 'papertrailLogger';
  }

  getEnvFilePath() {
    return path.join(this.serverless.config.servicePath, PapertrailLogging.getFunctionName());
  }

  beforePackageCreateDeploymentArtifacts() {
    this.serverless.cli.log('Creating temporary logger function...');
    let functionPath = this.getEnvFilePath();

    if (!fs.existsSync(functionPath)) {
      fs.mkdirSync(functionPath);
    }

    const loggerFunctionFullName = `${this.service.service}-${this.service.provider.stage}-${PapertrailLogging.getFunctionName()}`;
    _.merge(
      this.service.provider.compiledCloudFormationTemplate.Resources,
      {
        PapertrailLoggerLogGroup: {
          Type: "AWS::Logs::LogGroup",
          Properties: {
            LogGroupName: `/aws/lambda/${loggerFunctionFullName}`,
          },
        },
      }
    );

    let templatePath = path.resolve(__dirname, './logger.handler.js');
    let templateFile = fs.readFileSync(templatePath, 'utf-8');

    let handlerFunction = templateFile
      .replace('%papertrailHost%', this.service.custom.papertrail.host)
      .replace('%papertrailPort%', this.service.custom.papertrail.port)
      .replace('%papertrailHostname%', this.service.service)
      .replace('%papertrailProgram%', this.service.provider.stage);
    fs.writeFileSync(path.join(functionPath, 'handler.js'), handlerFunction);
    this.service.functions[PapertrailLogging.getFunctionName()] = {
      handler: `${PapertrailLogging.getFunctionName()}/handler.handler`,
      name: loggerFunctionFullName,
      tags: _.has(this.service.provider, 'stackTags') ? this.service.provider.stackTags : {},
      events: [],
    };
  }

  beforePackageCompileEvents() {
    this.serverless.cli.log('Creating log subscriptions...');

    const loggerLogicalId = this.provider.naming.getLambdaLogicalId(PapertrailLogging.getFunctionName());

    _.each(this.service.provider.compiledCloudFormationTemplate.Resources, (item, key) => {
      if (_.has(item, 'Type') && item.Type === 'AWS::Logs::LogGroup') {
        this.service.provider.compiledCloudFormationTemplate.Resources[key].Properties.RetentionInDays = 30;
      }
    });

    _.merge(
      this.service.provider.compiledCloudFormationTemplate.Resources,
      {
        LambdaPermissionForSubscription: {
          Type: 'AWS::Lambda::Permission',
          Properties: {
            FunctionName: { 'Fn::GetAtt': [loggerLogicalId, 'Arn'] },
            Action: 'lambda:InvokeFunction',
            Principal: { 'Fn::Sub': 'logs.${AWS::Region}.amazonaws.com' },
            SourceArn: { 'Fn::Sub': 'arn:aws:logs:${AWS::Region}:${AWS::AccountId}:log-group:/aws/lambda/*' },
          },
          DependsOn: [loggerLogicalId],
        },
      }
    );

    const functions = this.service.getAllFunctions();
    functions.forEach((functionName) => {
      if (functionName !== PapertrailLogging.getFunctionName()) {
        const functionData = this.service.getFunction(functionName);
        const normalizedFunctionName = this.provider.naming.getNormalizedFunctionName(functionName);
        _.merge(
          this.service.provider.compiledCloudFormationTemplate.Resources,
          {
            [`${normalizedFunctionName}SubscriptionFilter`]: {
              Type: 'AWS::Logs::SubscriptionFilter',
              Properties: {
                DestinationArn: { 'Fn::GetAtt': [loggerLogicalId, "Arn"] },
                FilterPattern: '',
                LogGroupName: `/aws/lambda/${functionData.name}`,
              },
              DependsOn: ['LambdaPermissionForSubscription'],
            },
          }
        );
      }
    });
  }

  afterDeployDeploy() {
    this.serverless.cli.log('Removing temporary logger function');
    let functionPath = this.getEnvFilePath();

    try {
      if (fs.existsSync(functionPath)) {
        if (fs.existsSync(path.join(functionPath, 'handler.js'))) {
          fs.unlinkSync(path.join(functionPath, 'handler.js'));
        }
        fs.rmdirSync(functionPath);
      }
    } catch (err) {
      throw new Error(err);
    }
  }
}

module.exports = PapertrailLogging;
