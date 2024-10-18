const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
app.use(express.json()); // Parse incoming JSON payloads

const MONGO_URI = 'mongodb+srv://Nidhish:Nidhish@coephackathon.pbuvv.mongodb.net/?retryWrites=true&w=majority&appName=CoepHackathon';
const DB_NAME = 'mytestdb';
const REPO_DIR = '/Cloned_repo'; // Directory to clone the repo
const REPOSITORY_NAME = 'Code_Util_COEP'; // Specify the repository name

async function updateMongoIfChanged(filePath, newContent) {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection('mytestcollection');

    // Check if the file is already in MongoDB
    const existingEntry = await collection.findOne({ file_path: filePath });
    
    if (existingEntry) {
      // Compare and update if the content has changed
      if (existingEntry.code_snippet !== newContent) {
        console.log(`Updating content for ${filePath}`);
        await collection.updateOne(
          { file_path: filePath },
          {
            $set: {
              code_snippet: newContent,  // Update code_snippet with new content
              fullplot: 'Auto-generated update', // You can update fullplot if needed
              tags: ['Updated tag'] // Update tags if required
            }
          }
        );
      } else {
        console.log(`No changes detected for ${filePath}`);
      }
    } else {
      console.log(`Inserting new data for ${filePath}`);
      // Insert the new document
      await collection.insertOne({
        repository: REPOSITORY_NAME,
        file_path: filePath,
        code_snippet: newContent, // File content goes here
        fullplot: 'Auto-generated description', // Add a description or plot
        tags: ['Python', 'Sample'] // Add relevant tags
      });
    }
  } finally {
    await client.close();
  }
}

app.post('/webhook', async (req, res) => {
  const payload = req.body;

  // Optionally, verify the event type
  if (req.headers['x-github-event'] === 'push') {
    console.log('Push event received');

    // Pull the latest changes from the repository
    try {
      if (!fs.existsSync(REPO_DIR)) {
        console.log('Cloning repository...');
        execSync(`git clone https://github.com/Nidhish-714/${REPOSITORY_NAME}.git ${REPO_DIR}`);
      } else {
        console.log('Pulling latest changes...');
        execSync(`git -C ${REPO_DIR} pull`);
      }

      // Read the contents of the repository (example: reading all files in a directory)
      const files = fs.readdirSync(REPO_DIR);

      for (const file of files) {
        const filePath = path.join(REPO_DIR, file);
        if (fs.lstatSync(filePath).isFile()) {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          // Compare the file content with MongoDB and update if necessary
          await updateMongoIfChanged(filePath, fileContent);
        }
      }

      res.status(200).send('Webhook processed successfully');
    } catch (err) {
      console.error('Error processing webhook:', err);
      res.status(500).send('Internal Server Error');
    }
  } else {
    res.status(400).send('Unsupported event type');
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook listener running on port ${PORT}`));
