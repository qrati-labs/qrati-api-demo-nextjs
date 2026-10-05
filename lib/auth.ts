import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { mongoClient, mongoDb } from "./mongodb";

export const auth = betterAuth({
  database: mongodbAdapter(mongoDb, { client: mongoClient }),
  emailAndPassword: { enabled: true },
  // Email/password only: the demo just needs an identity to send to Qrati as uid/fname/lname.
});
