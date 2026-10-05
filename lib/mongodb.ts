import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set — copy .env.example to .env.local and fill it in.");

// Module-level singleton, reused across hot-reloads via globalThis.
const globalForMongo = globalThis as unknown as { mongoClient?: MongoClient };

export const mongoClient = globalForMongo.mongoClient ?? new MongoClient(uri);
if (process.env.NODE_ENV !== "production") globalForMongo.mongoClient = mongoClient;

export const mongoDb = mongoClient.db();
