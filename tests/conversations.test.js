const AWSMock = require('aws-sdk-mock');
const request = require('supertest');

AWSMock.mock('DynamoDB.DocumentClient', 'scan', (params, callback) => {
    // Check if pagination is enabled
    if (params.ExclusiveStartKey && params.ExclusiveStartKey.conversationId === '456') {
        callback(null, {
            Items: [
                { conversationId: '789' }
            ],
        });
    } else {
        callback(null, {
            Items: [
                { conversationId: '123' },
                { conversationId: '456' },
                { conversationId: '789' }
            ]
        });
    }
});

AWSMock.mock('DynamoDB.DocumentClient', 'query', (params, callback) => {
    const conversationId = params.ExpressionAttributeValues[':id'];

    if (conversationId === 'existingId') {
        callback(null, {
            Count: 2,
            Items: [
                {
                    sourceMessage: "Hi! I'd like to share my customer feedback and testimonials about your products and services. How can I proceed?",
                    receiverUsername: "@isaacadams",
                    messageId: "3ea42bb274e537729f25689dcb7de7103ba3fb0832bd21f59e9c266a2dddd026",
                    timestamp: "2023-05-22T17:13:37.751Z",
                    responseMessage: "Hey @oliviaclark, we're glad to hear that you'd like to share your feedback with us on WhatsApp. Please send us a message with your thoughts, suggestions, or concerns, and we'll be happy to assist you further. We appreciate your feedback!",
                    conversationId: "22a7a772ddbe929126004001dcbf185439a6f834e74b93a7bf8cdf528d79f68e",
                    senderUsername: "@oliviaclark",
                    channel: "whatsapp"
                },
                {
                    sourceMessage: "Hello! I have a question about your new product release. Can you provide more information?",
                    receiverUsername: "@johnsmith",
                    messageId: "6bfe6d025d3a2e3e5b58e53ddcb8b876217eb9876c895ae109a1a6bbcbc82a18",
                    timestamp: "2023-05-21T10:25:45.123Z",
                    responseMessage: "Hi @maryjohnson, thank you for your interest in our new product. We'd be happy to provide you with more information. Could you please let us know which specific details you would like to know?",
                    conversationId: "3f56a0c6f2c3a4508b9b79c68dd463bd17f3a6e928c3c8eac34e30b74e215f48",
                    senderUsername: "@maryjohnson",
                    channel: "email"
                }
            ]
        });
    } else if (conversationId === 'errorId') {
        const error = new Error('DynamoDB Error');
        callback(error);
    } else {
        callback(null, {
            Count: 0,
            Items: []
        });
    }
});

const app = require('../app');

describe('GET /conversation', () => {
    it('should return list of conversations without pagination', async () => {
        const res = await request(app).get('/conversation')
            .expect(200)
            .expect('Content-Type', /json/);
        
        expect(res.body).toEqual({
            conversations: ['123', '456', '789']
        });
    }, 30000);

    it('should return list of conversations with pagination', async () => {
        const res = await request(app).get('/conversation?startKey=' + encodeURIComponent(JSON.stringify({ conversationId: '456' })))
            .expect(200)
            .expect('Content-Type', /json/);
        
        expect(res.body).toEqual({
            conversations: ['789']
        });
    }, 10000);
});

describe('GET /conversation/:id/chat', () => {
    it('should return list of messages for a conversation', async () => {
        const res = await request(app).get('/conversation/existingId/chat')
            .expect(200)
            .expect('Content-Type', /json/);
        
        expect(res.body).toEqual({
            messages: [
                {
                    sourceMessage: "Hi! I'd like to share my customer feedback and testimonials about your products and services. How can I proceed?",
                    receiverUsername: "@isaacadams",
                    messageId: "3ea42bb274e537729f25689dcb7de7103ba3fb0832bd21f59e9c266a2dddd026",
                    timestamp: "2023-05-22T17:13:37.751Z",
                    responseMessage: "Hey @oliviaclark, we're glad to hear that you'd like to share your feedback with us on WhatsApp. Please send us a message with your thoughts, suggestions, or concerns, and we'll be happy to assist you further. We appreciate your feedback!",
                    conversationId: "22a7a772ddbe929126004001dcbf185439a6f834e74b93a7bf8cdf528d79f68e",
                    senderUsername: "@oliviaclark",
                    channel: "whatsapp"
                },
                {
                    sourceMessage: "Hello! I have a question about your new product release. Can you provide more information?",
                    receiverUsername: "@johnsmith",
                    messageId: "6bfe6d025d3a2e3e5b58e53ddcb8b876217eb9876c895ae109a1a6bbcbc82a18",
                    timestamp: "2023-05-21T10:25:45.123Z",
                    responseMessage: "Hi @maryjohnson, thank you for your interest in our new product. We'd be happy to provide you with more information. Could you please let us know which specific details you would like to know?",
                    conversationId: "3f56a0c6f2c3a4508b9b79c68dd463bd17f3a6e928c3c8eac34e30b74e215f48",
                    senderUsername: "@maryjohnson",
                    channel: "email"
                }
            ]
        });
    }, 30000);

    it('should return 404 error for a non-existent conversation', async () => {
        const res = await request(app).get('/conversation/nonexistentId/chat')
            .expect(404)
            .expect('Content-Type', /json/);
        
        expect(res.body).toEqual({error: 'Conversation not found'});
    }, 10000);

    it('should handle DynamoDB errors', async () => {
        const res = await request(app).get('/conversation/errorId/chat')
            .expect(500)
            .expect('Content-Type', /json/);

        expect(res.body).toEqual({
            error: 'DynamoDB Error'
        });
    });
});
