const express = require('express');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: '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' });
const app = express();
app.use(express.json()); // Parse incoming JSON payloads

const MONGO_URI = 'mongodb+srv://Nidhish:Nidhish@coephackathon.pbuvv.mongodb.net/mytestdb?retryWrites=true&w=majority&appName=CoepHackathon';
const DB_NAME = 'mytestdb';
const REPO_DIR = './testdir'; // Directory to clone the repo
const REPOSITORY_NAME = 'test-repo-utilitysearch'; // Specify the repository name

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
        const list_descp_tags = await groqmain(newContent);
        await delay(5000);
        await collection.updateOne(
          { file_path: filePath },
          {
            $set: {
              code_snippet: newContent,  // Update code_snippet with new content
              fullplot: list_descp_tags[0], // You can update fullplot if needed
              tags: list_descp_tags[1] // Update tags if required
            }
          }
        );
      } else {
        console.log(`No changes detected for ${filePath}`);
      }
    } else {
      console.log(`Inserting new data for ${filePath}`);
      // Insert the new document
      const list_descp_tags = await groqmain(newContent);
      await delay(5000);
      await collection.insertOne({
        repository: REPOSITORY_NAME,
        file_path: filePath,
        code_snippet: newContent, // File content goes here
        fullplot: list_descp_tags[0], // Add a description or plot
        tags: list_descp_tags[1] // Add relevant tags
      });
    }
  } finally {
    await client.close();
  }
}

app.get('/get', async (req, res) => {
  res.status(200).send('success');
});

app.post('/webhook', async (req, res) => {
  const payload = req.body;

  // Optionally, verify the event type
  if (req.headers['x-github-event'] === 'push') {
    console.log('Push event received');

    // Pull the latest changes from the repository
    try {
      if (!fs.existsSync(REPO_DIR)) {
        console.log('Cloning repository...');
        execSync(`git clone https://github.com/nio2004/${REPOSITORY_NAME}.git ${REPO_DIR}`);
      } else {
        console.log('Pulling latest changes...');
        execSync(`git -C ${REPO_DIR} pull`);
      }

      // Traverse the repository directory and process each file
      await traverseDirectory(REPO_DIR);

      res.status(200).send('Webhook processed successfully');
    } catch (err) {
      console.error('Error processing webhook:', err);
      res.status(500).send('Internal Server Error');
    }
  } else {
    res.status(400).send('Unsupported event type');
  }
});

async function traverseDirectory(directoryPath) {
  // Read the contents of the current directory
  const files = fs.readdirSync(directoryPath);

  // Iterate through each file/directory in the current directory
  for (const file of files) {
    const filePath = path.join(directoryPath, file);

    // Skip hidden directories (like .git) and files
    if (file.startsWith('.')) {
      console.log(`Skipping hidden directory or file: ${file}`);
      continue;
    }

    // Check if it is a directory or a file
    if (fs.lstatSync(filePath).isDirectory()) {
      // If it's a directory, recursively traverse it
      await traverseDirectory(filePath);
    } else if (fs.lstatSync(filePath).isFile()) {
      // If it's a file, read the file content and process it
      const fileContent = fs.readFileSync(filePath, 'utf8');
      // Call your function to update MongoDB if needed
      await updateMongoIfChanged(filePath, fileContent);
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function groqmain(code) {
  const descriptionCompletion = await getGroqChatCompletion(
    `You are a helpful coding assistant that supports in analysing code and generating a description of that code in one sentence. Just write description about code. User Query: ${code}`
  );

  const tagsCompletion = await getGroqChatCompletion(
    `You are a helpful coding assistant that supports in analysing code and generating technical tags. Just write technical tags in list about code. User Query: ${code}`
  );

  return [descriptionCompletion.choices[0]?.message?.content || "", tagsCompletion.choices[0]?.message?.content || ""];
}

async function getGroqChatCompletion(userMessage) {
  return groq.chat.completions.create({
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
    model: "mixtral-8x7b-32768",
  });
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook listener running on port ${PORT}`));
