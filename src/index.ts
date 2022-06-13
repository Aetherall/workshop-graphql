import { gql } from "apollo-server-core";
import { makeExecutableSchema } from "@graphql-tools/schema";

import { boot } from "./boot";

const me = { name: "John", age: 30 };

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
  resolvers: {
    Query: {
      me: () => me,
    },
    Person: {
      age: () => 20, // overrided by the resolver
    },
  },
});

boot(4000, schema);
