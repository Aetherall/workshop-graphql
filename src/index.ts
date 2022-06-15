import { gql } from "apollo-server-core";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { PubSub, withFilter } from "graphql-subscriptions";

import { boot } from "./boot";

const pubsub = new PubSub();

abstract class Aggregate {
  abstract id: string;
}

abstract class Entity {
  abstract id: string;
}

abstract class Store<A extends Aggregate> {
  abstract load(id: string): Promise<A | undefined>;
  abstract save(instance: A): Promise<void>;
}

class InMemoryStore<A extends Aggregate> extends Store<A> {
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

/**
 * In this mock kraaft, the domain will be simplified to 2 BC
 * - Authentication = User(id, name) -> { Token[] }
 * - Conversation = Conversation(id, name, members) -> { Message[] }
 *
 * IRL its more than likely the Message will not be an entity but its own aggregate
 */

class ValueObject<T extends string | number> {
  constructor(public readonly value: T) {}

  serialize() {
    return this.value;
  }

  static deserialize<T extends new (...args: any[]) => ValueObject<any>>(
    this: T,
    value: T extends new (...args: any[]) => ValueObject<infer U> ? U : never
  ) {
    return new this(value) as InstanceType<T>;
  }

  static equals<T extends new (...args: any[]) => ValueObject<any>>(
    this: T,
    left: InstanceType<T>,
    right: InstanceType<T>
  ) {
    return left.value === right.value;
  }
}

class Id extends ValueObject<string> {
  static generate<T extends new (...args: any[]) => Id>(this: T) {
    const value = Math.random().toString().substring(2, 8);
    return new this(value) as InstanceType<T>;
  }
}

class UserId extends Id {}
class Password extends ValueObject<string> {}

class Token extends ValueObject<string> {
  static fromPassword(password: Password) {
    return new this(password.value);
  }
}

class Email extends ValueObject<string> {
  constructor(value: string) {
    super(value);

    if (!Email.isValid(value)) {
      throw new Error(`DomainError: Invalid email ${value}`);
    }
  }

  static isValid(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}

class FullName extends ValueObject<string> {}
class ConversationId extends Id {}
class ConversationTitle extends ValueObject<string> {}
class MessageId extends Id {}
class MessageContent extends ValueObject<string> {
  constructor(value: string) {
    super(value);
    if (value.length > 100) {
      throw new Error(
        "DomainError: Message content must be less than 100 characters"
      );
    }
  }
}

class User extends Aggregate {
  constructor(
    public readonly userId: UserId,
    public readonly email: Email,
    public readonly password: Password, // dont mind the password in clear, not tryna be secure
    public readonly name: FullName
  ) {
    super();
  }

  static new(email: Email, password: Password, name: FullName) {
    return new this(UserId.generate(), email, password, name);
  }

  hasToken(token: Token) {
    return this.password.value === token.value;
  }

  authenticate(password: Password) {
    console.log(password, this.password);
    if (Password.equals(this.password, password)) {
      return Token.fromPassword(password);
    } else {
      throw new Error("DomainError: Invalid password");
    }
  }

  get id() {
    return this.name.toString();
  }
}

class Message extends Entity {
  constructor(
    public readonly messageId: MessageId,
    public readonly author: UserId,
    public readonly content: MessageContent
  ) {
    super();
  }

  static redact(author: UserId, content: MessageContent) {
    return new this(MessageId.generate(), author, content);
  }

  get id() {
    return this.messageId.toString();
  }
}

class Conversation extends Aggregate {
  constructor(
    public readonly conversationId: ConversationId,
    public title: ConversationTitle,
    public readonly members: UserId[],
    public readonly messages: Message[]
  ) {
    super();
  }

  publishMessage(author: UserId, content: MessageContent) {
    const message = Message.redact(author, content);
    this.messages.push(message);
  }

  addMember(userId: UserId) {
    this.members.push(userId);
  }

  get id() {
    return this.conversationId.serialize();
  }
}

const userStore = new (class extends InMemoryStore<User> {
  loadByEmail(email: Email) {
    return this.all().find(
      (user) => user.email.serialize() === email.serialize()
    );
  }

  loadByToken(token: Token) {
    return this.all().find((user) => user.hasToken(token));
  }
})();
const conversationStore = new InMemoryStore<Conversation>();

interface Context {
  token?: string;
  setToken(token: string): void;
  clearToken(): void;
}

interface LogInArgs {
  email: string;
  password: string;
}

interface SignUpArgs {
  email: string;
  password: string;
  name: string;
}

const schema = makeExecutableSchema({
  typeDefs: gql`
    type User {
      id: ID!
      name: String!
    }

    # type Message {
    #   id: ID
    #   content: String!
    #   author: User!
    # }

    # type Conversation {
    #   id: ID!
    #   title: String!
    #   members: [User!]!
    # }

    type Mutation {
      logIn(email: String!, password: String!): User!
      signUp(email: String!, password: String!, name: String!): User!
      logOut: Boolean!
    }

    type Query {
      me: User!
      # conversations: [Conversation!]!
    }
  `,
  resolvers: {
    Query: {
      me: (parent, params, context: Context, info) => {
        const token = context.token as string;
        if (!token) {
          throw new Error("Applicative Error: Not logged in");
        }
        const user = userStore.loadByToken(Token.deserialize(token));
        if (!user) {
          throw new Error("Applicative Error: Unknown token");
        }
        return { id: user.userId.serialize(), name: user.name.serialize() };
      },
    },
    Mutation: {
      logIn: async (parent, params: LogInArgs, context: Context, info) => {
        const { email, password } = params;
        const user = await userStore.loadByEmail(Email.deserialize(email));
        if (!user) {
          throw new Error("Applicative Error: User not found");
        }

        const token = user.authenticate(Password.deserialize(password));

        context.setToken(token.serialize());
        return { id: user.userId.serialize(), name: user.name.serialize() };
      },
      signUp: async (parent, params: SignUpArgs, context, info) => {
        const { name, email, password } = params;
        const { setToken } = context;
        const existingUser = await userStore.load(name);
        if (existingUser) {
          throw new Error("Applicative Error: User already exists");
        }

        const user = User.new(
          Email.deserialize(email),
          Password.deserialize(password),
          FullName.deserialize(name)
        );

        await userStore.save(user);

        const token = user.authenticate(Password.deserialize(password));
        setToken(token.serialize());

        return {
          id: user.userId.serialize(),
          name: user.name.serialize(),
        };
      },
      logOut: (parent, params, context, info) => {
        context.clearToken();
        return true;
      },
    },
  },
});

boot(4000, schema);
