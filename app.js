const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
require('dotenv').config();

// Initialize the Amazon S3 interface
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const app = express();
const upload = multer({ dest: 'temp/' });

// Allowed channels
const allowedChannels = ['instagram', 'facebook', 'whatsapp', 'email'];

// Required number of records in CSV file. TODO: Change this to 1000.
const requiredNumberOfRecords = 2;

app.post('/upload-csv', upload.single('file'), (req, res, next) => {
    let results = [];
    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        // Checking if number of records is as per requirement. TODO: Change to results.length !== requiredNumberOfRecords.
        if (results.length < requiredNumberOfRecords) {
          res.status(400).send(`CSV file should contain exactly ${requiredNumberOfRecords} records`);
          return;
        }
  
        // Checking each record
        for (let i = 0; i < results.length; i++) {
          let record = results[i];
          if (!('sender_username' in record && 'receiver_username' in record && 'message' in record && 'channel' in record)) {
            res.status(400).send(`Invalid CSV format: ${JSON.stringify(record)}`);
            return;
          }
  
          if (!allowedChannels.includes(record.channel)) {
            res.status(400).send('Invalid channel in CSV record');
            return;
          }
        }
  
        // Uploading file to S3 bucket
        const fileContent = fs.readFileSync(req.file.path);
  
        const params = {
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: req.file.originalname, // File name you want to save as in S3
          Body: fileContent
        };
  
        s3.upload(params, function(err, data) {
          if (err) {
            throw err;
          }
  
          res.send(`File uploaded successfully to S3 bucket ${process.env.AWS_BUCKET_NAME}`);
        });
      });
});

app.get('/', (req, res) => {
  res.send('Howdy, World!!');
});

app.listen(3000, () => {
  console.log('Server is listening on port 3000');
});
