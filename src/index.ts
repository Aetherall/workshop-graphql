import { gql } from "apollo-server-core";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { PubSub, withFilter } from "graphql-subscriptions";

import { boot } from "./boot";

// Basically an Event Emitter supporting async iteration
// Will be usefull for subscriptions
const pubsub = new PubSub();

class InMemoryStore<A extends { id: string }> {
  storage = new Map<string, A>();

  load(id: string): Promise<A | undefined> {
    return Promise.resolve(this.storage.get(id));
  }

  save(instance: A): Promise<void> {
    this.storage.set(instance.id, instance);
    return Promise.resolve();
  }

  all() {
    return Array.from(this.storage.values());
  }
}

const typeDefs = gql`
  type User {
    id: ID!
    name: String!
    bestie: User
  }

  type Query {
    me: User!
  }

  type Mutation {
    becomeBestie(as: ID!, of: ID!): User
  }
  # type Subscription {}
`;

class User {
  constructor(public id: string, public name: string) {}
  bestFriendId?: string;

  considerBestFriend(friendId: string) {
    this.bestFriendId = friendId;
  }
}

const userStore = new (class UserStore extends InMemoryStore<User> {})();

const bill = new User("1", "Bill");
const jack = new User("2", "Jack");

bill.considerBestFriend(jack.id);
jack.considerBestFriend(bill.id);

userStore.save(bill);
userStore.save(jack);

class ApplicativeError extends Error {
  constructor(message: string) {
    super(`Applicative Error: ${message}`);
  }
}

const schema = makeExecutableSchema({
  typeDefs,
  resolvers: {
    Query: {
      me: () => ({ id: jack.id, name: jack.name }),
    },
    User: {
      bestie: async (parent: { id: string; name: string }) => {
        // Applicative start
        const user = await userStore.load(parent.id);
        if (!user) {
          throw new ApplicativeError(`User ${parent.id} not found`);
        }
        if (!user.bestFriendId) return null;

        const bestie = await userStore.load(user.bestFriendId);
        if (!bestie) {
          throw new ApplicativeError(
            "While retrieving bestie, reference is broken"
          );
        }

        // Applicative end
        return { id: bestie.id, name: bestie.name };
      },
    },
  },
});

boot(4000, schema);
