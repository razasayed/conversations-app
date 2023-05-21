const AWS = require('aws-sdk');
const csvParser = require('csv-parser');
const crypto = require('crypto');

const dynamodb = new AWS.DynamoDB.DocumentClient();

const tableName = 'Conversations'; // Name of the DynamoDB table.

function generateConversationId(sender, receiver, channel) {
  // Sort the usernames to ensure that the order does not affect the id.
  const usernames = [sender, receiver].sort();
  // Create a string using the sorted usernames and channel.
  const data = `${usernames[0]}:${usernames[1]}:${channel}`;
  // Generate a SHA256 hash of the string
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return hash;
}

// Read the CSV file from S3 and write the data to Conversations table in DynamoDB.
exports.handler = async (event) => {
  const bucketName = event.Records[0].s3.bucket.name;
  const key = event.Records[0].s3.object.key;

  // Read the CSV file from S3.
  const s3Stream = new AWS.S3().getObject({ Bucket: bucketName, Key: key }).createReadStream();

  return new Promise((resolve, reject) => {
    const conversations = [];
    s3Stream
      .pipe(csvParser())
      .on('data', (data) => {
        const { sender_username, receiver_username, channel, message } = data;

        // Generate a unique conversation ID using sender username, receiver username, and channel.
        const conversationId = generateConversationId(sender_username, receiver_username, channel);

        // Generate a unique message ID using current timestamp and a random number.
        const messageId = crypto.createHash('sha256').update(new Date().toISOString() + Math.random().toString()).digest('hex');

        conversations.push({
          PutRequest: {
            Item: {
              timestamp: new Date().toISOString(),
              messageId,
              conversationId,
              senderUsername: sender_username,
              receiverUsername: receiver_username,
              channel,
              sourceMessage: message
            }
          }
        });
      })
      .on('end', () => {
        if (conversations.length === 0) {
          resolve();
          return;
        }

        // Batch write conversations to DynamoDB.
        const params = {
          RequestItems: {
            [tableName]: conversations
          }
        };

        dynamodb.batchWrite(params, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      })
      .on('error', (err) => {
        reject(err);
      });
  });
};