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
      'package:createDeploymentArtifacts': this.packageCreateDeploymentArtifacts.bind(this),
      'package:compileEvents': this.packageCompileEvents.bind(this),
      'after:deploy:deploy': this.afterDeployDeploy.bind(this),
    };
  }

  static getFunctionName() {
    return 'papertrailLogger';
  }

  static getFunctionFilename() {
    return 'papertrail-logger-function';
  }

  getEnvFilePath() {
    return path.join(this.serverless.config.servicePath, this.getFunctionFilename());
  }

  packageCreateDeploymentArtifacts() {
    this.serverless.cli.log('Creating temporary logger function...');
    let functionPath = this.getEnvFilePath();

    if (!fs.existsSync(functionPath)) {
      fs.mkdirSync(functionPath);
    }

    _.merge(
      this.service.provider.compiledCloudFormationTemplate.Resources,
      {
        PapertrailLoggerLogGroup: {
          Type: "AWS::Logs::LogGroup",
          Properties: {
            LogGroupName: `/aws/lambda/${this.service.service}-${this.service.provider.stage}-${this.getFunctionName()}`
          }
        }
      }
    );

    let templatePath = path.resolve(__dirname, './logger.handler.js');
    let templateFile = fs.readFileSync(templatePath, 'utf-8');

    let handlerFunction = templateFile
      .replace('%papertrailPort%', this.service.custom.papertrail.port)
      .replace('%papertrailHostname%', this.service.service)
      .replace('%papertrailProgram%', this.service.provider.stage);
    fs.writeFileSync(path.join(functionPath, 'handler.js'), handlerFunction);
    this.service.functions[this.getFunctionName()] = {
      handler: `${this.getFunctionFilename()}/handler.handler`,
      name: `${this.service.service}-${this.service.provider.stage}-${this.getFunctionName()}`,
      tags: _.has(this.service.provider, 'stackTags') ? this.service.provider.stackTags : {},
      events: []
    };
  }

  packageCompileEvents() {
    this.serverless.cli.log('Creating log subscriptions...');

    const loggerLogicalId = this.provider.naming.getLambdaLogicalId(this.getFunctionName());

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
          DependsOn: [loggerLogicalId]
        }
      }
    );

    const functions = this.service.getAllFunctions();
    functions.forEach((functionName) => {
      if (functionName !== this.getFunctionName()) {
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
              DependsOn: ['LambdaPermissionForSubscription']
            }
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
