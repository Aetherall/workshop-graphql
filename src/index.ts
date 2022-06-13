import { gql } from "apollo-server-core";
import { makeExecutableSchema } from "@graphql-tools/schema";

import { boot } from "./boot";

const schema = makeExecutableSchema({
  typeDefs: gql`
    type Person {
      name: String! # ! means that this field is required
      age: Int!
    }

    type Query {
      me: Person!
    }
  `,
  resolvers: {},
});

boot(4000, schema);
