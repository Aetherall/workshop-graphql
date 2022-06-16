import { gql } from "apollo-server-core";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { PubSub, withFilter } from "graphql-subscriptions";

import { boot } from "./boot";

// Basically an Event Emitter supporting async iteration
// Will be usefull for subscriptions
const pubsub = new PubSub();

const typeDefs = gql`
  type User {
    id: ID!
    name: String!
  }

  type Query {
    me: User
  }
  # type Mutation {}
  # type Subscription {}
`;

const schema = makeExecutableSchema({
  typeDefs,
  resolvers: {},
});

boot(4000, schema);
