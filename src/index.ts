import { gql } from "apollo-server-core";
import { makeExecutableSchema } from "@graphql-tools/schema";

import { boot } from "./boot";

const me = { name: "John", age: 30 };

const schema = makeExecutableSchema({
  typeDefs: gql`
    type Person {
      name: String! # ! means that this field is required
      age: Int!
      nameLength: Int!
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
      age: () => 20,
      nameLength: (parent) => parent.name.length, // here parent is "me" because "me" is the Person I resolved for the query
    },
  },
});

boot(4000, schema);
