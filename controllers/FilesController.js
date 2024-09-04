import { v4 as uuidV4 } from 'uuid';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');

async function findOneUser(client, query) {
  try {
    const newQuery = query;
    // If the passed query contains id, make it a mongo id object
    if (query._id) {
      newQuery._id = new ObjectId(query._id);
    }
    // FInd the mongo document that matches the search query
    const data = await client.db.collection('users').findOne(newQuery);
    // If it is found, it wil be returned, else return null
    return data;
  } catch (err) {
    console.log('Error finding data:', err.message);
    // If there is an error, return false instead of null
    return false;
  }
}

async function findOneFile(client, query) {
  try {
    const newQuery = query;
    // If the passed query contains id, make it a mongo id object
    if (query._id) {
      newQuery._id = new ObjectId(query._id);
    }
    // FInd the mongo document that matches the search query
    const data = await client.db.collection('files').findOne(newQuery);
    // If it is found, it wil be returned, else return null
    return data;
  } catch (err) {
    console.log('Error finding data:', err.message);
    // If there is an error, return false instead of null
    return false;
  }
}

async function findAllFiles(client, query, page) {
  try {
    const newQuery = query;
    // If the passed query contains id, make it a mongo id object
    if (query._id) {
      newQuery._id = new ObjectId(query._id);
    }

    // Create a pipeline to paass through the aggregate call
    const pipeline = [
      // Include the search query in this prompt
      { $match: newQuery },
      // Skip the documents from the previous pages
      { $skip: page * 20 },
      // Set a limit to the number of files per page
      { $limit: 20 },
    ];

    // FInd the mongo documents that match the search query
    const data = await client.db.collection('files').aggregate(pipeline).toArray();

    // If it is found, it wil be returned, else return null
    return data;
  } catch (err) {
    console.log('Error finding data:', err.message);
    // If there is an error, return false instead of null
    return false;
  }
}

function decodeBase64Data(base64Data) {
  const data = Buffer.from(base64Data, 'base64').toString('utf8');
  return data;
}

function checkLocalPath() {
  // Check if the path already exists
  const path = process.env.FOLDER_PATH || '/tmp/files_manager';

  if (!fs.existsSync(path)) {
    fs.mkdirSync(path, { recursive: true });
  }

  return path;
}

async function createNewFolder(client, fileData) {
  try {
    const folder = await client.db.collection('files').insertOne(fileData);
    console.log('Created new folder');
    return folder.ops[0]; // This will return the created folder document
  } catch (err) {
    console.log('Error creating new folder', err.message);
    return null;
  }
}

class FilesController {
  static async postUpload(req, res) {
    try {
      const token = req.header('X-Token');
      const _id = await redisClient.get(`auth_${token}`);
      const user = await findOneUser(dbClient, { _id });

      if (!user) {
        res.status(401).send({ error: 'Unauthorized' });
        return;
      }
      const acceptedTypes = ['folder', 'file', 'image'];
      const {
        name, type, parentId, isPublic, data,
      } = req.body;

      if (!name) {
        res.status(400).send({ error: 'Missing name' });
        return;
      }

      if (!acceptedTypes.includes(type)) {
        res.status(400).send({ error: 'Missing type' });
        return;
      }

      if (!data && type !== 'folder') {
        res.status(400).send({ error: 'Missing data' });
        return;
      }

      let openFolder = '';
      if (parentId) {
        openFolder = await findOneFile(dbClient, { _id: parentId });
        if (!openFolder) {
          res.status(400).send({ error: 'Parent not found' });
          return;
        }

        if (openFolder.type !== 'folder') {
          res.status(400).send({ error: 'Parent is not a folder' });
          return;
        }
      }

      if (type === 'folder') {
        const newFolder = await createNewFolder(dbClient, {
          userId: _id,
          name,
          type,
          isPublic: isPublic || false,
          parentId: parentId || 0,
        });
        newFolder.id = newFolder._id;
        delete newFolder._id;
        res.status(201).send(newFolder);
        return;
      }
      const folderPath = checkLocalPath();
      const fileName = `${uuidV4()}`;
      const filePath = path.join(folderPath, fileName);

      const decodedData = decodeBase64Data(data);
      fs.writeFileSync(filePath, decodedData);

      const saveData = {
        userId: _id,
        name,
        type,
        isPublic: isPublic || false,
        parentId: parentId || 0,
        localPath: filePath,
      };

      const newFile = await dbClient.db.collection('files').insertOne(saveData);
      const endPointData = {
        id: newFile.insertedId,
        userId: _id,
        name,
        type,
        isPublic: isPublic || false,
        parentId: parentId || 0,
      };
      res.status(201).send(endPointData);
    } catch (err) {
      console.log('An error occured:', err.message);
      res.status(400).send({ error: 'Error during upload' });
    }
  }

  static async getShow(req, res) {
    try {
      console.log('Running getShow');
      const token = req.header('X-Token');
      const _id = await redisClient.get(`auth_${token}`);
      const user = await findOneUser(dbClient, { _id });

      if (!user) {
        res.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const fileId = req.params.id;
      const file = await findOneFile(dbClient, { userId: _id, _id: fileId });
      if (file) {
        file.id = file._id;
        delete file._id;
        res.send(file);
      } else {
        res.status(404).send({ error: 'Not found' });
      }
    } catch (err) {
      console.log('An error occured:', err.message);
      res.status(400).send({ error: 'Error during upload' });
    }
  }

  static async getIndex(req, res) {
    console.log('Running index');
    try {
      const token = req.header('X-Token');
      const _id = await redisClient.get(`auth_${token}`);
      const user = await findOneUser(dbClient, { _id });

      if (!user) {
        res.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const parentId = req.query.parentId || 0;
      const page = req.query.page || 0;

      const parentFiles = await findAllFiles(dbClient, { parentId }, page);
      if (parentFiles) {
        const fixedFiles = [];
        for (const files of parentFiles) {
          files.id = files._id;
          delete files._id;
          fixedFiles.push(files);
        }
        res.send(fixedFiles);
      } else {
        res.send([]);
      }
    } catch (err) {
      console.log('An error occured:', err.message);
      res.status(400).send({ error: 'Error during upload' });
    }
  }

  static async putPublish(req, res) {
    try {
      console.log('Running getShow');
      const token = req.header('X-Token');
      const _id = await redisClient.get(`auth_${token}`);
      const user = await findOneUser(dbClient, { _id });

      if (!user) {
        res.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const fileId = req.params.id;
      const file = await findOneFile(dbClient, { userId: _id, _id: fileId });
      if (file) {
        res.send(file);
      } else {
        res.status(404).send({ error: 'Not found' });
      }
    } catch (err) {
      console.log('An error occured:', err.message);
      res.status(400).send({ error: 'Error during upload' });
    }
  }

  static async putUnpublish(req, res) {
    try {
      console.log('Running getShow');
      const token = req.header('X-Token');
      const _id = await redisClient.get(`auth_${token}`);
      const user = await findOneUser(dbClient, { _id });

      if (!user) {
        res.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const fileId = req.params.id;
      const file = await findOneFile(dbClient, { userId: _id, _id: fileId });
      if (file) {
        res.send(file);
      } else {
        res.status(404).send({ error: 'Not found' });
      }
    } catch (err) {
      console.log('An error occured:', err.message);
      res.status(400).send({ error: 'Error during upload' });
    }
  }
}

export default FilesController;
