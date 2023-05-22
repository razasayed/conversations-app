const request = require('supertest');
const mock = require('mock-fs');
const AWSMock = require('aws-sdk-mock');
const app = require('../app');
const { requiredNumberOfRecords } = require('../config');

jest.mock('../config', () => ({
    requiredNumberOfRecords: 2
}));

const endpoint = '/upload-csv';

beforeEach(() => {
  // Mock file for the 'file' field.
  mock({
    'temp': {
      'test.csv': 'sender_username,receiver_username,message,channel\nuser1,user2,Hello,facebook\nuser2,user1,Hi,whatsapp',
      'invalidFormat.csv': 'username,message,channel\nuser1,testmessage,testchannel\nuser2,testmessage,testchannel',
      'invalidChannel.csv': 'sender_username,receiver_username,message,channel\nuser1,user2,Hello,invalidchannel\nuser2,user1,Hi,whatsapp',
      'invalidNumberOfRecords.csv': 'sender_username,receiver_username,message,channel\nuser1,user2,Hello,facebook'
    }
  });

  // Mock AWS S3 upload function
  AWSMock.mock('S3', 'upload', function (params, callback) {
    callback(null, { Location: 'https://example.com' });
  });
});

afterEach(() => {
  mock.restore();
  
  AWSMock.restore('S3');
});

describe(`POST ${endpoint}`, () => {
  it('should upload a valid CSV and return a successful response', async () => {
    const res = await request(app)
      .post(endpoint)
      .attach('file', 'temp/test.csv')
      .expect('Content-Type', /json/)
      .expect(200);

    expect(res.body).toEqual({message: `File uploaded successfully to S3 bucket ${process.env.AWS_BUCKET_NAME}`});
  });

  it('should return an error response for a CSV with an invalid format', async () => {
    const res = await request(app)
      .post(endpoint)
      .attach('file', 'temp/invalidFormat.csv')
      .expect('Content-Type', /json/)
      .expect(400);

    expect(res.body).toEqual({error: 'Invalid CSV format: {"username":"user1","message":"testmessage","channel":"testchannel"}'});
  });

  it('should return an error response for a CSV with an invalid channel', async () => {
    const res = await request(app)
      .post(endpoint)
      .attach('file', 'temp/invalidChannel.csv')
      .expect('Content-Type', /json/)
      .expect(400);

    expect(res.body).toEqual({error: 'Invalid channel in CSV record: invalidchannel'});
  });

  it('should return an error response for a CSV with too few records', async () => {
    const res = await request(app)
      .post(endpoint)
      .attach('file', 'temp/invalidNumberOfRecords.csv')
      .expect('Content-Type', /json/)
      .expect(400);

    expect(res.body).toEqual({error:`CSV file should contain exactly ${requiredNumberOfRecords} records`});
  });
});
