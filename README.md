## serverless-papertrail-logging

[![serverless](http://public.serverless.com/badges/v3.svg)](http://www.serverless.com)
[![Build Status](https://travis-ci.org/keboola/serverless-papertrail-logging.svg?branch=master)](https://travis-ci.org/keboola/serverless-papertrail-logging)
[![Maintainability](https://api.codeclimate.com/v1/badges/af9d714e852ca05d842b/maintainability)](https://codeclimate.com/github/keboola/serverless-papertrail-logging/maintainability)

Serverless plugin for log delivery from CloudWatch Logs to Papertrail using a lambda function with log groups subscription


### Installation

1. Install npm package: `yarn add @keboola/serverless-papertrail-logging --dev`
2. Add plugin to your `serverless.yml`:
```yaml
custom:
  papertrail:
    port: 1234
    
plugins:
- '@keboola/serverless-papertrail-logging'
```
 It must be put before **serverless-webpack** and other similar plugins to work correctly. 