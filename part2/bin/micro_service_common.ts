#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { MicroServiceCommonStack } from '../lib/micro_service_common-stack';

const app = new cdk.App();
new MicroServiceCommonStack(app, 'MicroServiceCommon-p2');
