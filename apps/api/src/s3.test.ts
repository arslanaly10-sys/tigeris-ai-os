// The SigV4 signer matches the AWS Signature Version 4 test suite ("get-vanilla").
import { describe, expect, it } from 'vitest';
import { signV4 } from './connectors/s3';

describe('SigV4 signer', () => {
  it('reproduces the AWS get-vanilla test vector', () => {
    const h = signV4(
      {
        method: 'GET',
        url: new URL('https://example.amazonaws.com/'),
        headers: {},
        body: '',
        service: 'service',
      },
      {
        accessKeyId: 'AKIDEXAMPLE',
        secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
      },
      new Date('2015-08-30T12:36:00Z'),
    );
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
  });
});
