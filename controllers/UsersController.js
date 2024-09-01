import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const { ObjectId } = require('mongodb');

const crypto = require('crypto');

function hashSHA1(data) {
  const hash = crypto.createHash('sha1');
  hash.update(data);
  return hash.digest('hex');
}

async function findOne(client, query) {
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

class UsersController {
  static async postNew(req, res) {
    const { email } = req.body;
    let { password } = req.body;

    if (!email) {
      res.status(400).send({ error: 'Missing email' });
      return;
    }
    if (!password) {
      res.status(400).send({ error: 'Missing password' });
      return;
    }

    // Check if the email exists
    const check = await findOne(dbClient, { email });
    if (check) {
      res.status(400).send({ error: 'Already exists' });
      return;
    } if (check === false) {
      res.status(400).send({ error: 'An error occured' });
      return;
    }

    password = hashSHA1(password);
    const data = {
      email,
      password,
    };
    const newUser = await dbClient.db.collection('users').insertOne(data);
    const endPointData = {
      email,
      id: newUser.insertedId,
    };

    res.status(201).send(endPointData);
  }
}

class UserController {
  static async getMe(req, res) {
    try {
      const token = req.header('X-Token');
      const _id = await redisClient.get(`auth_${token}`);
      const user = await findOne(dbClient, { _id });
      if (user) {
        const { email } = user;
        res.status(200).send({ id: _id, email });
      } else {
        res.status(401).send({ error: 'Unauthorized' });
        return;
      }
    } catch (err) {
      console.log('An error occured:', err.message);
      res.status(400).send({ error: 'Error during disconnection' });
    }
  }
}

export { UserController, UsersController };
