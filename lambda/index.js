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

async function getEntityResponsesFromDynamoDB() {
  const params = {
    TableName: 'EntityResponses'
  };

  try {
    const response = await dynamodb.scan(params).promise();
    const entities = response.Items;
    return entities;
  } catch (error) {
    console.error('Error fetching entities from DynamoDB:', error);
    throw error;
  }
}

// Read the CSV file from S3 and write the data to Conversations table in DynamoDB.
exports.handler = async (event) => {
  const bucketName = event.Records[0].s3.bucket.name;
  const key = event.Records[0].s3.object.key;

  // Read the CSV file from S3.
  const s3Stream = new AWS.S3().getObject({ Bucket: bucketName, Key: key }).createReadStream();

  // Get the entities and responses from DynamoDB.
  const entityResponses = await getEntityResponsesFromDynamoDB();

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

        // Remove special characters from the message
        const sanitizedMessage = message.replace(/[^\w\s]/gi, '').toLowerCase();

        // Determine response based on entities in message. 
        // A message can contain multiple matching entities. e.g. "how are you. can i know my order status please ?"
        // which has two entities "how are you" and "order status".

        let responseMessage = '';
        for (let entityResponse of entityResponses) {
          if (sanitizedMessage.includes(entityResponse.entityId.toLowerCase())) {
            if (responseMessage !== '') {
              responseMessage += ' ';
            }
            let channelResponse = entityResponse[`${channel}Response`];
            channelResponse = channelResponse.replace('{{sender_username}}', sender_username);
            channelResponse = channelResponse.replace('{{receiver_username}}', receiver_username);
            responseMessage += channelResponse;
          }
        }

        conversations.push({
          PutRequest: {
            Item: {
              timestamp: new Date().toISOString(),
              messageId,
              conversationId,
              senderUsername: sender_username,
              receiverUsername: receiver_username,
              channel,
              sourceMessage: message,
              responseMessage
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