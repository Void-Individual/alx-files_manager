import { v4 as uuidV4 } from 'uuid';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const { ObjectId } = require('mongodb');

const crypto = require('crypto');

function hashSHA1(data) {
  const hash = crypto.createHash('sha1');
  hash.update(data);
  return hash.digest('hex');
}

function decodeBase64(base64Data) {
  const base64Header = base64Data.split(' ')[1];
  const data = Buffer.from(base64Header, 'base64').toString('utf8');
  const email = data.split(':')[0];
  let password = data.split(':')[1];
  password = hashSHA1(password);

  return [email, password];
}

async function findOneUser(client, query) {
  try {
    // If the passed query contains id, make it a mongo id object
    if (query._id) {
      const newQuery = query;
      newQuery._id = new ObjectId(query._id);
      const data = await client.db.collection('users').findOne(newQuery);
      return data;
    }
    // FInd the mongo document that matches the search query
    const data = await client.db.collection('users').findOne(query);
    // If it is found, it wil be returned, else return null
    return data;
  } catch (err) {
    console.log('Error finding data:', err.message);
    // If there is an error, return false instead of null
    return false;
  }
}

class AuthController {
  static async getConnect(req, res) {
    try {
      const header = req.header('Authorization');
      const [email, password] = decodeBase64(header);

      const user = await findOneUser(dbClient, { email, password });
      if (!user) {
        res.status(401).send({ error: 'Unauthorized' });
        return;
      }

      const token = uuidV4();
      const key = `auth_${token}`;
      // Set this key to be active for a duration of 24 hours
      await redisClient.set(key, user._id, 86400);
      res.status(200).send({ token });
    } catch (err) {
      console.log('There was an error:', err.message);
      res.status(400).send({ error: 'Error during connection' });
    }
  }

  static async getDisconnect(req, res) {
    try {
      const token = req.header('X-Token');
      const _id = await redisClient.get(`auth_${token}`);
      const user = await findOneUser(dbClient, { _id });
      if (user) {
        await redisClient.del(`auth_${token}`);
        res.status(204).send();
      } else {
        res.status(401).send({ error: 'Unauthorized' });
      }
    } catch (err) {
      console.log('An error occured:', err.message);
      res.status(500).send({ error: 'Error during disconnection' });
    }
  }
}

export default AuthController;
