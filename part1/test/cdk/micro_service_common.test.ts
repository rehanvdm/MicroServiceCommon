import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as MicroServiceCommon from '../../lib/micro_service_common-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new MicroServiceCommon.MicroServiceCommonStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
